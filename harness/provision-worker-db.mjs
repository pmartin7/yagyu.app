#!/usr/bin/env node
/**
 * Provision `worker_user` login + NEON_WORKER_DATABASE_URL for Neon branches.
 *
 * The migration creates `worker_user` as NOLOGIN. This harness:
 *   1. Generates/stores a per-branch password in Keychain
 *   2. ALTER ROLE … LOGIN PASSWORD on each branch (as neondb_owner via neon CLI)
 *   3. Verifies a worker connection
 *   4. Writes local `.env` (dev direct) and Vercel Preview/Production (pooled)
 *
 * Prerequisites: `neon` CLI authenticated, `.neon` linked, migration applied,
 * `pg` available (root devDependency), Vercel linked for --vercel writes.
 *
 * Usage:
 *   node harness/provision-worker-db.mjs
 *   node harness/provision-worker-db.mjs --check
 *   node harness/provision-worker-db.mjs --branch dev
 *
 * Exit: 0 = ok, 1 = failure, 2 = harness could not run.
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import {
  buildRoleConnectionString,
  hostFromConnectionString,
  loadNeonProject,
  neonOwnerConnectionString,
  NEON_BRANCHES,
} from './lib/neon.mjs';
import {
  KEYCHAIN_SERVICES,
  assertVercelToken,
  loadVercelAuth,
  parseDotEnv,
  readKeychain,
  redactConnectionString,
  upsertDotEnv,
  vercelEnvAdd,
  vercelEnvRm,
  writeKeychain,
} from './lib/secrets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const require = createRequire(import.meta.url);

let Client;
try {
  ({ Client } = require('pg'));
} catch {
  console.error('FAIL harness: `pg` is not installed. Remediation: pnpm add -Dw pg && re-run.');
  process.exit(2);
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const branchFlagIndex = args.indexOf('--branch');
const onlyBranch =
  branchFlagIndex >= 0 && args[branchFlagIndex + 1] ? args[branchFlagIndex + 1] : null;
const skipVercel = args.includes('--local-only');

const BRANCH_META = {
  dev: {
    branch: NEON_BRANCHES.dev,
    keychain: KEYCHAIN_SERVICES.neonWorkerDev,
    local: true,
    vercelTarget: null,
  },
  staging: {
    branch: NEON_BRANCHES.staging,
    keychain: KEYCHAIN_SERVICES.neonWorkerStaging,
    local: false,
    vercelTarget: 'preview',
  },
  production: {
    branch: NEON_BRANCHES.production,
    keychain: KEYCHAIN_SERVICES.neonWorkerProduction,
    local: false,
    vercelTarget: 'production',
  },
};

function ensurePassword(service) {
  const existing = readKeychain(service);
  if (existing && /^[a-f0-9]{48}$/.test(existing)) return existing;
  if (checkOnly) return null;
  const generated = randomBytes(24).toString('hex');
  writeKeychain(service, generated);
  console.log(`INFO generated password into Keychain (${service})`);
  return generated;
}

async function provisionOne(projectId, name, meta) {
  const password = ensurePassword(meta.keychain);
  if (!password) {
    console.log(`FAIL ${name}: worker password absent from Keychain (${meta.keychain})`);
    return { ok: false };
  }

  const ownerDirect = neonOwnerConnectionString(projectId, meta.branch, { pooled: false });
  const ownerPooled = neonOwnerConnectionString(projectId, meta.branch, { pooled: true });
  const directHost = hostFromConnectionString(ownerDirect);
  const pooledHost = hostFromConnectionString(ownerPooled);

  if (!checkOnly) {
    const admin = new Client({
      connectionString: ownerDirect,
      ssl: { rejectUnauthorized: true },
    });
    await admin.connect();
    try {
      const role = await admin.query(`select rolname from pg_roles where rolname = 'worker_user'`);
      if (role.rowCount === 0) {
        throw new Error(
          `worker_user role missing on ${name}. Remediation: run migrations on that branch first (pnpm migrate:up for dev; push to staging/main for shared branches).`,
        );
      }
      // ALTER ROLE cannot take bind parameters; password is hex-only.
      await admin.query(`alter role worker_user with login password '${password}'`);
    } finally {
      await admin.end();
    }
    console.log(`PASS ${name}: worker_user login enabled`);
  }

  const directUrl = buildRoleConnectionString({
    host: directHost,
    user: 'worker_user',
    password,
  });
  const pooledUrl = buildRoleConnectionString({
    host: pooledHost,
    user: 'worker_user',
    password,
  });

  const verifyUrl = name === 'dev' ? directUrl : pooledUrl;
  const verify = new Client({
    connectionString: verifyUrl,
    ssl: { rejectUnauthorized: true },
  });
  await verify.connect();
  try {
    const who = await verify.query('select current_user as u');
    if (who.rows[0].u !== 'worker_user') {
      throw new Error(`expected worker_user, got ${who.rows[0].u}`);
    }
  } finally {
    await verify.end();
  }
  console.log(`PASS ${name}: worker connection ok (${redactConnectionString(verifyUrl)})`);

  return { ok: true, directUrl, pooledUrl };
}

async function main() {
  const { projectId } = loadNeonProject(ROOT);
  const selected = onlyBranch ? { [onlyBranch]: BRANCH_META[onlyBranch] } : BRANCH_META;
  if (onlyBranch && !BRANCH_META[onlyBranch]) {
    throw Object.assign(
      new Error(`Unknown --branch ${onlyBranch}. Use: ${Object.keys(BRANCH_META).join(', ')}`),
      { harness: true },
    );
  }

  const results = {};
  for (const [name, meta] of Object.entries(selected)) {
    results[name] = await provisionOne(projectId, name, meta);
    if (!results[name].ok) process.exit(1);
  }

  if (checkOnly) {
    const local = parseDotEnv(ENV_PATH);
    console.log(
      local.NEON_WORKER_DATABASE_URL
        ? `PASS local NEON_WORKER_DATABASE_URL (${redactConnectionString(local.NEON_WORKER_DATABASE_URL)})`
        : 'FAIL local NEON_WORKER_DATABASE_URL absent',
    );
    process.exit(local.NEON_WORKER_DATABASE_URL ? 0 : 1);
  }

  if (results.dev?.directUrl) {
    upsertDotEnv(ENV_PATH, { NEON_WORKER_DATABASE_URL: results.dev.directUrl });
    console.log(
      `PASS local .env NEON_WORKER_DATABASE_URL (${redactConnectionString(results.dev.directUrl)})`,
    );
  }

  if (!skipVercel) {
    const creds = loadVercelAuth(ROOT);
    await assertVercelToken(creds.token);
    if (results.staging?.pooledUrl) {
      vercelEnvRm('NEON_WORKER_DATABASE_URL', 'preview');
      vercelEnvAdd('NEON_WORKER_DATABASE_URL', 'preview', results.staging.pooledUrl);
      console.log('PASS Vercel Preview NEON_WORKER_DATABASE_URL');
    }
    if (results.production?.pooledUrl) {
      vercelEnvRm('NEON_WORKER_DATABASE_URL', 'production');
      vercelEnvAdd('NEON_WORKER_DATABASE_URL', 'production', results.production.pooledUrl);
      console.log('PASS Vercel Production NEON_WORKER_DATABASE_URL');
    }
    console.log(
      '\n✓ worker DB provisioned. Reminder: run `pnpm redeploy:env` after Vercel env changes.',
    );
  }
}

main().catch((error) => {
  console.error(`FAIL harness: ${error.message}`);
  process.exit(error.harness ? 2 : 1);
});
