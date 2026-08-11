#!/usr/bin/env node
/**
 * Run a small matrix of frozen-prompt model stacks through bench:triage and
 * write a summary under harness/artifacts/ (gitignored). Does not print API keys.
 *
 * Requires OPENAI_API_KEY in the environment or local `.env` (loaded by the API
 * build's load-env). Uses the existing bench harness — no second call path.
 *
 * Usage: node harness/bench-triage-matrix.mjs
 * Exit: 0 = all variants ran, 1 = a variant failed, 2 = harness error.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACTS = resolve(ROOT, 'harness/artifacts');

const VARIANTS = [
  {
    name: 'all-luna',
    args: [
      '--variant',
      'decomposed',
      '--model',
      'openai:gpt-5.6-luna',
      '--screen-input-price',
      '0.20',
      '--screen-output-price',
      '1.20',
      '--route-input-price',
      '0.20',
      '--route-output-price',
      '1.20',
      '--write-input-price',
      '0.20',
      '--write-output-price',
      '1.20',
    ],
  },
  {
    name: 'luna-terra-sol',
    args: [
      '--variant',
      'decomposed',
      '--screen-model',
      'openai:gpt-5.6-luna',
      '--route-model',
      'openai:gpt-5.6-terra',
      '--write-model',
      'openai:gpt-5.6-sol',
      '--screen-input-price',
      '0.20',
      '--screen-output-price',
      '1.20',
      '--route-input-price',
      '2.00',
      '--route-output-price',
      '12.00',
      '--write-input-price',
      '5.00',
      '--write-output-price',
      '30.00',
    ],
  },
  {
    name: 'write-terra',
    args: [
      '--variant',
      'decomposed',
      '--screen-model',
      'openai:gpt-5.6-luna',
      '--route-model',
      'openai:gpt-5.6-terra',
      '--write-model',
      'openai:gpt-5.6-terra',
      '--screen-input-price',
      '0.20',
      '--screen-output-price',
      '1.20',
      '--route-input-price',
      '2.00',
      '--route-output-price',
      '12.00',
      '--write-input-price',
      '2.00',
      '--write-output-price',
      '12.00',
    ],
  },
];

mkdirSync(ARTIFACTS, { recursive: true });

// Build once up front (bench:triage also builds; skip duplicate via direct node after build)
const build = spawnSync('pnpm', ['--filter', '@morpheus/shared', 'build'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (build.status !== 0) {
  console.error(build.stderr || build.stdout);
  process.exit(2);
}
const buildApi = spawnSync('pnpm', ['--filter', '@morpheus/api', 'build'], {
  cwd: ROOT,
  encoding: 'utf8',
});
if (buildApi.status !== 0) {
  console.error(buildApi.stderr || buildApi.stdout);
  process.exit(2);
}

const summary = [];
let failed = false;

for (const variant of VARIANTS) {
  console.log(`\n===== ${variant.name} =====`);
  const result = spawnSync('node', ['harness/bench-triage.mjs', ...variant.args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  const logPath = resolve(ARTIFACTS, `bench-matrix-${variant.name}.log`);
  writeFileSync(logPath, `${result.stdout}\n${result.stderr}`);
  const tail = (result.stdout || '')
    .split('\n')
    .filter((line) => /decomposed |model|score|┌|│/.test(line))
    .slice(-20)
    .join('\n');
  console.log(tail || result.stdout.slice(-500));
  summary.push({
    name: variant.name,
    exit: result.status ?? 1,
    log: logPath,
  });
  if (result.status !== 0) {
    failed = true;
    console.log(`FAIL ${variant.name} (exit ${result.status}) — see ${logPath}`);
  } else {
    console.log(`PASS ${variant.name} → ${logPath}`);
  }
}

const summaryPath = resolve(ARTIFACTS, 'bench-matrix-summary.json');
writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nsummary → ${summaryPath}`);
process.exit(failed ? 1 : 0);
