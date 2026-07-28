# AGENTS.md

Entry point for agents. Read this first, then drill into docs relevant to your task.

## 1) Product Context

**Product:** yagyu.app

**Description:** A mobile app that connects multiple email accounts, triages and
categorizes incoming mail with AI, surfaces what needs immediate action with
suggested context and recommended follow-ups, and turns emails into a manageable,
editable todo list. Use the Force of the Yagyu to cut through the noise, create
Zen, Focus, Power, Magic and Clarity.

**Target user:** Professionals and knowledge workers who juggle several email
accounts and are overwhelmed by their inbox.

**Tone:** Clean, simple, modern, slick yet quirky and geeky — with the spirit of
the Samurai embodied.

### Domain Glossary

- **Email Account** — a connected Gmail/Outlook mailbox.
- **Triage** — AI scoring of an email's urgency + whether it needs action.
- **Dynamic Category** — an AI-created grouping that evolves as mail arrives.
- **Needs Action** — emails requiring a user response/decision.
- **AI Context** — a short AI summary explaining why an email matters.
- **Recommended Action** — AI-suggested reply/follow-up.
- **Todo** — an actionable item, auto-generated from an email or added manually.
- **Follow-up** — a todo tied to awaiting/sending a response.

### Editorial Positioning

Calm, focused, action-oriented; reduces the anxiety of forgetting something in
your inbox. Gamified to show how well you are doing at embodying the Zen and
power of the Yagyu.

## 2) Repository Structure

Turborepo monorepo:

```
apps/web               Vite + React + Tailwind + shadcn SPA
apps/api               NestJS REST API + MikroORM + Vercel AI SDK
packages/shared        Zod schemas + inferred TypeScript types
packages/tsconfig      Shared TypeScript base configs
packages/eslint-config Shared ESLint flat configs
docs/                  Style guide, testing, logging, UI design
.github/workflows/     CI (format+lint+type-check+test) + DB migration pipelines
.husky/                Pre-commit hook (lint-staged: eslint --fix + prettier)
.agents/skills/        Agent skills (workflows) — source of truth
.agents/rules/         Always-on agent rules — source of truth
.agents/agents/        Agent role definitions
.cursor/skills/        → symlink to .agents/skills/
.cursor/rules/         → symlink to .agents/rules/
```

## 3) Quick Start

```bash
pnpm install
pnpm dev          # starts web (:5173) + api (:3000)
pnpm build
pnpm check        # lint + type-check
pnpm validate     # check + tests
pnpm test
pnpm format       # prettier --write (also runs on save + pre-commit + CI check)
pnpm validate:local   # boot + drive web app headlessly, screenshots → harness/artifacts/
pnpm validate:deploy  # verify Vercel deployments are READY and live site renders
```

## 4) Stack

- TypeScript (strict)
- React + Vite + Tailwind v4 + shadcn/ui
- NestJS + MikroORM + Neon Postgres
- Firebase Auth
- Vercel AI SDK (Anthropic / OpenAI)
- Vitest
- Pino (structured logging)
- Vercel (deploy)

## 5) Golden Principles

1. One canonical pattern per concern. If two approaches exist, pick one.
2. Validate external boundaries with Zod. Every external input, env var, API
   payload. Zod is the single validation system — no class-validator.
3. Named exports only. No default exports.
4. Test behavior, not implementation. Separate-agent workflow: implement first,
   test in independent pass.
5. Logging is structured and sparse. Log boundaries and failures. Never log
   secrets, tokens, or full payloads.
6. YAGNI. Build what is needed now. No abstractions for hypothetical futures.
7. Simple over clever. Flat over nested. Explicit over implicit.

## 6) General Principles

- Small units: functions do one thing.
- Flat control flow: early returns, obvious happy path.
- DRY without over-engineering: eliminate real duplication, not hypothetical.
- Separation of concerns: controllers thin, services own logic, lib owns utilities.
- Never define React components inside other components.
- Feature-based folder structure: keep component + hooks + sub-components together.

## 7) Documentation Map (read order)

1. AGENTS.md (this file)
2. ARCHITECTURE.md
3. docs/STYLE_GUIDE.md
4. docs/TESTING.md (when writing tests)
5. docs/LOGGING.md (when adding logs)
6. docs/UI_DESIGN.md (when touching UI)

## 8) Preferred Agent Workflow

1. Read AGENTS.md
2. Read only the docs relevant to the task
3. Implement the smallest complete change
4. Run pnpm check (default sandbox first; full permissions only on EPERM)
5. If implementation is done, run a separate test-writing pass
6. Run pnpm validate when tests are in scope
7. If conventions changed, update docs

## 9) Available Skills

| Skill                 | Trigger           | Purpose                                                     |
| --------------------- | ----------------- | ----------------------------------------------------------- |
| init-project          | /init-project     | Conversational setup wizard                                 |
| research-feature      | /research-feature | Research + simplify + options + staff review                |
| plan-feature          | /plan-feature     | Create implementation plan from research                    |
| build-plan            | /build-plan       | Implement plan with parallel subagents                      |
| fix-bug               | /fix-bug          | Diagnose bugs via hypotheses + ninja review                 |
| generate-test         | /generate-test    | Independent P0 test writing                                 |
| design                | /design           | UI design / review + staff-designer                         |
| add-logs              | /add-logs         | Insert structured logging                                   |
| create-pr-description | /create-pr        | PR description from git diff                                |
| add-vector-store      | /add-vector-store | Wire Turbopuffer vector search                              |
| add-blob-storage      | /add-blob-storage | Wire Vercel Blob file storage                               |
| validate-app          | /validate-app     | Visual local validation + deployment verification harnesses |

## 10) Anti-Patterns

Do not:

- introduce a second UI system or component library
- mix validation systems (Zod only)
- add default exports
- log secrets or full payloads
- skip pnpm check after edits
- create docs that duplicate information already in another doc

## Cursor Cloud specific instructions

Startup runs `pnpm install` only. Commands (`pnpm dev`, `check`, `validate`,
`build`, etc.) are in §3. `pnpm check`, `pnpm test`, and `pnpm build` need no
secrets. Non-obvious caveats:

- **`apps/web` runs with no secrets.** Firebase is lazy-initialised
  (`src/lib/firebase.ts`), so the landing (`/`) and login (`/login`) pages
  render without any `VITE_*` env. `pnpm dev` serves it on :5173. Real
  sign-in/Google sign-in needs real `VITE_FIREBASE_*` / `VITE_GOOGLE_CLIENT_ID`.
- **`apps/api` will not boot without a full env.** `createApp()` runs a strict
  Zod `EnvSchema` (`packages/shared/src/schemas/env.ts`) and Firebase-admin init
  at startup. Required: `NEON_DATABASE_URL`, `NEON_APP_DATABASE_URL`,
  `FIREBASE_PROJECT_ID`/`FIREBASE_PRIVATE_KEY`/`FIREBASE_CLIENT_EMAIL`,
  `DEFAULT_AI_MODEL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `TOKEN_ENCRYPTION_KEY` (base64 32 bytes: `openssl rand -base64 32`). See
  `.env.example`. Provide real values via the Cursor Secrets panel, or run the
  API against local stand-ins (below). `load-env.ts` reads repo-root `.env` but
  never overrides already-set process env, so injected secrets win.
- **Local Postgres URLs must NOT contain `sslmode=require`.** `mikro-orm.config`
  only enables the pg SSL driver option when the URL contains `sslmode=require`
  (needed for Neon); a local server has no SSL and will reject it.
- **Two DB roles by design (RLS).** Migrations run as the owner
  (`NEON_DATABASE_URL`, must have BYPASSRLS — a local superuser works); the API
  runtime connects as the RLS-bound `app_user` (`NEON_APP_DATABASE_URL`,
  NOBYPASSRLS). `app_user` is created _by migration_ with `nologin`; after
  migrating you must `ALTER ROLE app_user WITH LOGIN PASSWORD '<pw>'` before the
  API can connect. Request identity flows via the tx-local `app.firebase_uid`
  (set by `RlsContextInterceptor`); no setting ⇒ policies match nothing.
- **`pnpm migrate:up` gotcha.** It loads compiled entities from `apps/api/dist`
  (MikroORM's ReflectMetadataProvider needs `emitDecoratorMetadata`, which
  tsx/ts-node do NOT emit), so build first (`pnpm build --filter=@morpheus/api`).
  The migration files live _outside_ `src` and are not emitted by `nest build`,
  and no `ts-node` is installed, so vanilla `pnpm migrate:up` cannot load them
  locally on Node 22. CI runs this on Node 24 (native TS). To apply migrations
  locally, compile the `apps/api/migrations/*.ts` to JS and point the migrator
  at them, or apply the SQL directly.
- **Offline auth = Firebase Auth emulator.** The guard calls
  `admin.auth().verifyIdToken` and requires `email_verified: true`. To exercise
  authenticated endpoints without a real Firebase project, run the Auth emulator
  (Node-only, no Java) and set `FIREBASE_AUTH_EMULATOR_HOST`; firebase-admin then
  accepts emulator-issued tokens. Use a `demo-*` project id.
- **`pnpm validate:local`** (Playwright harness for `/` + `/login`) needs the
  browser binary once: `pnpm exec playwright install chromium`. It reuses a dev
  server already on :5173, else boots its own; screenshots land in
  `harness/artifacts/`.
