# build-plan

Implements a feature plan using parallel subagents, validates, and runtime-verifies.

Requires a completed plan from plan-feature. Read AGENTS.md and the plan before starting.

## Phase 1 — Orient

Read:
1. The feature plan
2. ARCHITECTURE.md
3. docs/STYLE_GUIDE.md
4. Any existing files the plan says to modify

Do not read files not referenced by the plan.

## Phase 2 — Implement

Implement in dependency order using parallel subagents where possible:

1. **packages layer first** — any changes to packages/shared (Zod schemas, types)
2. **api and web in parallel** — once packages are done, implement api changes and web changes simultaneously using two subagents

Each subagent receives:
- Its specific file list from the plan
- Relevant excerpts from AGENTS.md (Golden Principles, conventions)
- Relevant excerpts from docs/STYLE_GUIDE.md
- The Zod schemas from packages/shared it needs to use

## Phase 3 — Validate

Run from repo root:
```bash
pnpm check
```

If errors: fix and rerun once. If errors remain after one fix pass, report them and stop.

## Phase 4 — Runtime Verify

Start dev server:
```bash
pnpm dev
```

Use browser tools to:
1. Navigate to the affected route(s)
2. Verify the feature works as specified
3. Check for console errors

Report what was verified and any issues found.
