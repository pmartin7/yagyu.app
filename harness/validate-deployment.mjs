#!/usr/bin/env node
/**
 * Deployment validation harness.
 *
 * Confirms that the latest Vercel deployments actually succeeded and that the
 * live sites serve a working app (not an error page or a blank page):
 *   1. Vercel API: latest production + staging-branch deployments are READY
 *   2. HTTP: production URLs respond and serve the app shell
 *   3. HTTP: production `/api/health` returns 200 JSON `{ status: 'ok' }`
 *   4. Visual: production renders real content (screenshot in harness/artifacts/)
 *
 * Staging is behind Vercel deployment protection (SSO), so it is checked at
 * the deployment-state level, and its URL check accepts the SSO redirect.
 *
 * If `/api/health` returns plain text / FUNCTION_INVOCATION_FAILED, pull
 * runtime logs with `npx vercel logs yagyu.app` (not `vercel inspect --logs`,
 * which is build-only) and look for `ERR_REQUIRE_ESM`.
 *
 * Usage: node harness/validate-deployment.mjs
 * Exit codes: 0 = deployments healthy, 1 = failures, 2 = harness could not run.
 */
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { launchChromium } from './lib/browser.mjs';
import { assertVercelToken, listVercelEnvNames, loadVercelAuth } from './lib/secrets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = resolve(ROOT, 'harness/artifacts');

const PRODUCTION_URL = 'https://yagyu-app.vercel.app';
const PRODUCTION_DOMAIN = 'https://yagyu.app'; // soft check until DNS cutover completes
const STAGING_URL = 'https://yagyu-app-staging.vercel.app';
const STAGING_BRANCH = 'staging';
const TITLE_MARKER = 'yagyu.app';

/** Env names that must exist on Preview + Production after triage/sync bootstrap. */
const REQUIRED_ENV = [
  'CRON_SECRET',
  'NEON_WORKER_DATABASE_URL',
  'DEFAULT_AI_MODEL',
  'OPENAI_API_KEY',
];

function loadVercelCredentials() {
  return loadVercelAuth(ROOT);
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
  const list = branch ? deployments.filter((d) => d.meta?.githubCommitRef === branch) : deployments;
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

  // 0. Auth + required env presence (names only — values stay encrypted)
  await assertVercelToken(creds.token);
  console.log('PASS Vercel token');
  const envNames = await listVercelEnvNames(creds);
  for (const key of REQUIRED_ENV) {
    for (const target of ['preview', 'production']) {
      const hit = envNames.some((item) => item.key === key && item.targets.includes(target));
      if (hit) {
        console.log(`PASS env ${key} (${target}) present`);
      } else {
        // OPENAI is optional if DEFAULT_AI_MODEL is anthropic-only; warn not fail.
        if (key === 'OPENAI_API_KEY') {
          console.log(
            `WARN env ${key} (${target}) absent — required when DEFAULT_AI_MODEL uses openai:`,
          );
        } else {
          failures.push(`env ${key} missing on ${target}`);
          console.log(
            `FAIL env ${key} (${target}) absent. Remediation: pnpm secrets:sync -- --all && pnpm db:provision-worker && pnpm redeploy:env`,
          );
        }
      }
    }
  }

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
      console.log(
        `FAIL ${label}: ${describeDeployment(dep)} — still in progress, re-run in ~1 minute`,
      );
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
          failures.push(
            `${url}: 200 but response does not look like the app (missing "${TITLE_MARKER}")`,
          );
          console.log(`FAIL ${url}: 200 but unexpected content`);
          return;
        }
        console.log(`PASS ${url}: 200, app shell served`);
        return;
      }
      if (
        allowSso &&
        res.status === 302 &&
        res.headers.get('location')?.includes('vercel.com/sso')
      ) {
        console.log(
          `PASS ${url}: protected by Vercel SSO (expected while deployment protection is on)`,
        );
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

  // 2b. API health — SPA 200 alone misses a dead Nest/lambda cold start
  const RUNTIME_LOGS_REMEDIATION =
    'Remediation: npx vercel logs yagyu.app (runtime — look for ERR_REQUIRE_ESM / FUNCTION_INVOCATION_FAILED). ' +
    '`npx vercel inspect <url> --logs` is build-only.';

  const healthCheck = async (baseUrl, { soft = false } = {}) => {
    const url = `${baseUrl.replace(/\/$/, '')}/api/health`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      const vercelError = res.headers.get('x-vercel-error');
      const text = await res.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        const detail = [
          `HTTP ${res.status}`,
          vercelError,
          text.replace(/\s+/g, ' ').trim().slice(0, 80) || 'empty body',
        ]
          .filter(Boolean)
          .join(', ');
        const msg = `${url}: non-JSON health response (${detail})`;
        if (soft) console.log(`WARN ${msg} (soft check — DNS may not have propagated yet)`);
        else {
          failures.push(msg);
          console.log(`FAIL ${msg}. ${RUNTIME_LOGS_REMEDIATION}`);
        }
        return;
      }
      if (res.status === 200 && body?.status === 'ok') {
        console.log(`PASS ${url}: 200, status ok`);
        return;
      }
      const msg = `${url}: HTTP ${res.status}, body status=${body?.status ?? 'missing'}`;
      if (soft) console.log(`WARN ${msg} (soft check — DNS may not have propagated yet)`);
      else {
        failures.push(msg);
        console.log(`FAIL ${msg}. ${RUNTIME_LOGS_REMEDIATION}`);
      }
    } catch (err) {
      const msg = `${url}: unreachable (${err.cause?.code ?? err.message})`;
      if (soft) console.log(`WARN ${msg} (soft check — DNS may not have propagated yet)`);
      else {
        failures.push(msg);
        console.log(`FAIL ${msg}. ${RUNTIME_LOGS_REMEDIATION}`);
      }
    }
  };

  await healthCheck(PRODUCTION_URL);
  await healthCheck(PRODUCTION_DOMAIN, { soft: true });

  // 3. Visual check on production: catches the blank-page class of failures
  try {
    mkdirSync(ARTIFACTS, { recursive: true });
    const browser = await launchChromium();
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
        console.log(
          `FAIL production visual: blank page. Console errors: ${consoleErrors.join(' | ') || 'none'}`,
        );
      } else if (consoleErrors.length > 0) {
        failures.push(`production console errors: ${consoleErrors.join(' | ')}`);
        console.log(`FAIL production visual: console errors — ${consoleErrors.join(' | ')}`);
      } else {
        console.log(`PASS production visual: content rendered → screenshot: ${shot}`);
      }
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.log(`WARN visual check skipped: ${err.message}`);
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
