# init-project

Conversational setup wizard. Transforms a bare morpheus-starter clone into a configured, deployed product in one agent session.

Read AGENTS.md and ARCHITECTURE.md before starting.

## Phase 1 — Gather Product Context

Use the AskQuestion tool to collect:

1. Product name (used for GitHub repo name, display name in app)
2. One-sentence product description (used in AGENTS.md Product Context)
3. Target user (who uses this — developer, consumer, business team?)
4. Does the app need AI chat? (yes/no — if no, chat module is removed)
5. AI provider preference (Anthropic / OpenAI / both)
6. File upload needed? (yes/no — determines whether to run add-blob-storage)
7. Vector search needed? (yes/no — determines whether to run add-vector-store)
8. GitHub account confirmed + Vercel account confirmed? (prerequisite check)

## Phase 2 — Generate AGENTS.md

Rewrite `AGENTS.md` with:
- Section 1 (Product Context): product description, target user, domain glossary (5–10 key terms), editorial positioning
- Keep all other sections exactly as-is

## Phase 3 — Generate ARCHITECTURE.md

Rewrite `ARCHITECTURE.md` with:
- Route map updated for the product's actual pages
- Entity model updated if product needs additional entities
- Data flow section updated for the actual features
- Keep deployment and key invariants sections as-is

## Phase 4 — Customize UI_DESIGN.md (optional)

If the founder wants brand customization, ask for:
- Primary brand color (hex)
- Two brand adjectives (e.g. "precise, minimal")
- Any font preferences

Update `docs/UI_DESIGN.md` with the provided values, replacing {PLACEHOLDER} tokens.

## Phase 5 — Provision Infrastructure

Run these shell commands in sequence. Stop and report if any fails.

```bash
# Create GitHub repo
gh repo create {PROJECT_NAME} --public --source=. --remote=origin --push

# Install dependencies
pnpm install

# Link to Vercel
vercel link

# Add environment secrets
vercel env add NEON_DATABASE_URL production
vercel env add FIREBASE_PROJECT_ID production
vercel env add FIREBASE_PRIVATE_KEY production
vercel env add FIREBASE_CLIENT_EMAIL production
vercel env add DEFAULT_AI_MODEL production
vercel env add ANTHROPIC_API_KEY production  # if anthropic
vercel env add OPENAI_API_KEY production     # if openai

# Run initial migration
pnpm migrate:up

# Push and deploy
git add .
git commit -m "feat: init project — {PROJECT_NAME}"
git push
vercel deploy --prod
```

## Phase 6 — Handoff

Print:
1. Live URL from Vercel
2. GitHub repo URL
3. List of available skills with triggers (from AGENTS.md section 9)
4. Next suggested action: "Run /research-feature to plan your first feature"
