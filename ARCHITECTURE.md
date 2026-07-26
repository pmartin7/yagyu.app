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

`apps/mobile` and email ingestion are intentionally **not scaffolded yet**. Add
them via `/research-feature` → `/plan-feature` → `/build-plan` so feature work
follows these guardrails. The Vercel AI SDK integration lives in
`apps/api/src/ai` and is reused for triage, summarization, and recommended
actions (Anthropic / Claude).

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

### Route Map (apps/web — marketing/landing)

| Route  | Page          | Auth |
| ------ | ------------- | ---- |
| /      | Landing page  | No   |
| /login | Firebase auth | No   |

### Entity Model

All entities extend `BaseEntity`.

```
BaseEntity (abstract): id (UUID), createdAt, updatedAt
├── User: firebaseUid, email, displayName, pushToken (nullable)
├── EmailAccount (implemented): provider (enum: gmail), emailAddress,
│     encryptedRefreshToken (AES-256-GCM, hidden from serialization), user (FK)
│     — unique (user, emailAddress); outlook + displayName, syncCursor, status
│       are added when email sync is built
├── EmailMessage: providerMessageId, threadId, emailAccount (FK), sender,
│     subject, snippet, receivedAt, isRead, priorityScore (float),
│     needsAction (bool), aiSummary (text, nullable),
│     aiRecommendedActions (jsonb, nullable), category (FK, nullable), user (FK)
├── Category: name, isDynamic (bool), color, sortOrder, user (FK)
└── Todo: title, notes (nullable), status (enum: open | done | snoozed),
      dueDate (nullable), source (enum: email | manual), category (FK),
      contextSummary, recommendedActions
```

`User` and `EmailAccount` exist in code today; the other entities are added as
their features are built. Keep this model as the reference when adding them.

### Data Flow

```
Auth:    Client (mobile/web) → Firebase SDK → JWT → API Guard → verify JWT →
         RLS interceptor (tx + set_config) → getOrCreate User
Sync:    Provider (Gmail/Outlook) → apps/api email sync → EmailMessage rows (per EmailAccount syncCursor)
Triage:  New EmailMessage → AI SDK (Anthropic) → priorityScore, needsAction, aiSummary,
         aiRecommendedActions, dynamic Category assignment
Todos:   EmailMessage (Needs Action) → auto-generated Todo | manual Todo → CRUD via /api/todos
Push:    apps/api → expo-notifications (User.pushToken) → mobile device
CRUD:    Client → fetch → /api/{resource} → Guard → Service → MikroORM → Neon Postgres
```

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
- `.github/workflows/ci.yml` — format check + lint + type-check + tests on every
  push/PR to `staging`/`main`.
- `.github/workflows/migrate.yml` — on push to `staging`/`main`, applies pending
  MikroORM migrations using the matching GitHub environment's
  `NEON_DATABASE_URL` secret (concurrency-guarded per environment).
- Flow: iterate locally on `dev` → merge to `staging` (CI + staging migration +
  staging deploy) → merge to `main` (CI + production migration + production
  deploy).

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
- Transaction-per-request pins a pooled connection for the request duration.
  Future streaming/SSE endpoints (e.g. AI chat) must opt out of the
  interceptor, or they would hold a transaction open for the whole stream.
