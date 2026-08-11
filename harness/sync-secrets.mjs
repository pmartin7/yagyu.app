#!/usr/bin/env node
/**
 * Sync operational secrets from macOS Keychain into local `.env`, Vercel, and
 * GitHub environment secrets. Never prints secret values.
 *
 * Flags:
 *   --check     report presence only (no writes)
 *   --openai    sync OPENAI_API_KEY (dev→Preview, prod→Production) + local
 *   --cron      ensure CRON_SECRET (generate into Keychain if missing)
 *   --models    set DEFAULT_AI_MODEL + AI_MODEL_* to measured defaults
 *   --all       openai + cron + models
 *
 * Usage: node harness/sync-secrets.mjs --all
 * Exit: 0 = ok, 1 = failed check/sync, 2 = harness could not run.
 */
import { randomBytes } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KEYCHAIN_SERVICES,
  assertVercelToken,
  describeSecret,
  ghEnvSecretNames,
  ghEnvSecretSet,
  keychainPresent,
  listVercelEnvNames,
  loadVercelAuth,
  parseDotEnv,
  readKeychain,
  upsertDotEnv,
  vercelEnvAdd,
  vercelEnvRm,
  writeKeychain,
} from './lib/secrets.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = resolve(ROOT, '.env');
const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check');
const doAll = args.has('--all');
const doOpenai = doAll || args.has('--openai');
const doCron = doAll || args.has('--cron');
const doModels = doAll || args.has('--models');

const MEASURED_MODEL = 'openai:gpt-5.6-luna';

if (!doOpenai && !doCron && !doModels && !checkOnly) {
  console.error(
    'Usage: node harness/sync-secrets.mjs --check | --all | [--openai] [--cron] [--models]',
  );
  process.exit(2);
}

function ensureCron(service) {
  const existing = readKeychain(service);
  if (existing && existing.length >= 32) return existing;
  if (checkOnly) return null;
  const generated = randomBytes(32).toString('base64');
  writeKeychain(service, generated);
  console.log(`INFO generated ${service} into Keychain`);
  return generated;
}

function setVercel(name, environment, value) {
  vercelEnvRm(name, environment);
  vercelEnvAdd(name, environment, value);
  console.log(`PASS set Vercel ${name} (${environment})`);
}

async function main() {
  const failures = [];

  if (checkOnly) {
    for (const [label, service] of Object.entries(KEYCHAIN_SERVICES)) {
      const value = readKeychain(service);
      console.log(
        `${value ? 'PASS' : 'FAIL'} keychain ${label} (${service}): ${describeSecret(value)}`,
      );
      if (!value) failures.push(service);
    }
    const local = parseDotEnv(ENV_PATH);
    for (const key of [
      'OPENAI_API_KEY',
      'CRON_SECRET',
      'NEON_WORKER_DATABASE_URL',
      'DEFAULT_AI_MODEL',
      'AI_MODEL_SCREEN',
      'AI_MODEL_ROUTE',
      'AI_MODEL_WRITE',
    ]) {
      const present = Boolean(local[key]);
      console.log(
        `${present ? 'PASS' : 'FAIL'} local .env ${key}: ${present ? 'present' : 'absent'}`,
      );
      if (!present) failures.push(`local:${key}`);
    }

    const creds = loadVercelAuth(ROOT);
    await assertVercelToken(creds.token);
    console.log('PASS Vercel token');
    const envNames = await listVercelEnvNames(creds);
    const required = [
      ['OPENAI_API_KEY', 'preview'],
      ['OPENAI_API_KEY', 'production'],
      ['CRON_SECRET', 'preview'],
      ['CRON_SECRET', 'production'],
      ['NEON_WORKER_DATABASE_URL', 'preview'],
      ['NEON_WORKER_DATABASE_URL', 'production'],
      ['DEFAULT_AI_MODEL', 'preview'],
      ['DEFAULT_AI_MODEL', 'production'],
    ];
    for (const [key, target] of required) {
      const hit = envNames.some((item) => item.key === key && item.targets.includes(target));
      console.log(`${hit ? 'PASS' : 'FAIL'} Vercel ${key} (${target})`);
      if (!hit) failures.push(`vercel:${key}:${target}`);
    }

    for (const environment of ['staging', 'production']) {
      const names = ghEnvSecretNames(environment);
      const hit = names.includes('CRON_SECRET');
      console.log(`${hit ? 'PASS' : 'FAIL'} GitHub ${environment}/CRON_SECRET`);
      if (!hit) failures.push(`github:${environment}:CRON_SECRET`);
    }

    process.exit(failures.length === 0 ? 0 : 1);
  }

  const creds = loadVercelAuth(ROOT);
  await assertVercelToken(creds.token);
  console.log('PASS Vercel token');

  if (doOpenai) {
    const devKey = readKeychain(KEYCHAIN_SERVICES.openaiDev);
    const prodKey = readKeychain(KEYCHAIN_SERVICES.openaiProd);
    if (!devKey?.startsWith('sk-') || !prodKey?.startsWith('sk-')) {
      throw Object.assign(
        new Error(
          'OpenAI Keychain entries missing. Store with:\n' +
            `  security add-generic-password -U -a yagyu -s ${KEYCHAIN_SERVICES.openaiDev} -w\n` +
            `  security add-generic-password -U -a yagyu -s ${KEYCHAIN_SERVICES.openaiProd} -w`,
        ),
        { harness: true },
      );
    }
    upsertDotEnv(ENV_PATH, { OPENAI_API_KEY: devKey });
    console.log('PASS local .env OPENAI_API_KEY');
    setVercel('OPENAI_API_KEY', 'preview', devKey);
    setVercel('OPENAI_API_KEY', 'production', prodKey);
  }

  if (doCron) {
    const staging = ensureCron(KEYCHAIN_SERVICES.cronStaging);
    const production = ensureCron(KEYCHAIN_SERVICES.cronProduction);
    if (!staging || !production) {
      throw new Error('CRON_SECRET Keychain entries could not be ensured');
    }
    upsertDotEnv(ENV_PATH, { CRON_SECRET: staging });
    console.log('PASS local .env CRON_SECRET (staging value)');
    setVercel('CRON_SECRET', 'preview', staging);
    setVercel('CRON_SECRET', 'production', production);
    ghEnvSecretSet('staging', 'CRON_SECRET', staging);
    ghEnvSecretSet('production', 'CRON_SECRET', production);
    console.log('PASS GitHub staging/production CRON_SECRET');
  }

  if (doModels) {
    const modelEntries = {
      DEFAULT_AI_MODEL: MEASURED_MODEL,
      AI_MODEL_SCREEN: MEASURED_MODEL,
      AI_MODEL_ROUTE: MEASURED_MODEL,
      AI_MODEL_WRITE: MEASURED_MODEL,
    };
    upsertDotEnv(ENV_PATH, modelEntries);
    console.log(`PASS local .env models → ${MEASURED_MODEL}`);
    for (const environment of ['preview', 'production']) {
      for (const [name, value] of Object.entries(modelEntries)) {
        setVercel(name, environment, value);
      }
    }
  }

  console.log(
    '\n✓ secrets synced. Reminder: run `pnpm redeploy:env` so running deployments pick up new Vercel values.',
  );
  console.log(
    `Keychain inventory: ${Object.values(KEYCHAIN_SERVICES)
      .map((service) => `${service}=${keychainPresent(service) ? 'present' : 'absent'}`)
      .join(', ')}`,
  );
}

main().catch((error) => {
  console.error(`FAIL harness: ${error.message}`);
  process.exit(error.harness ? 2 : 1);
});
