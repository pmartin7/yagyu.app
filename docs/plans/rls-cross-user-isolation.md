# RLS Cross-User Isolation — Implementation Plan

Status: audited by staff-engineer — ready for /build-plan.

> **Build deviation (2026-07-25):** build-time verification (step 3) found
> that `neondb_owner` has BYPASSRLS on Neon (Risk 4 materialized), which
> falsifies Option A's premise — FORCE cannot bind a BYPASSRLS role, and
> removing the attribute requires superuser. Built with a dedicated `app_user`
> runtime role instead (NOBYPASSRLS, DML grants via migration,
> `NEON_APP_DATABASE_URL` credential per environment); migrations stay on the
> owner credential, so the backfill rule is unnecessary. The interceptor,
> `set_config` identity flow, and policies are implemented as planned.

## Summary

Enforce per-user row isolation at the Postgres level so an unfiltered
application query can never read or modify another user's rows. Chosen approach
(staff-reviewed Option A, 29/30): keep the single `neondb_owner` runtime
credential, apply `ENABLE` + `FORCE ROW LEVEL SECURITY` to all user-owned
tables (Neon's owner role has no BYPASSRLS, so FORCE makes policies bind it),
and carry the request identity as a transaction-local Postgres setting
`app.firebase_uid`. A global NestJS interceptor wraps each authenticated
request in one MikroORM transaction that first executes
`set_config('app.firebase_uid', <uid>, true)`. Fail-closed: no setting →
`current_setting(..., true)` returns NULL → policies match nothing.

## Design Decisions

- **Identity = Firebase UID, not app user id.** The user row is looked
  up/created _after_ authentication, so the only identity available at
  transaction start is the verified JWT `uid`. Child-table policies resolve the
  app user id via a scalar subquery on `"user"`.
- **Transaction-local setting only (`set_config(..., true)`).** Neon's pooler
  is transaction-scoped; a session-level SET would leak identity across pooled
  requests.
- **Transaction-per-request via interceptor, not middleware.** Nest order is
  middleware → guards → interceptors → handler. The guard must not touch the
  DB (it can't join a transaction that doesn't exist yet), so user sync moves
  from the guard into the interceptor, inside the transaction.
- **MikroORM TransactionContext propagation.** `em.transactional()` registers
  the forked EM in an AsyncLocalStorage-based TransactionContext; the route
  handler's queries (issued via the injected global EntityManager) resolve to
  that fork automatically, so all handler queries share the transaction.
  Verify with a spike first (Risk 1). Note: `em.transactional` flushes pending
  changes implicitly on commit — service-level `flush()` calls keep working,
  but entity mutations without an explicit flush now also persist at commit.
- **FORCE RLS instead of a separate runtime role.** Same enforcement strength,
  zero per-branch role/password operations.
- **Guard keeps auth; interceptor owns request context.** FirebaseAuthGuard
  verifies the JWT + `email_verified` and stashes decoded claims on the
  request; RlsContextInterceptor owns transaction + `set_config` + user sync +
  attaching `request.user`.

## File-by-File Changes

### apps/api — migrations

- `apps/api/migrations/Migration<timestamp>.ts` — NEW (blank migration,
  hand-written SQL):

```sql
alter table "user" enable row level security;
alter table "user" force row level security;
create policy user_isolation on "user" for all
  using (firebase_uid = current_setting('app.firebase_uid', true))
  with check (firebase_uid = current_setting('app.firebase_uid', true));

alter table "email_account" enable row level security;
alter table "email_account" force row level security;
create policy email_account_isolation on "email_account" for all
  using (user_id = (select id from "user" where firebase_uid = current_setting('app.firebase_uid', true)))
  with check (user_id = (select id from "user" where firebase_uid = current_setting('app.firebase_uid', true)));
```

`down()` drops both policies and disables/unforces RLS on both tables. Note:
the `email_account` policy's subquery runs under the `user` policy and can only
ever see the caller's own row — correct by construction.

### apps/api — source

- `apps/api/src/common/guards/firebase-auth.guard.ts` — MODIFIED. Remove
  `ModuleRef`/`UsersService`/`OnModuleInit` wiring and the `getOrCreate` call.
  After verifying the token and `email_verified`, set
  `request.authClaims = { uid, email, displayName }` from the decoded token.
  The guard no longer touches the database. Type the request shape inline in
  the guard file (no separate types file).
- `apps/api/src/common/interceptors/rls-context.interceptor.ts` — NEW. Global
  interceptor:
  - If `request.authClaims` is absent (unauthenticated route, e.g. health),
    pass through untouched.
  - Otherwise wrap the handler in one transaction:

    ```ts
    return from(
      this.em.transactional(async (em) => {
        await em.execute('select set_config(?, ?, true)', ['app.firebase_uid', claims.uid]);
        request.user = await this.usersService.getOrCreate(
          claims.uid,
          claims.email,
          claims.displayName,
        );
        return await lastValueFrom(next.handle().pipe(defaultIfEmpty(undefined)));
      }),
    );
    ```

  - `defaultIfEmpty(undefined)` is required: `lastValueFrom` throws
    `EmptyError` if the handler observable completes without emitting.
  - Subscribing to `next.handle()` inside the transactional callback keeps the
    handler inside the AsyncLocalStorage transaction context; an exception
    rejects the promise and MikroORM rolls back.

- `apps/api/src/app.module.ts` — MODIFIED. Register globally:
  `{ provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor }` alongside the
  existing ThrottlerGuard provider. AppModule already imports UsersModule,
  which exports UsersService.
- `apps/api/src/common/decorators/current-user.decorator.ts` — UNCHANGED
  (keeps reading `request.user`, which the interceptor now sets).
- `apps/api/src/users/users.service.ts` — UNCHANGED (`getOrCreate` now runs
  under RLS: `findOne` sees the caller's own row via the policy; insert passes
  WITH CHECK because `firebase_uid` matches the setting).

### docs

- `ARCHITECTURE.md` — MODIFIED.
  - Key Invariants: add "Postgres RLS enforced (ENABLE + FORCE) on all
    user-owned tables; every new user-owned table's migration must add
    ENABLE + FORCE + an isolation policy; request identity flows via
    transaction-local `app.firebase_uid`".
  - Data Flow: update the stale Auth line
    (`… API Guard → verify → getOrCreate User`) to
    `… API Guard → verify JWT → RLS interceptor (tx + set_config) → getOrCreate User`.
  - Document the backfill rule: migration DML on RLS-forced tables must either
    `select set_config('app.firebase_uid', …, true)` per affected user or
    temporarily `alter table … no force row level security`.

## Test Strategy (separate generate-test pass)

P0:

- Guard: valid + verified token → claims stashed on request; unverified email
  → 401; missing/invalid header → 401.
- Interceptor: no claims → handler runs, no transaction started; with claims →
  `set_config` executed with the uid, `getOrCreate` called, `request.user`
  attached, handler value returned; handler throws → transaction rolled back
  and error propagates; handler observable completes empty → resolves without
  `EmptyError`.

Build-time verification (implementing agent, against the Neon dev branch):

1. Apply the migration to dev.
2. Seed two users A and B with one email_account each via direct SQL as
   `neondb_owner` — this requires `set_config` per user and doubles as
   verification of the documented backfill pattern.
3. Without `set_config`: `select count(*) from email_account` → 0 rows
   (fail-closed; `neondb_owner` is the only role, bound by FORCE).
4. With `set_config` for A: count → 1 and only A's row visible; `update` /
   `delete` targeting B's row by id → 0 rows affected.
5. Run the existing browser E2E flow (sign in, list, link-state, unlink) to
   confirm the app works end-to-end unchanged.

## Risks

1. **TransactionContext propagation doesn't behave as assumed** (handler
   queries escape the transaction and silently run without the RLS context —
   fail-closed, so they return empty rather than leak, but the app breaks).
   Mitigation: spike first — a throwaway route asserting
   `select current_setting('app.firebase_uid', true)` from a service equals
   the uid; if propagation fails, fall back to explicitly passing the forked
   EM via a request-scoped provider.
2. **Transaction-per-request holds pooled connections longer** — including the
   Google OAuth exchange roundtrip inside the transaction (`linkGmail`).
   Acceptable at current scale; future streaming/SSE endpoints (AI chat) must
   opt out of the interceptor or they would pin a transaction for the stream
   duration. Documented in ARCHITECTURE.md.
3. **Future migration backfills fail or silently no-op under FORCE RLS.**
   Mitigation: documented backfill rule (set_config or NO FORCE window); the
   build verification exercises the pattern.
4. **Neon behavior drift** (e.g. the owner role gaining BYPASSRLS) would
   silently disable enforcement. Mitigation: fail-closed verification step 3
   catches it whenever the check is re-run; revisit if Neon changes role
   semantics.
