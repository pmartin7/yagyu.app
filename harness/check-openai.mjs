#!/usr/bin/env node
/**
 * Smoke-test OpenAI API keys stored in macOS Keychain.
 *
 * Reads `yagyu-openai-dev` / `yagyu-openai-prod` (account `yagyu`), calls
 * GET /v1/models, and reports HTTP status + key shape only — never the secret.
 *
 * Usage: node harness/check-openai.mjs
 * Exit: 0 = both keys HTTP 200, 1 = at least one failed, 2 = harness error.
 */
import { KEYCHAIN_SERVICES, describeSecret, readKeychain } from './lib/secrets.mjs';

async function check(service) {
  const key = readKeychain(service);
  if (!key) {
    console.log(`FAIL ${service}: absent from Keychain`);
    return false;
  }
  console.log(`INFO ${service}: ${describeSecret(key)}`);
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 200) {
    console.log(`PASS ${service}: HTTP 200`);
    return true;
  }
  let code = 'unknown';
  try {
    const body = await res.json();
    code = body?.error?.code ?? body?.error?.type ?? 'unknown';
  } catch {
    // ignore parse errors
  }
  console.log(`FAIL ${service}: HTTP ${res.status} (${code})`);
  return false;
}

const okDev = await check(KEYCHAIN_SERVICES.openaiDev);
const okProd = await check(KEYCHAIN_SERVICES.openaiProd);
process.exit(okDev && okProd ? 0 : 1);
