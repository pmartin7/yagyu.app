# validate-app

Validation harnesses that make the running app legible to agents. Use these
instead of guessing whether the app works: they boot/drive the real app,
produce screenshots, and print PASS/FAIL lines with remediation hints.

| Harness                | Proves                                           |
| ---------------------- | ------------------------------------------------ |
| `pnpm validate:local`  | every route renders without crashing, with shots |
| `pnpm validate:deploy` | the live deployments are READY and serve the app |
| `pnpm docs:check`      | routes/entities/env vars still match the docs    |

## When to use

- After any change to `apps/web`: run the local harness before reporting done.
- After pushing to `main` or `staging`: run the deployment harness to confirm
  the deploy actually succeeded and the live site renders.
- When investigating "the site is broken/blank" reports: both harnesses catch
  the blank-page class of failures (JS crash at startup → empty `#root`).

## Chromium and the agent sandbox

Read this before debugging a browser failure, or you will waste a 150MB download.

Both Playwright harnesses go through `harness/lib/browser.mjs`, which fixes two
sandbox quirks:

- the sandbox points `PLAYWRIGHT_BROWSERS_PATH` at a **per-session temp dir**, so
  anything installed there is gone next session. The helper pins the path back to
  Playwright's platform default (`~/Library/Caches/ms-playwright` on macOS).
- the sandbox blocks `sysctl`, so `os.cpus()` returns `[]` and Playwright's Apple
  Silicon check (`cpus().some(c => c.model.includes('Apple'))`) fails. It then
  looks for a `mac-x64` build that never matches the installed `mac-arm64` one.
  The helper sets `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE` to correct it.

What remains, and cannot be fixed from the repo: **Chromium itself segfaults
inside the agent sandbox.** So:

- run `pnpm validate:local` / `pnpm validate:deploy` with **full permissions**
- `SIGSEGV` / "browser has been closed" means wrong permissions, not a missing
  browser. The harness says so. Do not reinstall.
- install once per machine with `pnpm playwright:install` (needs full permissions
  for network)

## Local visual validation

```bash
pnpm validate:local                      # checks /, /login, /verify-email, /welcome, /settings
pnpm validate:local --route /some-page   # add extra routes
```

Signed out, the guarded routes redirect instead of rendering their own page —
which is the guard chain worth smoke-testing. This harness cannot see
authenticated states; post-auth journeys need a signed-in browser context.

What it does: reuses a dev server on :5173 (or boots one and tears it down),
loads each route in headless Chromium, fails on console errors, uncaught page
errors, failed network requests, non-200 responses, or an empty `#root`.
Writes full-page screenshots to `harness/artifacts/local-*.png`.

Agents MUST look at the screenshots after a UI change — a passing run only
means "no errors", not "looks right". Read the PNG files directly.

## Deployment validation

```bash
pnpm validate:deploy
```

What it does:

1. Vercel API — latest production deployment and latest `staging`-branch
   deployment must be `READY` (fails with an `npx vercel inspect --logs`
   remediation command if errored, or "re-run in a minute" if still building).
2. HTTP — production URL must serve the app shell; `yagyu.app` is a soft
   check until DNS propagates; staging accepts the Vercel SSO redirect
   (deployment protection is on).
3. Visual — loads production in headless Chromium, fails on blank `#root` or
   console errors, writes `harness/artifacts/deployment-production.png`.

Requires Vercel CLI auth (`npx vercel login`) and a linked project (`.vercel/`),
both already set up on this machine.

## Exit codes (both harnesses)

- `0` pass — safe to report success
- `1` validation failures — fix, then re-run
- `2` harness could not run (missing playwright/credentials) — follow the
  printed remediation, do not treat as an app failure

## Documentation currency

```bash
pnpm docs:check
```

Compares `apps/web/src/app/router.tsx`, the API entity classes, and the Zod env
schema against `ARCHITECTURE.md` and `.env.example`, and fails on drift. It runs
inside `pnpm check`, so CI catches what you forget.

It only sees what is mechanically extractable. A rewritten flow or a new
invariant will pass this check and still leave the docs lying — those are on you
(see `.agents/rules/documentation-currency.mdc`).

## Extending

Keep these lightweight. Add a route to the local harness via `--route` at the
call site; only hard-code new routes in `harness/validate-local.mjs` when they
become permanent surfaces. Post-auth flows (sign-in journeys) belong in a
future Playwright test suite, not in this smoke harness.

When you add a new piece of the stack, the harness comes first — see Golden
Principle 9 in AGENTS.md. A harness that cannot observe a subsystem means agents
will guess about it forever.
