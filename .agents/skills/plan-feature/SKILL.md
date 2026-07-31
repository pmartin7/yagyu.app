# plan-feature

Drafts a file-by-file implementation plan for a feature, then delegates to staff-engineer for audit.

Requires research output (options + recommendation) from research-feature. Read AGENTS.md before starting.

## Phase 1 — Draft Plan

Write a plan with these sections:

### Summary

One paragraph describing what will be built and why.

### Design Decisions

Bullet list of key decisions made (data model choices, API shape, component structure). Each decision gets one sentence of rationale.

### File-by-File Changes

For each file: path, whether new or modified, one-sentence description of what changes and why.
Group by layer: packages first, then api, then web.

### Test Strategy

List P0 test cases (auth guard, service logic, Zod schemas, critical UI behaviour).
Note: tests are written in a separate agent pass via generate-test.

### Documentation Impact

Name the docs this feature makes stale, and the edit each one needs. Treat it as
part of the file list, because build-plan will work it as Phase 5:

- new/changed routes or guards → Route Map in `ARCHITECTURE.md`
- new entities or fields → Entity Model in `ARCHITECTURE.md`
- new env vars → `.env.example`
- changed flows → Data Flow in `ARCHITECTURE.md`
- rules future code must obey → Key Invariants in `ARCHITECTURE.md`
- new harness routes or assertions → `harness/`

Write "none" only if the feature is genuinely invisible in all of the above.

### Risks

List 2–4 things that could go wrong during implementation. For each: risk description + mitigation.

## Phase 2 — Staff Engineer Audit

Delegate to staff-engineer agent (Mode B):

- Provide the full plan
- Provide AGENTS.md Golden Principles as context

Apply the staff-engineer's edits to the plan.

## Phase 3 — Present

Show the final audited plan to the user. Ask: "Ready to build? Run /build-plan to implement this plan."
