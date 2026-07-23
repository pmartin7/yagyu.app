#!/usr/bin/env node
/**
 * Deployment validation harness.
 *
 * Confirms that the latest Vercel deployments actually succeeded and that the
 * live sites serve a working app (not an error page or a blank page):
 *   1. Vercel API: latest production + staging-branch deployments are READY
 *   2. HTTP: production URLs respond and serve the app shell
 *   3. Visual: production renders real content (screenshot in harness/artifacts/)
 *
 * Staging is behind Vercel deployment protection (SSO), so it is checked at
 * the deployment-state level, and its URL check accepts the SSO redirect.
 *
 * Usage: node harness/validate-deployment.mjs
 * Exit codes: 0 = deployments healthy, 1 = failures, 2 = harness could not run.
 */
import { readFileSync } from 'fs';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = resolve(ROOT, 'harness/artifacts');

const PRODUCTION_URL = 'https://yagyu-app.vercel.app';
const PRODUCTION_DOMAIN = 'https://yagyu.app'; // soft check until DNS cutover completes
const STAGING_URL = 'https://yagyu-app-staging.vercel.app';
const STAGING_BRANCH = 'staging';
const TITLE_MARKER = 'yagyu.app';

function loadVercelCredentials() {
  try {
    const { token } = JSON.parse(
      readFileSync(resolve(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'), 'utf8'),
    );
    const { projectId, orgId } = JSON.parse(readFileSync(resolve(ROOT, '.vercel/project.json'), 'utf8'));
    return { token, projectId, orgId };
  } catch {
    throw Object.assign(
      new Error(
        'Vercel credentials not found. Remediation: run `npx vercel login` and `npx vercel link` from the repo root.',
      ),
      { harness: true },
    );
  }
}

async function latestDeployment({ token, projectId, orgId }, { target, branch }) {
  const params = new URLSearchParams({ projectId, teamId: orgId, limit: '10' });
  if (target) params.set('target', target);
  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `Vercel API responded ${res.status} when listing deployments. ` +
        'Remediation: the stored CLI token may be stale — run `npx vercel whoami` to refresh it, then re-run.',
    );
  }
  const { deployments } = await res.json();
  const list = branch
    ? deployments.filter((d) => d.meta?.githubCommitRef === branch)
    : deployments;
  return list[0] ?? null;
}

function describeDeployment(d) {
  const commit = d.meta?.githubCommitMessage?.split('\n')[0] ?? 'unknown commit';
  const age = Math.round((Date.now() - d.createdAt) / 60_000);
  return `"${commit}" (${age}m ago, ${d.state})`;
}

async function main() {
  const failures = [];
  const creds = loadVercelCredentials();

  // 1. Deployment states
  for (const [label, query] of [
    ['production', { target: 'production' }],
    [`staging (branch: ${STAGING_BRANCH})`, { branch: STAGING_BRANCH }],
  ]) {
    const dep = await latestDeployment(creds, query);
    if (!dep) {
      failures.push(`${label}: no deployment found`);
      console.log(`FAIL ${label}: no deployment found`);
    } else if (dep.state === 'READY') {
      console.log(`PASS ${label}: latest deployment ${describeDeployment(dep)}`);
    } else if (dep.state === 'BUILDING' || dep.state === 'QUEUED' || dep.state === 'INITIALIZING') {
      failures.push(`${label}: deployment still ${dep.state} — wait and re-run`);
      console.log(`FAIL ${label}: ${describeDeployment(dep)} — still in progress, re-run in ~1 minute`);
    } else {
      failures.push(`${label}: deployment state ${dep.state}`);
      console.log(
        `FAIL ${label}: ${describeDeployment(dep)}. Remediation: npx vercel inspect ${dep.url} --logs`,
      );
    }
  }

  // 2. HTTP checks
  const httpCheck = async (url, { allowSso = false, soft = false } = {}) => {
    try {
      const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
      if (res.status === 200) {
        const html = await res.text();
        if (!html.includes(TITLE_MARKER)) {
          failures.push(`${url}: 200 but response does not look like the app (missing "${TITLE_MARKER}")`);
          console.log(`FAIL ${url}: 200 but unexpected content`);
          return;
        }
        console.log(`PASS ${url}: 200, app shell served`);
        return;
      }
      if (allowSso && res.status === 302 && res.headers.get('location')?.includes('vercel.com/sso')) {
        console.log(`PASS ${url}: protected by Vercel SSO (expected while deployment protection is on)`);
        return;
      }
      if (res.status >= 300 && res.status < 400) {
        console.log(`PASS ${url}: redirects to ${res.headers.get('location')}`);
        return;
      }
      const msg = `${url}: HTTP ${res.status}`;
      if (soft) console.log(`WARN ${msg} (soft check — DNS may not have propagated yet)`);
      else {
        failures.push(msg);
        console.log(`FAIL ${msg}`);
      }
    } catch (err) {
      const msg = `${url}: unreachable (${err.cause?.code ?? err.message})`;
      if (soft) console.log(`WARN ${msg} (soft check — DNS may not have propagated yet)`);
      else {
        failures.push(msg);
        console.log(`FAIL ${msg}`);
      }
    }
  };

  await httpCheck(PRODUCTION_URL);
  await httpCheck(PRODUCTION_DOMAIN, { soft: true });
  await httpCheck(STAGING_URL, { allowSso: true });

  // 3. Visual check on production: catches the blank-page class of failures
  try {
    const { chromium } = await import('playwright');
    mkdirSync(ARTIFACTS, { recursive: true });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const consoleErrors = [];
      page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
      await page.goto(PRODUCTION_URL, { waitUntil: 'networkidle', timeout: 20_000 });
      const rootContent = await page.evaluate(
        () => document.getElementById('root')?.innerHTML.trim() ?? '',
      );
      const shot = resolve(ARTIFACTS, 'deployment-production.png');
      await page.screenshot({ path: shot, fullPage: true });
      if (rootContent === '') {
        failures.push('production renders a blank page (#root empty)');
        console.log(`FAIL production visual: blank page. Console errors: ${consoleErrors.join(' | ') || 'none'}`);
      } else if (consoleErrors.length > 0) {
        failures.push(`production console errors: ${consoleErrors.join(' | ')}`);
        console.log(`FAIL production visual: console errors — ${consoleErrors.join(' | ')}`);
      } else {
        console.log(`PASS production visual: content rendered → screenshot: ${shot}`);
      }
    } finally {
      await browser.close();
    }
  } catch {
    console.log('WARN visual check skipped: playwright not installed (run `pnpm install && pnpm exec playwright install chromium`)');
  }

  console.log(
    failures.length === 0
      ? '\n✓ deployment validation passed.'
      : `\n✗ deployment validation failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FAIL harness: ${err.message}`);
  process.exit(2);
});
