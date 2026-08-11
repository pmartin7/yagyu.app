#!/usr/bin/env node
/**
 * Assert local HEAD, origin/staging, and origin/main point at the same commit
 * (or report divergence). Optionally summarize latest GitHub deployment SHAs.
 *
 * Usage: node harness/check-branch-sync.mjs
 * Exit: 0 = in sync, 1 = diverged, 2 = harness error.
 */
import { execFileSync } from 'node:child_process';

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function short(sha) {
  return sha.slice(0, 7);
}

try {
  git('fetch', 'origin', '--quiet');
} catch (error) {
  console.error(`FAIL harness: git fetch failed: ${error.message}`);
  process.exit(2);
}

const head = git('rev-parse', 'HEAD');
const staging = git('rev-parse', 'origin/staging');
const main = git('rev-parse', 'origin/main');
const branch = git('branch', '--show-current');
const headSubject = git('log', '-1', '--format=%s', 'HEAD');

console.log(`branch: ${branch}`);
console.log(`local HEAD:      ${short(head)}  ${headSubject}`);
console.log(
  `origin/staging:  ${short(staging)}  ${git('log', '-1', '--format=%s', 'origin/staging')}`,
);
console.log(`origin/main:     ${short(main)}  ${git('log', '-1', '--format=%s', 'origin/main')}`);

const [aheadStaging, behindStaging] = git(
  'rev-list',
  '--left-right',
  '--count',
  'HEAD...origin/staging',
)
  .split(/\s+/)
  .map(Number);
const [aheadMain, behindMain] = git(
  'rev-list',
  '--left-right',
  '--count',
  'origin/staging...origin/main',
)
  .split(/\s+/)
  .map(Number);

console.log(`local vs origin/staging: ahead ${aheadStaging}, behind ${behindStaging}`);
console.log(`origin/staging vs origin/main: ahead ${aheadMain}, behind ${behindMain}`);

const dirty = git('status', '--porcelain');
if (dirty) {
  console.log('WARN working tree has local changes (not necessarily a sync failure):');
  console.log(
    dirty
      .split('\n')
      .slice(0, 12)
      .map((line) => `  ${line}`)
      .join('\n'),
  );
}

try {
  const deployments = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        'repos/:owner/:repo/deployments',
        '--jq',
        '.[0:6] | map({environment, sha: .sha[0:7], ref, created_at})',
      ],
      { encoding: 'utf8' },
    ),
  );
  console.log('recent deployments:');
  for (const item of deployments) {
    console.log(`  ${item.environment}\t${item.sha}\t${item.ref}\t${item.created_at}`);
  }
} catch {
  console.log('WARN could not list GitHub deployments (gh auth / network)');
}

const inSync = head === staging && staging === main;
if (inSync) {
  console.log(`\n✓ git in sync at ${short(head)}`);
  process.exit(0);
}

console.log('\n✗ git not fully in sync');
if (staging !== main) {
  const onlyStaging = git('log', '--oneline', 'origin/main..origin/staging');
  const onlyMain = git('log', '--oneline', 'origin/staging..origin/main');
  if (onlyStaging) console.log(`on staging, not main:\n${onlyStaging}`);
  if (onlyMain) console.log(`on main, not staging:\n${onlyMain}`);
}
process.exit(1);
