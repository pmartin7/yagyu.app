# validate-app

Validation harnesses that make the running app legible to agents. Use these
instead of guessing whether the app works: they boot/drive the real app,
produce screenshots, and print PASS/FAIL lines with remediation hints.

## When to use

- After any change to `apps/web`: run the local harness before reporting done.
- After pushing to `main` or `staging`: run the deployment harness to confirm
  the deploy actually succeeded and the live site renders.
- When investigating "the site is broken/blank" reports: both harnesses catch
  the blank-page class of failures (JS crash at startup → empty `#root`).

## Local visual validation

```bash
pnpm validate:local                      # checks / and /login
pnpm validate:local --route /some-page   # add extra routes
```

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

## Extending

Keep these lightweight. Add a route to the local harness via `--route` at the
call site; only hard-code new routes in `harness/validate-local.mjs` when they
become permanent surfaces. Post-auth flows (sign-in journeys) belong in a
future Playwright test suite, not in this smoke harness.
