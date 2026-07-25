#!/usr/bin/env node
/**
 * Local visual validation harness.
 *
 * Boots the web app (or reuses a dev server already running on :5173),
 * drives it with headless Chromium, and fails on console errors, page
 * crashes, or failed requests. Screenshots are written to harness/artifacts/
 * so agents (and humans) can visually inspect every checked route.
 *
 * Usage: node harness/validate-local.mjs [--route /extra-route]...
 * Exit codes: 0 = all routes pass, 1 = validation failures, 2 = harness could not run.
 */
import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = resolve(ROOT, 'harness/artifacts');
const WEB_URL = 'http://localhost:5173';
const DEFAULT_ROUTES = ['/', '/login'];
const BOOT_TIMEOUT_MS = 60_000;

const extraRoutes = process.argv
  .flatMap((a, i, all) => (a === '--route' && all[i + 1] ? [all[i + 1]] : []));
const routes = [...new Set([...DEFAULT_ROUTES, ...extraRoutes])];

async function isUp(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function bootDevServer() {
  console.log('… no server on :5173 — booting web dev server');
  const child = spawn('pnpm', ['--filter', '@morpheus/web', 'dev'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await isUp(WEB_URL)) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {}
  throw new Error(
    `web dev server did not become ready on ${WEB_URL} within ${BOOT_TIMEOUT_MS / 1000}s. ` +
      'Remediation: run `pnpm dev` manually and read its output for startup errors.',
  );
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.error(
      'FAIL harness: playwright is not installed. Remediation: run `pnpm install`, then `pnpm exec playwright install chromium`.',
    );
    process.exit(2);
  }

  mkdirSync(ARTIFACTS, { recursive: true });

  const reusedServer = await isUp(WEB_URL);
  const server = reusedServer ? null : await bootDevServer();
  console.log(`✓ web app is up at ${WEB_URL} (${reusedServer ? 'reused running server' : 'booted by harness'})`);

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.error(
      `FAIL harness: could not launch Chromium (${err.message}). ` +
        'Remediation: run `pnpm exec playwright install chromium`.',
    );
    process.exit(2);
  }

  const failures = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    for (const route of routes) {
      const problems = [];
      const onConsole = (msg) => {
        if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
      };
      const onPageError = (err) => problems.push(`uncaught page error: ${err.message}`);
      const onRequestFailed = (req) => {
        // Aborted requests (e.g. HMR reconnects) are noise, not failures
        if (req.failure()?.errorText !== 'net::ERR_ABORTED') {
          problems.push(`request failed: ${req.method()} ${req.url()} (${req.failure()?.errorText})`);
        }
      };
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      page.on('requestfailed', onRequestFailed);

      const slug = route === '/' ? 'home' : route.replace(/\W+/g, '-').replace(/^-|-$/g, '');
      const shot = resolve(ARTIFACTS, `local-${slug}.png`);
      try {
        const res = await page.goto(WEB_URL + route, { waitUntil: 'networkidle', timeout: 15_000 });
        if (!res || !res.ok()) problems.push(`HTTP ${res?.status() ?? 'no response'} for ${route}`);
        // A React app that crashed renders an empty #root — the blank-page class of bugs
        const rootContent = await page.evaluate(
          () => document.getElementById('root')?.innerHTML.trim() ?? '',
        );
        if (rootContent === '') {
          problems.push(
            'blank page: #root is empty. The JS bundle likely threw at startup — check the console errors above.',
          );
        }
        await page.screenshot({ path: shot, fullPage: true });
      } catch (err) {
        problems.push(`navigation failed: ${err.message}`);
      }

      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('requestfailed', onRequestFailed);

      if (problems.length === 0) {
        console.log(`PASS ${route}  → screenshot: ${shot}`);
      } else {
        console.log(`FAIL ${route}  → screenshot: ${shot}`);
        for (const p of problems) console.log(`     - ${p}`);
        failures.push({ route, problems });
      }
    }
  } finally {
    await browser.close();
    if (server) {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {}
    }
  }

  console.log(
    failures.length === 0
      ? `\n✓ local validation passed (${routes.length} routes). Inspect screenshots in harness/artifacts/ to confirm visuals.`
      : `\n✗ local validation failed on ${failures.length}/${routes.length} routes. Fix the issues above, then re-run: pnpm validate:local`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL harness: ${err.message}`);
  process.exit(2);
});
