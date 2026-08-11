# Plan: Email triage service + interactive Tasks page

Status: audited — staff-engineer (Mode B), staff-designer (Mode B), and
ai-engineer (Mode A, triage agent design) edits applied. Research basis:
research-feature session of Aug 9, 2026 (Neon job-ledger option,
staff-engineer approved) + interactive UX prototype (canvas) + optimize-ai
pass on the triage pipeline.

## Summary

Build the continuous email→task pipeline and the page that surfaces it. A
Gmail Pub/Sub webhook plus a 10-minute Vercel cron feed a Postgres job ledger;
claimed jobs sync mail (60-day backfill, then history-cursor increments) into
`EmailMessage` rows, and a staged triage pipeline — a cheap screener, a
structure-only router, a per-task attribute writer, and a deterministic
ranker — creates and updates Categories, Tasks, next steps, and email links,
every applied change recorded in an append-only `AutomationRun`. The `/tasks` page becomes the interactive,
mobile-first task list from the prototype: scannable collapsed rows, expandable
detail (AI context, recommended action, next steps, linked emails, notes),
one-tap done with undo, and an append-only notes composer whose entries feed
the next AI analysis.

## Design Decisions

- **Job ledger in Postgres, no queue.** `SyncJob` rows are claimed by a short
  committed transaction: `UPDATE … SET status='running', leasedUntil = now() +
interval '90s' WHERE id IN (SELECT id … WHERE (status='pending' AND runAfter
<= now()) OR (status='running' AND leasedUntil < now()) … FOR UPDATE SKIP
LOCKED)`. Work then proceeds in separate per-batch transactions that persist
  the checkpoint; a killed function loses at most one batch and the job is
  re-claimed after lease expiry. Retries/backoff/dead-letter are columns, not
  new infrastructure. (Staff-engineer-selected option; queue only when load
  proves it.)
- **One pipeline, two triggers, one claiming mechanism.** The Pub/Sub webhook
  and the 10-minute cron both just upsert idempotent `SyncJob` rows; a single
  worker path drains them. Triage is not a second system: it runs as `analyze`
  jobs in the same ledger (`kind: backfill|incremental|analyze|reanalyze`),
  enqueued by sync completion and by new notes. The webhook responds 200
  immediately after upserting the job, then drains a bounded slice via
  `waitUntil` (Pub/Sub retries slow pushes). The cron drain **self-chains**:
  if jobs remain after its slice, it fire-and-forgets one call to
  `/api/internal/sync/run` (bearer `CRON_SECRET`) so a 60-day backfill
  completes in hours, not days. Watch renewal happens inside the same cron
  (renew watches expiring <24h).
- **Checkpointed batches.** Every invocation processes a bounded slice
  (messages fetched, emails analyzed) and persists progress; the 30s function
  limit is a design input, not an accident to discover.
- **Worker DB identity.** A `worker_user` role (NOBYPASSRLS, explicit
  `using (true)` policies on pipeline tables) via `NEON_WORKER_DATABASE_URL`
  gives background code cross-user reads without the migration owner
  credential. Internal routes carry no Firebase claims, so the existing RLS
  interceptor already passes them through untouched. The worker
  `EntityManager` is **not** registered in `app.module.ts`: `EmailSyncModule`
  provides a lazy factory (`getWorkerEm()`) that calls `MikroORM.init` (pool
  max 1) on first internal request and caches it across warm invocations —
  ordinary API traffic never opens the worker connection.
- **Cursor advances only after flush.** `EmailAccount.syncCursor` (Gmail
  historyId) moves forward only in the same transaction that persisted the
  fetched messages; history 404 triggers a bounded 60-day resync.
- **AI writes are auditable and subordinate to the user.** Mutations, the
  `AutomationRun` snapshot, and `analysisStatus` commit in one transaction. AI
  never reopens a user-completed task, never edits user-managed fields, and
  loses ranking control of a category on first manual reorder
  (`rankingMode: ai → manual`).
- **Notes are a first-class entity.** `TaskNote` rows (append-only,
  timestamped) are injected into the next `AutomationRun` as user context;
  creating one enqueues a targeted re-analysis job.
- **Task↔Email is many-to-many** via `TaskEmail`; a task has exactly one
  category; no `EmailMessage.category` FK — category membership derives
  through tasks.
- **Gmail via `google-auth-library` REST calls.** `OAuth2Client` with the
  stored refresh token against the Gmail REST endpoints; no `googleapis`
  dependency.
- **Structured AI output.** `AiService` gains a `generateStructured` method
  (Vercel AI SDK `generateObject` + Zod schema); every triage stage uses it.
- **Triage is a collection of scoped agents, not one mega-call** (ai-engineer
  audit). Structure and content are owned by different agents so their
  failure modes, context needs, model tiers, and benchmarks stay independent:
  - **Stage 1 — Screener** (per email, `AI_MODEL_SCREEN`, minimal reasoning):
    input is one email; output `ScreenDecision { actionable, reason }`.
    Non-actionable emails get `analysisStatus: 'skipped'` and stop here, so
    frontier tokens are never spent on newsletter-grade mail. The ~10 calls
    per batch run **in parallel** (independent inputs; per-email failure
    granularity matches the ledger). The prompt is biased
    actionable-when-unsure: a false positive costs one router call, a false
    negative silently loses a task — screener **recall is the gating
    benchmark metric**, and `reanalyze` jobs re-screen previously skipped
    emails in a thread that later proves actionable.
  - **Stage 2 — Router** (the categorization agent; one call per actionable
    slice, default tier): input is a compact user-graph digest (category
    names + one-line summaries; open task ids + titles — references, never
    full content) plus all actionable emails in the batch. Output
    `RouteDecision`: per-email targets — link to an existing task, or create
    a task (in an existing or new category) declared once via a local ref
    (`newTaskRef: "n1"`) that multiple emails can point at. Intra-batch
    routability is model-internal, not persisted state. New-task declarations
    carry only a short discriminative **label** (identity, not prose) — the
    router never writes content. The apply step **grounds every referenced
    id against the digest actually sent in that call**, records rejects in
    `AutomationRun`, and falls back to create-or-requeue.
  - **Stage 3 — Task Writer** (the attribute agent; one call per **touched
    task**, deduped across the batch, run in parallel, default tier): input
    is deep context of exactly one task — category, current attributes,
    linked-email digests (full text only for newly linked emails, capped at
    the most recent N), and a bounded window of user notes (most recent 10 or
    all since the writer's last run). Output `TaskWriteDecision { title,
aiContext, recommendedAction, nextSteps (completed ones preserved),
dueDate, priority }`. It never touches category membership, links,
    status, or other tasks.
  - **Stage 4 — Ranker** (deterministic, no LLM): `stackRank` within a
    category is a scoring function over AI-assigned priority, due-date
    proximity, and recency. An LLM ranking pass is added only if the
    benchmark proves the formula insufficient.
  - Prompts live in `src/triage/prompts/` as versioned modules (static
    system prompt first for a cache-stable prefix, variable suffix built
    last); `promptVersion` is tracked **per stage**. Invariants (never reopen
    done tasks, user-managed fields win, link dedup, id grounding) are
    enforced in the apply step in code — prompts state them, code guarantees
    them. The `SyncJob` checkpoint records "routed, not yet written" so a
    lease-expiry re-claim re-runs writers idempotently instead of leaving
    label-titled task shells visible.
- **Mobile-first notes composer.** Collapsed "Add a note" row (≥44px target)
  expands in place to a full-width autosizing textarea with a Cancel/Save row
  beneath — no side-by-side textarea+button at any width. Placeholder text
  carries the "context for Yagyu" meaning.
- **Side panel stays on the right.** Desktop `aside` and mobile sheet are
  already right-anchored in the working tree; this plan documents it in
  `docs/UI_DESIGN.md` and verifies it in the visual harness rather than
  changing code.
- **Reorder override exists in v1; reorder UI is deferred.** `UpdateTask`
  accepts an optional `stackRank`, and the first manual rank write flips the
  category's `rankingMode: ai → manual` — without this endpoint the documented
  transition would be dead code. Drag-to-reorder UI ships in a follow-up; v1
  renders rank order.
- **Palette rules resolved with the design system, not around it** (staff-
  designer audit): category kickers render in `ink-muted` (the mono kicker
  already differentiates; no per-category hues, and `Category` carries no
  color field in v1). `docs/UI_DESIGN.md` gains two explicit amendments —
  primary indigo may mark AI-generated content as a thin edge/kicker accent,
  and destructive extends to overdue/blocking task states. The "re-analysis
  queued" indicator is sentence-case Inter `ink-muted` text beside the note
  timestamp (one mono quirk per section). Done tasks render full-opacity
  `ink-muted` with strikethrough — no sub-50% opacity text.
- **All three interaction states are specified.** Loading: skeleton rows
  matching collapsed-row height (no layout shift). Error: inline load-failure
  card with retry. Empty: three variants — "no tasks yet" (evolved from the
  current card), "filter has no tasks," and "all done" (the earned Zen
  moment).

## File-by-File Changes

### packages/shared

- `src/schemas/task.ts` (new) — Zod schemas + inferred types for
  `CategoryResponse`, `TaskResponse` (with next steps, notes, linked email
  summaries), `TaskListQuery`, `UpdateTask` (status + optional `stackRank`),
  `UpdateNextStep`, `CreateTaskNote`.
- `src/schemas/triage.ts` (new) — the per-stage AI output schemas
  (`ScreenDecision`, `RouteDecision` with local new-task refs,
  `TaskWriteDecision`) shared by the API prompt code, the benchmark harness,
  and tests.
- `src/schemas/env.ts` (mod) — add `CRON_SECRET`, `NEON_WORKER_DATABASE_URL`,
  `GOOGLE_PUBSUB_TOPIC`, `PUBSUB_PUSH_SERVICE_ACCOUNT` (last two optional:
  absent = polling-only mode), plus optional `AI_MODEL_SCREEN`,
  `AI_MODEL_ROUTE`, and `AI_MODEL_WRITE` stage overrides (each falls back to
  `DEFAULT_AI_MODEL`).
- `src/index.ts` (mod) — export the new schema modules.

### apps/api

- `src/email-accounts/entities/email-account.entity.ts` (mod) — add
  `syncCursor`, `lastSyncedAt`, `initialSyncCompletedAt`, `watchExpiresAt`,
  `syncStatus` enum.
- `src/email-sync/entities/email-message.entity.ts` (new) — normalized message
  (user FK — required by its RLS isolation policy — plus emailAccount FK,
  unique `(emailAccount, providerMessageId)`, sender/subject/snippet/bodyText/
  receivedAt/threadId, `analysisStatus`).
- `src/email-sync/entities/sync-job.entity.ts` (new) — job ledger row
  (account FK, kind: backfill|incremental|analyze|reanalyze, status, attempts,
  runAfter, `leasedUntil`, checkpoint jsonb, lastError).
- `src/email-sync/gmail-client.ts` (new) — thin Gmail REST wrapper over
  `OAuth2Client` (messages.list/get, history.list, watch) with token refresh.
- `src/email-sync/email-sync.service.ts` (new) — claim jobs with
  `FOR UPDATE SKIP LOCKED`, run bounded backfill/incremental sync, advance
  cursor transactionally, renew expiring watches, requeue with backoff.
- `src/email-sync/email-sync.controller.ts` (new) —
  `POST /api/internal/gmail/notifications` (Pub/Sub push) and
  `POST /api/internal/sync/run` (cron): validate, delegate to
  `EmailSyncService.enqueue(...)`, respond, then drain via `waitUntil`
  (controller stays thin; upsert/drain/self-chain logic lives in the service).
- `src/email-sync/guards/cron-secret.guard.ts` (new) — constant-time
  comparison of the `Authorization` bearer against `CRON_SECRET`.
- `src/email-sync/guards/pubsub-oidc.guard.ts` (new) — verify the Pub/Sub
  OIDC token audience + service-account email via `OAuth2Client`.
- `src/email-sync/email-sync.module.ts` (new) — wire entities, guards,
  services; provide the lazy `getWorkerEm()` factory (pool max 1, cached
  across warm invocations).
- `src/triage/entities/automation-run.entity.ts` (new) — append-only audit:
  user FK, `stage` (screen|route|write), nullable email FK, nullable task FK,
  per-stage `promptVersion`, model, Zod-validated `appliedChanges` jsonb, and
  per-call telemetry (`tokensIn`, `tokensOut`, `latencyMs`) so quality/cost
  drift is observable in production.
- `src/triage/prompts/screen.prompt.ts`, `route.prompt.ts`,
  `write.prompt.ts` (new) — versioned prompt modules: each exports
  `PROMPT_VERSION`, a static system prompt (cache-stable prefix), and a
  variable-suffix builder.
- `src/triage/triage.service.ts` (new) — claims `analyze`/`reanalyze` jobs
  from the ledger like any other kind and orchestrates the stages: parallel
  screeners → one router call per actionable slice → parallel per-touched-
  task writers → deterministic ranker; applies changes in a transaction
  enforcing the user-precedence and id-grounding invariants; checkpoints
  "routed, not yet written" for idempotent resume.
- `src/triage/triage.module.ts` (new) — module wiring.
- `src/ai/ai.service.ts` (mod) — add `generateStructured<T>` using
  `generateObject` with a Zod schema.
- `src/tasks/entities/category.entity.ts` (new) — name, summary, `managedBy`,
  `rankingMode`, sortOrder, user FK (no color field in v1 — see palette
  decision).
- `src/tasks/entities/task.entity.ts` (new) — title, notes-free (context lives
  on AI fields), status (open|done), dueDate (date-only), priority, stackRank,
  `managedBy`, aiContext, aiRecommendedAction, category FK, user FK.
- `src/tasks/entities/task-next-step.entity.ts` (new) — title, completedAt,
  sortOrder, task FK.
- `src/tasks/entities/task-note.entity.ts` (new) — body, task FK, user FK
  (append-only).
- `src/tasks/entities/task-email.entity.ts` (new) — unique (task, email) join
  with `linkedBy`.
- `src/tasks/tasks.service.ts` (new) — list open tasks (rank order, category
  filter), mark done/reopen, manual `stackRank` write (flips the category's
  `rankingMode` to manual on first use), toggle next step, append note
  (+ enqueue reanalyze job).
- `src/tasks/tasks.controller.ts` (new) — `GET /api/tasks`,
  `PATCH /api/tasks/:id`, `PATCH /api/tasks/:id/next-steps/:stepId`,
  `POST /api/tasks/:id/notes`, `GET /api/categories`.
- `src/tasks/tasks.module.ts` (new) — module wiring.
- `src/mikro-orm.config.ts` (mod) — register the **eight** new entities
  statically (EmailMessage, SyncJob, AutomationRun, Category, Task,
  TaskNextStep, TaskNote, TaskEmail).
- `src/app.module.ts` (mod) — register `EmailSyncModule`, `TriageModule`,
  `TasksModule` only — no named worker connection (see the lazy factory in
  `EmailSyncModule`).
- `migrations/MigrationXXXXXXXXXXXX.ts` (new) — all new tables with
  ENABLE + FORCE RLS and isolation policies; `worker_user` role with
  `using (true)` policies on pipeline tables; indexes for job claiming
  (`status, runAfter`) and task listing (`user, status, category, stackRank`).

### apps/web

- `src/features/tasks/use-tasks.ts` (new) — fetch tasks + categories,
  optimistic done/undo, next-step toggle, note append.
- `src/features/tasks/task-list.tsx` (new) — filter pills (≥44px tap height,
  hidden scrollbar with right-edge fade, 16px leading padding on mobile), undo
  bar, rank-ordered list, skeleton loading rows matching collapsed-row height,
  inline error card with retry, and three empty variants (no tasks yet /
  filter empty / all done).
- `src/features/tasks/task-card.tsx` (new) — collapsed row (done circle ≥44px
  hit area, `ink-muted` category kicker, title, due/steps/notes meta with
  destructive-red overdue) + expanded detail (AI context, indigo-edged
  recommended action per the UI_DESIGN carve-out, next steps, linked emails,
  notes); done tasks render full-opacity `ink-muted` + strikethrough; mobile
  sections align to card padding, no fixed left indent.
- `src/features/tasks/task-note-composer.tsx` (new) — collapsed add-note row
  expanding to full-width textarea + Cancel/Save row; after save the note
  shows sentence-case `ink-muted` "Re-analysis queued" text beside its
  timestamp.
- `src/components/icons.tsx` (mod) — add chevron/check/plus stroke icons as
  needed, following the existing hand-inlined SVG convention.
- `src/pages/tasks.tsx` (mod) — replace empty-state card with the composed
  tasks feature (kept thin).

### config / docs / harness

- `vercel.json` (mod) — add `crons`: `*/10 * * * *` → `/api/internal/sync/run`.
- `.env.example` (mod) — new env vars with comments.
- `ARCHITECTURE.md` (mod) — Entity Model (all new entities + EmailAccount
  fields), Data Flow (Sync/Triage/Tasks rewritten to the job-ledger design
  and the four-stage triage pipeline), Key Invariants (cursor-after-flush;
  AI never reopens user-completed tasks; user-managed fields win; notes
  append-only; worker role least-privilege; worker ORM is lazy — never
  bootstrapped by user traffic; job claims commit a lease before work begins;
  every batch checkpointed under the 30s limit; the router only writes
  structure and the writer only writes content — neither crosses over;
  router ids are grounded against the digest sent in that call; prompt
  system prefixes stay static for cache stability), deployment notes (cron +
  Pub/Sub setup, Vercel Pro requirement).
- `docs/UI_DESIGN.md` (mod) — document right-anchored side panel explicitly;
  add task-card + note-composer patterns to §5; amend the palette rules with
  the two audited carve-outs (primary indigo as thin edge/kicker accent on
  AI-generated content; destructive extended to overdue/blocking task states).
- `harness/validate-local.mjs` (mod) — assert `/tasks` renders the task list
  region (not just any content) in the screenshot pass.
- `harness/bench-triage.mjs` + `harness/fixtures/triage/` (new) — the triage
  benchmark (`pnpm bench:triage`): ~30 synthetic fixture emails (noise,
  single actionable, multi-task email, follow-up to an existing task,
  new-category case) plus ~5 end-to-end fixtures graded on final task state
  through all four stages. Programmatic golden checks for screen (recall and
  precision reported separately — recall gates) and route (target ids);
  checklist/LLM-rubric grading only for writer prose. Reports per-stage
  accuracy, tokens in/out, latency, and estimated cost per email. Before the
  decomposition lands, the original single mega-call design is run once
  through the same harness to record the baseline table — the decomposition
  must beat it, not just look cleaner.
- `package.json` (mod, root) — add the `bench:triage` script.

## Test Strategy

P0 cases (written in a separate generate-test pass):

- Zod: `ScreenDecision` / `RouteDecision` / `TaskWriteDecision`, task API
  payloads, env schema additions.
- `EmailSyncService`: cursor advances only with persisted messages; history
  404 falls back to bounded 60-day resync; SKIP LOCKED claims a job exactly
  once under concurrency; a `running` job past `leasedUntil` is re-claimed
  while a live lease is skipped by a concurrent drain; retries/backoff on
  failure.
- `TriageService`: never reopens a done task; never edits user-managed
  fields; duplicate `TaskEmail` links are no-ops; `AutomationRun` written in
  the same transaction; a new note enqueues a reanalyze job; a router
  decision referencing an id absent from the digest sent in that call is
  rejected and recorded; a re-claimed job in "routed, not yet written" state
  re-runs writers idempotently; the writer preserves completed next steps.
- Guards: cron-secret rejects missing/wrong bearer; Pub/Sub OIDC guard
  rejects bad audience/issuer.
- `TasksService`: list excludes done by default; done + undo round-trip;
  note append is user-scoped under RLS.
- Web: `use-tasks` optimistic done with rollback on API failure; note
  composer expand/save/collapse behavior.

## Documentation Impact

Covered in the file list above: `ARCHITECTURE.md` (Entity Model, Data Flow,
Key Invariants, deployment), `.env.example`, `docs/UI_DESIGN.md` (side panel
placement + new component patterns), `harness/validate-local.mjs`.

## Risks

1. **30s function ceiling vs backfill volume.** Mitigation: checkpoint column
   on `SyncJob`, hard per-invocation caps (e.g. 50 messages fetched, 10 emails
   analyzed), jobs re-claimed until drained.
2. **Google OAuth app in "Testing" mode expires refresh tokens after 7 days.**
   Mitigation: surface `syncStatus: 'reauth_required'` on the account and in
   Sources; schedule app verification before launch.
3. **Pub/Sub topic + push subscription are manual GCP setup.** Mitigation:
   feature degrades gracefully to 10-minute polling when `GOOGLE_PUBSUB_TOPIC`
   is unset; setup steps documented in ARCHITECTURE.md.
4. **AI output quality/cost drift.** Mitigation: per-stage versioned prompts,
   per-call `AutomationRun` audit with token/latency telemetry, per-run
   analysis caps, stage-local models pinned via `AI_MODEL_SCREEN` /
   `AI_MODEL_ROUTE` / `AI_MODEL_WRITE` with `DEFAULT_AI_MODEL` fallbacks, and
   the `bench:triage` harness as the standing regression net for prompt and
   model changes.
5. **Screener false negatives silently lose tasks.** Mitigation: prompt
   biased actionable-when-unsure, recall gates the benchmark, and reanalyze
   jobs re-screen skipped emails in threads that later prove actionable.
