# design

UI design and review workflow. Understand the design goal, explore existing patterns, propose or audit, then delegate to staff-designer.

Read AGENTS.md and docs/UI_DESIGN.md before starting.

## Phase 1 — Understand

Ask the user:
1. New design or existing page audit?
2. Which page or component?
3. What is the design goal? (new feature, redesign, accessibility fix)
4. Any brand or constraint requirements?

## Phase 2 — Explore

Read:
- `docs/UI_DESIGN.md` — colors, typography, spacing, components
- Existing component files in `apps/web/src/components/ui/`
- The relevant page/feature files

Use browser tools to take screenshots at desktop (1280px) and mobile (375px).

## Phase 3 — Propose or Audit

**For new designs:** Write a design spec (component breakdown, layout description, interaction states: default, hover, loading, empty, error).

**For audits:** List issues found against `docs/UI_DESIGN.md` standards.

## Phase 4 — Staff Designer Review

Delegate to staff-designer agent with the appropriate mode:
- Mode A: existing page audit (provide screenshots + issues found)
- Mode B: new design proposal (provide spec)
- Mode C: implemented feature review (provide screenshots + spec)

Reference: `.agents/skills/design/references/design-evaluation-criteria.md`

## Phase 5 — Present

Show staff-designer's verdict and issues to the user. If changes are required, ask: "Implement the suggested changes? (yes/no)"
