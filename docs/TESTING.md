# TESTING.md

Testing conventions for this repository.

## 1) Framework

Vitest for all apps and packages. One test runner, one config pattern.

| App             | Plugin                           | Environment |
| --------------- | -------------------------------- | ----------- |
| apps/api        | unplugin-swc (decorator support) | node        |
| apps/web        | —                                | jsdom       |
| packages/shared | —                                | node        |

Commands:

- `pnpm test` — all tests
- `pnpm test --filter=@morpheus/api` — API tests only
- `pnpm validate` — lint + type-check + tests

## 2) Philosophy

Test behavior, not implementation. Priorities:

1. Zod schema validation boundaries
2. Auth guard logic (token verification, user sync)
3. Service business logic (CRUD, ownership checks)
4. API contract (request shape → response shape)
5. Critical UI behavior (auth redirects, streaming state)

Do not over-test: NestJS decorator wiring, static markup, Tailwind classes.

## 3) Separate-Agent Workflow

Two-pass approach:

- Pass A: implement the feature
- Pass B: a separate agent writes tests via `generate-test` skill

Why: reduces "code shaped to satisfy tests" anti-pattern, improves independent
verification.

## 4) File Placement

Colocate unit tests with source: `*.test.ts` / `*.test.tsx`.
Shared fixtures/helpers go under `src/test/` in each app.

## 5) Test Style

AAA pattern: Arrange, Act, Assert. One assert cluster per `it` block.
`vi.clearAllMocks()` in `beforeEach`. No shared mutable state.

## 6) Mocks

Mock at boundaries only:

- Firebase Admin SDK (`verifyIdToken`)
- Vercel AI SDK (`streamText`)
- MikroORM EntityManager (`find`, `create`, `flush`)

Prefer light fixtures over heavy mocks. Pure function tests first.

## 7) API Tests (NestJS)

Use `@nestjs/testing` `Test.createTestingModule()`:

```typescript
const module = await Test.createTestingModule({
  providers: [UsersService, { provide: EntityManager, useValue: mockEm }],
}).compile();
```

## 8) Web Tests (React)

Use `@testing-library/react` with jsdom. Assert on visible behavior:
screen queries, user events, navigation. No snapshot tests.

## 9) Ops / deployment harnesses

These are not unit tests; they are agent-facing scripts under `harness/` that
prevent re-inventing bootstrap and release checks. They must never print secret
values (Keychain / `.env` / Vercel / GitHub env only).

| Command                      | Purpose                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `pnpm secrets:check`         | Presence of Keychain services, local env keys, Vercel/GitHub env names    |
| `pnpm secrets:sync -- --all` | Sync OpenAI, CRON, models from Keychain → `.env` + Vercel (+ GH for cron) |
| `pnpm check:openai`          | HTTP smoke of Keychain OpenAI keys                                        |
| `pnpm db:provision-worker`   | Enable `worker_user` login; set `NEON_WORKER_DATABASE_URL`                |
| `pnpm redeploy:env`          | Redeploy latest Production + Preview after env edits                      |
| `pnpm check:branch-sync`     | Compare local / `origin/staging` / `origin/main` tips                     |
| `pnpm validate:deploy`       | Vercel auth + env names + READY deploys + SPA HTTP/visual + `/api/health` |
| `pnpm bench:triage`          | Single model/stack triage accuracy/cost run                               |
| `pnpm bench:triage:matrix`   | Small frozen-prompt matrix; logs in `harness/artifacts/`                  |

See `ARCHITECTURE.md` § Environment Bootstrap and the `/release` skill Phase 0.

## 10) Definition of Done

1. implementation complete
2. tests added in separate pass
3. `pnpm validate` passes
4. docs updated if patterns changed
