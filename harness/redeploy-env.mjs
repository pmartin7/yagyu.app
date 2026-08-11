#!/usr/bin/env node
/**
 * Redeploy the latest Production and Preview deployments so newly set Vercel
 * environment variables take effect (env edits do not refresh running deploys).
 *
 * Usage: node harness/redeploy-env.mjs
 * Exit: 0 = both redeployed, 1 = failure, 2 = harness error.
 */
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertVercelToken, loadVercelAuth } from './lib/secrets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function latestUrls(creds) {
  const params = new URLSearchParams({
    projectId: creds.projectId,
    teamId: creds.orgId,
    limit: '20',
  });
  const res = await fetch(`https://api.vercel.com/v6/deployments?${params}`, {
    headers: { Authorization: `Bearer ${creds.token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Vercel deployments list failed (HTTP ${res.status})`);
  }
  const { deployments } = await res.json();
  const production = deployments.find((item) => item.target === 'production');
  const preview = deployments.find((item) => item.target !== 'production' || item.target == null);
  // Prefer explicit preview/staging branch when present
  const stagingPreview =
    deployments.find((item) => item.meta?.githubCommitRef === 'staging') ?? preview;
  return {
    production: production ? `https://${production.url}` : null,
    preview: stagingPreview ? `https://${stagingPreview.url}` : null,
  };
}

function redeploy(url) {
  console.log(`INFO redeploying ${url}`);
  const result = spawnSync('npx', ['--yes', 'vercel@41.7.0', 'redeploy', url], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  if (result.status !== 0) {
    throw new Error(`redeploy failed for ${url}: ${(result.stderr || result.stdout || '').trim()}`);
  }
  const out = `${result.stdout}\n${result.stderr}`;
  const match = out.match(/https:\/\/yagyu-[a-z0-9-]+\.vercel\.app/);
  console.log(`PASS redeployed → ${match?.[0] ?? 'ok'}`);
}

async function main() {
  const creds = loadVercelAuth(ROOT);
  await assertVercelToken(creds.token);
  console.log('PASS Vercel token');
  const urls = await latestUrls(creds);
  if (!urls.production) throw new Error('No production deployment found to redeploy');
  if (!urls.preview) throw new Error('No preview/staging deployment found to redeploy');
  redeploy(urls.production);
  redeploy(urls.preview);
  console.log('\n✓ env redeploy complete');
}

main().catch((error) => {
  console.error(`FAIL harness: ${error.message}`);
  process.exit(error.harness ? 2 : 1);
});
