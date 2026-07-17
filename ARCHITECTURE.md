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

| Screen | Purpose |
|--------|---------|
| Onboarding | Connect email accounts (Gmail/Outlook OAuth) |
| Triage feed | Prioritized inbox across all accounts |
| Needs Action | Emails requiring a response/decision |
| Message detail | AI summary (AI Context) + recommended actions |
| Categories | View/manage dynamic + manual categories, recategorize |
| Todos | List, add, edit, complete, snooze, recategorize |
| Settings | Accounts, notifications |

### Route Map (apps/web — marketing/landing)

| Route | Page | Auth |
|-------|------|------|
| / | Landing page | No |
| /login | Firebase auth | No |

### Entity Model

All entities extend `BaseEntity`.

```
BaseEntity (abstract): id (UUID), createdAt, updatedAt
├── User: firebaseUid, email, displayName, pushToken (nullable)
├── EmailAccount: provider (enum: gmail | outlook), emailAddress, displayName,
│     syncCursor (nullable), status (enum: active | error | disconnected),
│     user (FK)
│     — OAuth tokens (refresh token) stored securely, referenced from here
├── EmailMessage: providerMessageId, threadId, emailAccount (FK), sender,
│     subject, snippet, receivedAt, isRead, priorityScore (float),
│     needsAction (bool), aiSummary (text, nullable),
│     aiRecommendedActions (jsonb, nullable), category (FK, nullable), user (FK)
├── Category: name, isDynamic (bool), color, sortOrder, user (FK)
└── Todo: title, notes (nullable), status (enum: open | done | snoozed),
      dueDate (nullable), source (enum: email | manual), category (FK),
      contextSummary, recommendedActions
```

Only `User` exists in code today; the other entities are added as their
features are built. Keep this model as the reference when adding them.

### Data Flow

```
Auth:    Client (mobile/web) → Firebase SDK → JWT → API Guard → verify → getOrCreate User
Sync:    Provider (Gmail/Outlook) → apps/api email sync → EmailMessage rows (per EmailAccount syncCursor)
Triage:  New EmailMessage → AI SDK (Anthropic) → priorityScore, needsAction, aiSummary,
         aiRecommendedActions, dynamic Category assignment
Todos:   EmailMessage (Needs Action) → auto-generated Todo | manual Todo → CRUD via /api/todos
Push:    apps/api → expo-notifications (User.pushToken) → mobile device
CRUD:    Client → fetch → /api/{resource} → Guard → Service → MikroORM → Neon Postgres
```

### Deployment

```
GitHub → push to main → Vercel auto-deploy
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
