/**
 * Shared secret I/O for ops harnesses.
 *
 * Rules:
 * - Never print secret values, connection-string passwords, or full URLs with
 *   credentials.
 * - Prefer macOS Keychain for durable local storage (account `yagyu`).
 * - Write platform secrets only to Vercel env vars / GitHub environment secrets
 *   / local `.env` (gitignored). Never write secrets into tracked files.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

export const KEYCHAIN_ACCOUNT = 'yagyu';

/** Canonical Keychain service names — do not invent new ones in ad-hoc scripts. */
export const KEYCHAIN_SERVICES = {
  openaiDev: 'yagyu-openai-dev',
  openaiProd: 'yagyu-openai-prod',
  cronStaging: 'yagyu-cron-staging',
  cronProduction: 'yagyu-cron-production',
  neonWorkerDev: 'yagyu-neon-worker-dev',
  neonWorkerStaging: 'yagyu-neon-worker-staging',
  neonWorkerProduction: 'yagyu-neon-worker-production',
};

export function readKeychain(service) {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-a', KEYCHAIN_ACCOUNT, '-s', service, '-w'],
      { encoding: 'utf8' },
    ).trim();
  } catch {
    return null;
  }
}

export function writeKeychain(service, value) {
  execFileSync(
    'security',
    ['add-generic-password', '-U', '-a', KEYCHAIN_ACCOUNT, '-s', service, '-w', value],
    { stdio: 'ignore' },
  );
}

export function keychainPresent(service) {
  return readKeychain(service) !== null;
}

/** Shape-only description — never includes the secret. */
export function describeSecret(value) {
  if (value == null || value === '') return 'absent';
  if (value.startsWith('sk-')) return `OpenAI-shaped, length ${value.length}`;
  return `present, length ${value.length}`;
}

export function redactConnectionString(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.username}@${url.hostname}${url.pathname}`;
  } catch {
    return '(unparseable)';
  }
}

export function parseDotEnv(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index);
    let value = line.slice(index + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function upsertDotEnv(path, entries) {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [name, value] of Object.entries(entries)) {
    const line = `${name}=${value}`;
    const re = new RegExp(`^${name}=.*$`, 'm');
    if (re.test(text)) text = text.replace(re, line);
    else text = `${text.trimEnd()}\n${line}\n`;
  }
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`);
}

export function loadVercelAuth(root) {
  try {
    const { token } = JSON.parse(
      readFileSync(
        resolve(homedir(), 'Library/Application Support/com.vercel.cli/auth.json'),
        'utf8',
      ),
    );
    const { projectId, orgId } = JSON.parse(
      readFileSync(resolve(root, '.vercel/project.json'), 'utf8'),
    );
    if (!token || !projectId || !orgId) throw new Error('incomplete');
    return { token, projectId, orgId };
  } catch {
    throw Object.assign(
      new Error(
        'Vercel credentials not found. Remediation: run `npx vercel login` and `npx vercel link`.',
      ),
      { harness: true },
    );
  }
}

export async function assertVercelToken(token) {
  const res = await fetch('https://api.vercel.com/v2/user', {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    throw Object.assign(
      new Error(
        `Vercel token rejected (HTTP ${res.status}). Remediation: run \`npx vercel login\`, then re-run.`,
      ),
      { harness: true },
    );
  }
}

export async function listVercelEnvNames({ token, projectId, orgId }) {
  const params = new URLSearchParams({ teamId: orgId });
  const res = await fetch(`https://api.vercel.com/v9/projects/${projectId}/env?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Vercel env list failed (HTTP ${res.status})`);
  }
  const body = await res.json();
  return (body.envs ?? []).map((item) => ({
    key: item.key,
    targets: item.target ?? [],
    gitBranch: item.gitBranch ?? null,
  }));
}

export function vercelEnvRm(name, environment) {
  const result = spawnSync(
    'npx',
    ['--yes', 'vercel@41.7.0', 'env', 'rm', name, environment, '-y'],
    { encoding: 'utf8' },
  );
  return result.status === 0;
}

export function vercelEnvAdd(name, environment, value) {
  const result = spawnSync('npx', ['--yes', 'vercel@41.7.0', 'env', 'add', name, environment], {
    encoding: 'utf8',
    input: value,
  });
  if (result.status !== 0) {
    throw new Error(
      `vercel env add ${name} ${environment} failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
}

export function ghEnvSecretSet(environment, name, value) {
  const result = spawnSync('gh', ['secret', 'set', name, '--env', environment, '--body', value], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `gh secret set ${environment}/${name} failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
}

export function ghEnvSecretNames(environment) {
  const result = spawnSync('gh', ['secret', 'list', '--env', environment], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return result.stdout
    .split('\n')
    .map((line) => line.split('\t')[0])
    .filter(Boolean);
}
