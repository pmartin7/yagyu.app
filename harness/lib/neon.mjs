/**
 * Neon helpers for ops harnesses. Uses the `neon` CLI + local `.neon` link.
 * Never logs full connection strings.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const NEON_BRANCHES = {
  dev: 'dev',
  staging: 'staging',
  production: 'production',
};

export function loadNeonProject(root) {
  const path = resolve(root, '.neon');
  if (!existsSync(path)) {
    throw Object.assign(
      new Error('Missing .neon project link. Remediation: run `neon link` from the repo root.'),
      { harness: true },
    );
  }
  const { projectId, orgId } = JSON.parse(readFileSync(path, 'utf8'));
  if (!projectId) {
    throw Object.assign(new Error('.neon is missing projectId'), { harness: true });
  }
  return { projectId, orgId };
}

export function neonOwnerConnectionString(projectId, branch, { pooled = false } = {}) {
  const args = [
    'connection-string',
    branch,
    '--project-id',
    projectId,
    '--role-name',
    'neondb_owner',
    '--database-name',
    'neondb',
  ];
  if (pooled) args.push('--pooled');
  return execFileSync('neon', args, { encoding: 'utf8' }).trim();
}

export function hostFromConnectionString(connectionString) {
  return new URL(connectionString).hostname;
}

export function buildRoleConnectionString({ host, user, password, database = 'neondb' }) {
  const url = new URL(`postgresql://${user}@${host}/${database}`);
  url.password = password;
  url.searchParams.set('sslmode', 'require');
  return url.toString();
}
