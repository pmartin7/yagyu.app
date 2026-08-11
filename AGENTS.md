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
harness/               Agent-facing harnesses: visual checks, deploy checks, docs sync
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
pnpm check        # lint + type-check + docs:check
pnpm validate     # check + tests + docs:check
pnpm test
pnpm docs:check   # assert routes/entities/env vars still match the docs
pnpm format       # prettier --write (also runs on save + pre-commit + CI check)
pnpm validate:local   # boot + drive web app headlessly, screenshots → harness/artifacts/
pnpm validate:deploy  # verify Vercel deployments are READY and live site renders
pnpm playwright:install  # one-time Chromium install for the harnesses
```

The Playwright harnesses need real permissions: Chromium segfaults inside the
agent sandbox, so run `validate:local` / `validate:deploy` with full permissions.
They now say so explicitly instead of re-downloading the browser.

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
8. Docs are part of the change. Routes, entities, env vars, flows, and
   invariants get updated in the same pass, verified by `pnpm docs:check`.
   Stale docs are worse than none — every future agent inherits the error.
9. Harness before infra. Before adding a new piece of the stack (mobile app,
   queue, cache, search), evaluate the options, then build the harness that
   proves it works and the doc that explains it — then build the thing. An
   agent cannot iterate on what it cannot observe.

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
7. Update the docs your change made stale, in this same pass, and record any
   invariant you discovered (see `.agents/rules/documentation-currency.mdc`)

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
| optimize-ai           | /optimize-ai      | Benchmark + optimize AI models, prompts, and configuration  |
| validate-app          | /validate-app     | Visual local validation + deployment verification harnesses |
| release               | /release          | Promote work local → staging → main with gates at each step |

## 10) Anti-Patterns

Do not:

- introduce a second UI system or component library
- mix validation systems (Zod only)
- add default exports
- log secrets or full payloads
- skip pnpm check after edits
- create docs that duplicate information already in another doc
- ship a route, entity, env var, or flow change without updating `ARCHITECTURE.md`
- leave a hard-won invariant recorded only in a chat, a commit message, or a
  `docs/plans/` file
- add a new piece of the stack before its harness and its doc exist
- reinstall Chromium when a harness fails — read its remediation line first
