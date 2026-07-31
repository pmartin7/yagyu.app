# release

Ships the current work through the documented promotion path: local → `staging` →
`main`. Validates before each promotion and verifies the deployment after it, so a
broken build is caught on staging rather than on yagyu.app.

Read AGENTS.md first. See `ARCHITECTURE.md` § Deployment & Environments for what
each branch maps to: `staging` → staging.yagyu.app + Neon `staging`, `main` →
yagyu.app + Neon `production`.

Never skip a gate because the change "looks small". The whole value of this
workflow is that production is the last thing to see a change, not the first.

## Phase 1 — Validate locally

```bash
pnpm format
pnpm validate        # lint + type-check + tests + docs:check
pnpm validate:local  # needs full permissions — Chromium cannot run sandboxed
```

Open the screenshots in `harness/artifacts/`. A green exit code proves the pages
rendered something, not that they rendered the right thing.

Stop on any failure. Do not proceed to a push with a red local run.

## Phase 2 — Review what ships

```bash
git status --short
git diff --stat
```

Check, and say what you checked:

- no secrets — `.env`, service-account JSON, tokens, private keys
- no debug leftovers — `console.log`, commented-out code, `.only` in tests
- no stray artifacts — screenshots, scratch files, backups
- migrations: if `apps/api/src/migrations/` gained a file, say so explicitly. It
  will run against staging on push and against **production** on merge.

## Phase 3 — Commit onto staging

`staging` is the integration branch; work is promoted from it, not to it.

If your work is uncommitted on another branch, check it can move safely first:

```bash
git diff --name-only origin/main origin/staging
```

Empty output means the trees are identical and `git checkout staging` carries
uncommitted changes across cleanly. If it is **not** empty, do not drag
uncommitted work across a diverged tree — commit on the current branch, then merge
that branch into `staging`.

```bash
git checkout staging
git add <explicit paths>
```

Stage explicit paths. `git add -A` is how untracked scratch files reach a remote.

Commit with a HEREDOC and a conventional prefix (`feat:`, `fix:`, `chore:`,
`docs:`, `refactor:`), describing why rather than restating the diff:

```bash
git commit -m "$(cat <<'EOF'
feat: short summary in the imperative

Body: what changed and why it was needed. Reference the invariant or bug class
if this fixes one.
EOF
)"
git push origin staging
```

## Phase 4 — Wait for staging CI and migration

Two workflows fire on a push to `staging`:

| Workflow      | Does                                                  |
| ------------- | ----------------------------------------------------- |
| `ci.yml`      | format check, lint, type-check, tests, build          |
| `migrate.yml` | applies pending MikroORM migrations to Neon `staging` |

```bash
gh run list --branch staging --limit 5
gh run watch <run-id>
```

Both must conclude `success`. On failure, read the logs, fix, and return to
Phase 1 — never promote a red staging.

A failed **migration** is a hard stop: `main` runs the same migration against
production, so a broken one must be fixed before promotion, not after.

## Phase 5 — Verify the staging deployment

```bash
pnpm validate:deploy  # needs full permissions
```

Confirms the Vercel deployments are `READY` and the live site serves the app.
Staging sits behind Vercel deployment protection, so an SSO redirect there is a
pass, not a failure.

## Phase 6 — Promote to main

```bash
git checkout main
git merge staging
git push origin main
```

A fast-forward is expected when `main` has nothing `staging` lacks. If the merge
is not a fast-forward, stop and look at why `main` diverged before forcing
anything — someone committed straight to production.

## Phase 7 — Verify production

Watch `ci.yml` and `migrate.yml` on `main` the same way, then:

```bash
pnpm validate:deploy
```

Open `harness/artifacts/deployment-production.png` and actually look at it. This is
the last gate, and it is the one a user would otherwise hit first.

## Phase 8 — Report

Give the user:

- the commit SHA on `staging` and on `main`
- both workflow conclusions per branch
- the verified URLs
- anything deliberately deferred

## Rollback

Production is broken and the cause is not obvious:

```bash
git checkout main
git revert <sha>   # or `git revert -m 1 <merge-sha>` for a merge commit
git push origin main
```

Revert forward; do not force-push `main`. A reverted migration needs a new
migration that undoes it — rolling back code does not roll back a schema change,
which is the reason Phase 4 treats migrations as a hard gate.
