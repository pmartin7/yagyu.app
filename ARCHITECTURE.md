# ARCHITECTURE.md

Read AGENTS.md first. This file describes the yagyu.app topology.

## Topology

yagyu.app is a mobile-first product, distributed on Android first, then iOS.

```
apps/mobile      Expo (React Native) app + expo-notifications — PLANNED, not yet scaffolded
apps/api         NestJS on Vercel — owns email sync, AI triage, todos, push-send
apps/web         Marketing/landing + login site on Vercel
packages/shared  Zod schemas shared by api + mobile (+ web)
```

`apps/mobile` is intentionally **not scaffolded yet**. Email ingestion and task
triage live in `apps/api`; the responsive `/tasks` web experience is the first
client for that domain. The Vercel AI SDK integration lives in `apps/api/src/ai`
and is reused by the scoped triage agents (Anthropic / OpenAI).

### Screen Map (apps/mobile — implemented later)

| Screen         | Purpose                                               |
| -------------- | ----------------------------------------------------- |
| Onboarding     | Connect email accounts (Gmail/Outlook OAuth)          |
| Triage feed    | Prioritized inbox across all accounts                 |
| Needs Action   | Emails requiring a response/decision                  |
| Message detail | AI summary (AI Context) + recommended actions         |
| Categories     | View/manage dynamic + manual categories, recategorize |
| Todos          | List, add, edit, complete, snooze, recategorize       |
| Settings       | Accounts, notifications                               |

### Route Map (apps/web)

| Route         | Page                   | Guard                                         |
| ------------- | ---------------------- | --------------------------------------------- |
| /             | Landing page           | `PublicRoute` — signed-in visitors redirected |
| /login        | Sign in / sign up      | `PublicRoute` — signed-in visitors redirected |
| /verify-email | Awaiting verification  | none — owns its own redirects                 |
| /welcome      | Post-signup onboarding | `ProtectedRoute` — signed in **and** verified |
| /settings     | Linked Gmail accounts  | `ProtectedRoute` — signed in **and** verified |
| /tasks        | Ranked task list       | `ProtectedRoute` — signed in **and** verified |

Guards live in `apps/web/src/features/auth/`. `PublicRoute` sends an
authenticated visitor to `/welcome`, or to `/verify-email` when unverified, and
renders its children while auth resolves so anonymous visitors never wait on a
spinner. `/verify-email` is deliberately unguarded: it is the one page for the
signed-in-but-unverified state that both guards redirect _to_.

Every authenticated route (`/welcome`, `/settings`, `/tasks`) renders inside
`AppLayout`'s side panel chrome — see `docs/UI_DESIGN.md` §5 for the
`SidePanel`/`Sheet` pattern.

### Authentication & Email Verification

Firebase Auth owns identity. The API trusts the ID token and nothing else.

Sign-up (email/password):

1. `createUserWithEmailAndPassword` — the session is deliberately kept, because
   verification status can only be polled for a signed-in account.
2. `updateProfile({ displayName })` with the name captured on the sign-up form.
   That becomes the token's `name` claim, which the API stores as
   `User.displayName` when it creates the row on the first authenticated
   request. There is no separate "create user" endpoint.
3. `sendEmailVerification` with a continue URL of `/verify-email`.
4. `/verify-email` polls every 5s and resends behind a 60s cooldown whose
   timestamp lives in `sessionStorage`, so the lock survives a page reload.

**Invariant — verification is a property of the token, not of the account.**
`user.emailVerified` and the ID token's `email_verified` claim diverge, and the
API guard reads the claim: restoring a session reloads the account flag from
Firebase but leaves the cached token untouched (`_reloadWithoutSaving` fetches
account info with an _unforced_ `getIdToken()`). Therefore:

- `AuthProvider` and both guards derive verification from `getIdTokenResult()`,
  never from `user.emailVerified`;
- whenever verification is newly observed, the client must mint a fresh token
  (`getIdToken(true)`) before it calls the API.

Breaking either half produces one silent failure mode: a "verified" user sitting
on `/welcome` whose every API call 401s, with no `User` row ever created.

### Entity Model

All entities extend `BaseEntity`.

```
BaseEntity (abstract): id (UUID), createdAt, updatedAt
├── User: firebaseUid, email, displayName (nullable)
├── EmailAccount: provider (gmail), emailAddress, encryptedRefreshToken
│     (AES-256-GCM, hidden), syncCursor, lastSyncedAt,
│     initialSyncCompletedAt, watchExpiresAt, syncStatus, user (FK)
│     — unique (user, emailAddress)
├── EmailMessage: providerMessageId, threadId, sender, subject, snippet,
│     bodyText, receivedAt, analysisStatus, emailAccount (FK), user (FK)
│     — unique (emailAccount, providerMessageId)
├── SyncJob: kind (backfill | incremental | analyze | reanalyze), status,
│     attempts, runAfter, leasedUntil, checkpoint (jsonb), lastError,
│     emailAccount (FK)
├── Category: name, summary, managedBy (ai | user),
│     rankingMode (ai | manual), sortOrder, user (FK)
├── Task: title, status (open | done), dueDate (date-only), priority,
│     stackRank, managedBy (ai | user), aiContext, aiRecommendedAction,
│     category (FK), user (FK)
│   ├── TaskNextStep: title, completedAt, sortOrder, task (FK)
│   ├── TaskNote: body, task (FK), user (FK) — append-only
│   └── TaskEmail: task (FK), email (FK), linkedBy (ai | user)
│         — unique (task, email)
└── AutomationRun: stage (screen | route | write), promptVersion, model,
      generationConfig (jsonb), tokensIn, tokensOut, latencyMs,
      appliedChanges (jsonb), user (FK), email (nullable FK),
      task (nullable FK) — append-only
```

Task membership is `Category → Task → TaskEmail → EmailMessage`. A task belongs
to exactly one category; one email can link to several tasks. `EmailMessage`
does not carry a category foreign key because category membership derives
through its linked tasks.

### Data Flow

```
Auth:   Client → Firebase SDK → JWT → API Guard → email_verified check →
        RLS interceptor (tx + set_config) → getOrCreate User
Sync:   Gmail Pub/Sub push OR 10-minute GitHub Actions drain → idempotent SyncJob →
        leased worker batch → Gmail REST → EmailMessage rows + syncCursor
Triage: analyze/reanalyze SyncJob → parallel per-email Screeners →
        one structure-only Router per actionable slice →
        parallel per-touched-task Writers → deterministic category Ranker
Tasks:  Web → /api/tasks + /api/categories → RLS-bound TasksService →
        ranked Task graph; note append enqueues targeted writer-only reanalysis
```

The same Postgres ledger owns sync and triage work. A claim commits a 90-second
lease before external work starts; each bounded batch persists a checkpoint.
The cron drain self-chains while ready jobs remain. Gmail history expiry falls
back to a bounded 60-day resync. Pub/Sub is optional: without its configuration,
the cron remains a complete polling path.

The triage prompts are separate, versioned modules with a static system-prefix
followed by variable context. Each agent resolves its model independently:
`AI_MODEL_SCREEN`, `AI_MODEL_ROUTE`, and `AI_MODEL_WRITE` override
`DEFAULT_AI_MODEL` only for that stage. Each prompt module also owns its bounded
generation settings (`maxOutputTokens`), so the benchmark and production use the
exact same prompt/model/config combination. Do not change a stage model or
generation config without a `pnpm bench:triage` before/after on the fixture set —
the last measured winners were `openai:gpt-5.6-luna` for screen, route, and write.
`AutomationRun` records each call's stage, prompt version, model, generation
config, usage, latency, and applied changes. Screen and route email bodies are
explicitly truncated, and Writer context is capped to 20 linked-email digests,
full text only for newly linked messages, and the 10 most recent notes.

### Deployment & Environments

One Neon Postgres project with three database branches mirroring the git flow:

| Git branch | Vercel environment          | Neon branch  | GitHub environment |
| ---------- | --------------------------- | ------------ | ------------------ |
| `main`     | Production (yagyu.app)      | `production` | `production`       |
| `staging`  | Preview (staging.yagyu.app) | `staging`    | `staging`          |
| local dev  | —                           | `dev`        | —                  |

- Local dev: `.env` `NEON_DATABASE_URL` (owner, migrations) and
  `NEON_APP_DATABASE_URL` (app_user, API runtime) point at the Neon `dev`
  branch (direct URLs). Iterate on schema there without touching shared
  environments.
- Vercel runtime uses a **pooled** `NEON_APP_DATABASE_URL` (`-pooler` host);
  migrations use the **direct** owner `NEON_DATABASE_URL`.
- Background sync and triage lazily open a pool-max-1
  `NEON_WORKER_DATABASE_URL` connection as `worker_user`. Ordinary user traffic
  never initializes this connection. The migration creates `worker_user` as
  `NOLOGIN NOBYPASSRLS`; each environment must run
  `alter role worker_user with login password '<generated>';` once before
  setting the URL.
- `.github/workflows/ci.yml` — format check + lint + type-check + tests on every
  push/PR to `staging`/`main`.
- `.github/workflows/migrate.yml` — on push to `staging`/`main`, applies pending
  MikroORM migrations using the matching GitHub environment's
  `NEON_DATABASE_URL` secret (concurrency-guarded per environment).
- Flow: iterate locally on `dev` → merge to `staging` (CI + staging migration +
  staging deploy) → merge to `main` (CI + production migration + production
  deploy).
- One Vercel project (`yagyu-app`) serves both apps: the static SPA from
  `apps/web/dist` and the API as a single serverless function. Root
  `api/index.js` wraps the compiled Nest app (`apps/api/src/serverless.ts`);
  `vercel.json` rewrites `/api/*` to the function and everything else to
  `index.html` (SPA fallback). ORM entities are registered statically in
  `mikro-orm.config.ts` — the function bundler only includes files reachable
  through imports, so glob discovery must not be reintroduced.
- GitHub Actions (`.github/workflows/email-sync-drain.yml`) invokes
  `GET /api/internal/sync/run` every 10 minutes against staging and production,
  authenticating with each environment's `CRON_SECRET`. Authenticated
  self-chaining uses POST. Both hand bounded drain work to Vercel `waitUntil`
  before returning. Do not put a sub-daily schedule in `vercel.json` while the
  project is on a Hobby plan — Hobby rejects those crons at deploy time. Gmail
  push additionally requires `GOOGLE_PUBSUB_TOPIC` and a push subscription whose
  OIDC identity matches `PUBSUB_PUSH_SERVICE_ACCOUNT`.
- `yagyu.ai` and `www.yagyu.ai` are extra domains on the same Vercel project,
  permanently redirected to `yagyu.app`. The authoritative redirect is the
  **project domain redirect** (`redirect=yagyu.app`, status 308) — the same
  mechanism already used for `www.yagyu.app` → `yagyu.app`. Host-matched
  rules in `vercel.json` alone do **not** fire for these aliases (they return
  200 and serve the SPA); keep them only as defense-in-depth. Set or restore
  the project redirect with:
  `PATCH /v9/projects/{id}/domains/{domain}` body
  `{"redirect":"yagyu.app","redirectStatusCode":308}` (or the Domains UI).
  If a new domain is attached and its nameservers correctly point at Vercel
  but `vercel dns ls <domain>` shows no records and every write fails with
  "not a DNS zone" (400), Vercel's zone-provisioning for that domain is stuck;
  `vercel domains rm <domain> --yes` then `vercel domains add <domain>
yagyu-app` recreates it — this happened for `yagyu.ai`, unresolvable for
  over a week despite correct delegation, fixed by that remove/re-add.

```
Web: Vite SPA (static)
API: NestJS single serverless function
Mobile: Expo (EAS) — Android first, then iOS (separate release pipeline, post-init)
```

### Key Invariants

- One app, two packages (monorepo)
- Zod at all boundaries (single validation system)
- Named exports only
- MikroORM RequestContext per request (forMiddleware)
- Pino structured logging (nestjs-pino)
- Postgres RLS enforced on all user-owned tables; every new user-owned
  table's migration must add ENABLE (+ FORCE) + an isolation policy; request
  identity flows via the transaction-local setting `app.firebase_uid`
- Email verification is read from the ID token's `email_verified` claim, never
  from `user.emailVerified` (see Authentication & Email Verification)
- The web route map above and `apps/web/src/app/router.tsx` are one system —
  `pnpm docs:check` fails when they drift
- An email-account cursor advances only in the transaction that persisted the
  corresponding message batch.
- Worker claims commit their lease before work begins; every batch checkpoints
  under the 30-second function limit and must be safe to resume.
- AI never reopens a user-completed task or overwrites a user-managed field.
  The first manual rank write permanently switches that category's
  `rankingMode` from `ai` to `manual`.
- Task notes are append-only and trigger targeted reanalysis.
- A note-triggered `reanalyze` job invokes Writer directly for its task. It does
  not re-screen mail or ask Router to change task/category/link structure.
- Router owns structure (categories, tasks, links); Writer owns task content
  (title, context, recommended action, next steps, due date, priority). Neither
  stage may cross that boundary.
- Every Router id is accepted only when it appeared in the exact digest sent to
  that call. Zod proves shape; the apply step proves referential grounding.
- Prompt system prefixes remain static and precede variable context so provider
  prompt caching remains effective.
- Model changes are stage-local and prompt-frozen: evaluate a candidate through
  `bench:triage` before changing that stage's prompt or generation settings.
  Any prompt or generation-config change must bump that stage's prompt version.
- A green migration does not finish runtime bootstrap: roles created as
  `NOLOGIN` (e.g. `worker_user`) still need a one-time login password and
  `NEON_WORKER_DATABASE_URL` via `pnpm db:provision-worker`.
- Nest API dist is CommonJS (required by `api/index.js` on Vercel). Packages
  that are ESM-only (`ai`, `@ai-sdk/*`) must be loaded through `importEsm()`
  in `apps/api/src/ai/import-esm.ts` (a native dynamic `import` that tsc cannot
  rewrite). A static import — or a source-level `import()` that CommonJS emit
  turns into `require()` — crashes every cold start with `ERR_REQUIRE_ESM` /
  `FUNCTION_INVOCATION_FAILED`, including `/api/health`.
- Sub-daily schedules must not be added to `vercel.json` while the project is
  on a Hobby plan — Hobby rejects those crons at deploy time. Use
  `.github/workflows/email-sync-drain.yml` instead.
- Vercel environment variable edits do not refresh running deployments; run
  `pnpm redeploy:env` after `pnpm secrets:sync` / `pnpm db:provision-worker`.
- Operational secrets are never committed. Agents store them in macOS Keychain
  (account `yagyu`, service names in `.env.example`) and sync with
  `pnpm secrets:sync` into local `.env` (gitignored), Vercel env vars, and
  GitHub **environment** secrets — not repository secrets that land in git.

### Environment Bootstrap

After cloning or after a migration that adds DB roles / sync secrets, each
environment needs these once (dev locally; Preview≈staging; Production≈main):

| Concern                     | Harness                                    | Where the secret lives                  |
| --------------------------- | ------------------------------------------ | --------------------------------------- |
| OpenAI keys + stage models  | `pnpm secrets:sync -- --openai --models`   | Keychain → `.env` + Vercel              |
| Cron bearer for sync drain  | `pnpm secrets:sync -- --cron`              | Keychain → `.env` + Vercel + GitHub env |
| `worker_user` login + URL   | `pnpm db:provision-worker`                 | Keychain → `.env` + Vercel              |
| Apply new Vercel env values | `pnpm redeploy:env`                        | —                                       |
| Verify presence (no values) | `pnpm secrets:check` / `pnpm check:openai` | —                                       |
| Git tip alignment           | `pnpm check:branch-sync`                   | —                                       |

Schema migrate (`pnpm migrate:up` / `migrate.yml`) is necessary but not
sufficient for the worker URL or `CRON_SECRET`.

### Row-Level Security

- Two database credentials: migrations/CLI run as `neondb_owner` (table
  owner; has BYPASSRLS on Neon, so backfill DML needs no special handling),
  the API runtime connects as `app_user` (`NOBYPASSRLS`, DML grants only) via
  `NEON_APP_DATABASE_URL`. RLS policies therefore bind every runtime query.
- `FirebaseAuthGuard` verifies the JWT only (no DB access) and stashes claims
  on the request; the global `RlsContextInterceptor` wraps every authenticated
  request in one MikroORM transaction that first runs
  `select set_config('app.firebase_uid', <uid>, true)`, then syncs the user
  (`getOrCreate`) and runs the handler inside that transaction.
- Fail-closed: without the setting, `current_setting('app.firebase_uid', true)`
  yields NULL (or `''`) and the policies match nothing.
- Per-environment setup (one-time, after the role migration has run):
  `alter role app_user with login password '<generated>';` then set
  `NEON_APP_DATABASE_URL` (pooled host on Vercel, direct locally). Table
  grants for future tables are covered by default privileges; new user-owned
  tables only need ENABLE RLS + a policy in their migration.
- `worker_user` is created `NOLOGIN NOBYPASSRLS` by migration. Provision login
  and `NEON_WORKER_DATABASE_URL` with `pnpm db:provision-worker` (never commit
  the password). Prefer pooled hosts on Vercel; direct hosts locally.
- Transaction-per-request pins a pooled connection for the request duration.
  Future streaming/SSE endpoints (e.g. AI chat) must opt out of the
  interceptor, or they would hold a transaction open for the whole stream.
