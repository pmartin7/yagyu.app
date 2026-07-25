# Plan: Gmail Account Linking (GIS popup code flow)

Status: audited by staff-engineer — ready for /build-plan.
Research: /research-feature recommended Option B (Google Identity Services popup code flow).

## Summary

Let a signed-in user link one or more Gmail accounts to their Yagyu user. The web
app opens a Google OAuth consent popup via Google Identity Services (GIS)
`initCodeClient`, receives an authorization code without leaving the SPA, and
POSTs it to a new `email-accounts` API. The API exchanges the code server-side
with `google-auth-library`, resolves the Gmail address from the ID token (the
popup requests `openid email` alongside `gmail.readonly` so the exchange returns
one), and stores an `EmailAccount` row with an AES-256-GCM-encrypted refresh
token. A new protected `/settings` page lists linked accounts and offers unlink;
the top banner gains a settings button and an initials avatar with a sign-out
menu; the welcome screen gains a "Link your Gmail" CTA that triggers the same
popup flow. Nothing reads or syncs email yet.

## Data Model

```
User (existing, unchanged)                EmailAccount (new)
├── id            uuid PK                 ├── id                    uuid PK
├── createdAt     timestamptz             ├── createdAt             timestamptz
├── updatedAt     timestamptz             ├── updatedAt             timestamptz
├── firebaseUid   text, unique            ├── provider              enum: 'gmail'
├── email         text, unique            ├── emailAddress          text (lowercased)
└── displayName   text, nullable          ├── encryptedRefreshToken text (hidden)
                                          └── user                  FK → User, ManyToOne
        1 ────────────────────── *
        User          EmailAccount
```

- **`User`** is the app identity, created on first authenticated request via
  `getOrCreate` from the Firebase ID token. Its `id` is the immutable user id;
  `email` is the sign-in email (email/password or Google login). This feature
  does not modify it.
- **`EmailAccount`** is one linked Gmail mailbox. A user can have many; each
  row belongs to exactly one user (`ManyToOne`, required). Deleting a row is
  the "unlink" operation — no soft delete, no status column yet.
- **`provider`** is an enum with only `'gmail'` today, matching the column
  shape ARCHITECTURE.md plans for Outlook later.
- **`emailAddress`** is the Gmail address taken from the OAuth ID token,
  normalized to lowercase. It is unique **per user**, not globally:
  `@Unique({ properties: ['user', 'emailAddress'] })`. Two different users may
  link the same mailbox; one user re-linking the same address updates the
  existing row (token replacement) instead of creating a duplicate.
- **`encryptedRefreshToken`** stores `iv:authTag:ciphertext` (AES-256-GCM,
  key = `TOKEN_ENCRYPTION_KEY`). Marked `hidden: true` so MikroORM never
  serializes it; API responses expose only id, provider, emailAddress,
  createdAt via `EmailAccountResponseSchema`.
- Both entities extend `BaseEntity` (uuid `id`, `createdAt`, `updatedAt`).
  Deferred from the ARCHITECTURE.md `EmailAccount` model until sync exists:
  `syncCursor`, `status`, `displayName`.

## Design Decisions

- **GIS popup code flow** (`google.accounts.oauth2.initCodeClient`, popup mode,
  code exchanged server-side with `redirect_uri: 'postmessage'`): keeps the user
  in the SPA, no callback route, no per-environment redirect URI registration.
- **Exact scope string** (set client-side in `initCodeClient`):
  `'openid email https://www.googleapis.com/auth/gmail.readonly'`. The Gmail
  scope must be the full URL, and Google only guarantees an `id_token` in the
  code exchange when `openid` is requested (`email` adds the email claim to
  it). Without these the API cannot resolve which address was linked.
- **API rejects exchanges that return no `refresh_token`**: `CodeClientConfig`
  has no `prompt` option (that exists only on the token client), so consent
  cannot be forced from config — and doesn't need to be: the GIS code client
  always requests offline access and shows Google's consent dialog itself, so
  the exchange returns a refresh token. The server-side guard is the invariant
  regardless: never store a null token silently; fail with an actionable error
  (remove Yagyu's access at myaccount.google.com/permissions and retry).
- **API verifies granted scopes include `gmail.readonly`**: users can uncheck
  scopes on the consent screen; a link without mail access is useless later.
- **New `EmailAccount` entity, minimal subset of the ARCHITECTURE.md model**:
  `provider` (enum, only `gmail` for now), `emailAddress`,
  `encryptedRefreshToken`, `user` FK, composite unique on `(user, emailAddress)`.
  `syncCursor`, `status`, `displayName` are deferred until sync exists (YAGNI);
  the enum keeps the column shape ARCHITECTURE.md plans for Outlook.
- **Re-linking an already-linked address replaces the stored token** rather
  than erroring: matches user intent and refreshes a possibly-revoked token.
  Implemented as an explicit `findOne` on `(user, emailAddress)` then
  update-or-create — not `em.upsert`, which needs `onConflictFields` tuning
  against the composite unique and obscures the flow. The unique index remains
  as a backstop for the concurrent-link race. Email addresses are normalized to
  lowercase before matching.
- **No separate Google OAuth wrapper service**: a wrapper with one caller is a
  layer, not a boundary. `EmailAccountsService` receives an injected
  `OAuth2Client` (module-level factory provider built from env); tests mock the
  client via DI.
- **Refresh token encrypted at rest with AES-256-GCM**: single
  `TOKEN_ENCRYPTION_KEY` env var (base64, must decode to exactly 32 bytes,
  Zod-validated), random IV per record, `iv:authTag:ciphertext` stored in one
  text column. Plain Node `crypto`, no new dependency.
- **API responses never contain token material**: controller maps entities
  through `EmailAccountResponseSchema` (id, provider, emailAddress, createdAt);
  the entity column is also marked `hidden: true` as defense in depth.
- **Unlink = best-effort revoke at Google, then delete the row**: revocation can
  fail for already-invalid tokens; the row is deleted regardless.
- **API surface**: `GET /api/email-accounts`, `POST /api/email-accounts/google`
  (`{ code }`), `DELETE /api/email-accounts/:id` — all behind `FirebaseAuthGuard`.
  Every endpoint, including DELETE, returns the standard `ApiResponse` JSON
  envelope (never 204): the web `apiRequest` unconditionally calls
  `response.json()`.
- **Header UI**: a gear icon button linking to `/settings` plus an initials
  avatar opening a shadcn `dropdown-menu` with Sign out (moved out of the bare
  button). The avatar is a styled `div` with initials — no shadcn `avatar`
  component needed since there is no image (YAGNI).
- **Welcome CTA triggers the popup directly** via the same hook the settings
  page uses, then confirms inline — no forced detour through settings.
- **`VITE_GOOGLE_CLIENT_ID`** read the same way `lib/firebase.ts` reads
  `VITE_FIREBASE_*` (no new env framework in web).

## File-by-File Changes

### repo root

| File | New/Mod | Change |
|------|---------|--------|
| `.env.example` | Mod | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (comment: generate with `openssl rand -base64 32`), and `VITE_GOOGLE_CLIENT_ID` (web, build-time). This is the repo's only `.env.example`. |

### packages/shared

| File | New/Mod | Change |
|------|---------|--------|
| `src/schemas/email-account.ts` | New | `EmailAccountProviderSchema` (`z.enum(['gmail'])`), `LinkGmailAccountSchema` (`{ code: z.string().min(1) }`), `EmailAccountResponseSchema` (id, provider, emailAddress, createdAt) + inferred types. |
| `src/schemas/env.ts` | Mod | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (base64 string refined to decode to 32 bytes). |
| `src/index.ts` | Mod | Export `./schemas/email-account.js`. |

### apps/api

| File | New/Mod | Change |
|------|---------|--------|
| `src/email-accounts/entities/email-account.entity.ts` | New | `EmailAccount extends BaseEntity`: `provider`, `emailAddress`, `encryptedRefreshToken` (`hidden: true`), `user` ManyToOne; `@Unique({ properties: ['user', 'emailAddress'] })`. |
| `src/email-accounts/token-cipher.ts` | New | `encryptToken` / `decryptToken` using AES-256-GCM (Node `crypto`), key from env. Lives in the feature folder — it has exactly one consumer and no `src/common/lib/` exists; promote to common only when a second consumer appears. |
| `src/email-accounts/email-accounts.service.ts` | New | Injects `EntityManager` + `OAuth2Client`. `linkGmail(user, code)`: `getToken({ code, redirect_uri: 'postmessage' })` → reject if no `refresh_token` or granted `scope` lacks `gmail.readonly` → decode the `id_token` payload for the email (no signature verification needed — it came directly from Google's token endpoint over TLS), lowercase it → `findOne({ user, emailAddress })`, update encrypted token or create row. `list(user)`. `unlink(user, id)`: `findOne({ id, user })` else 404; decrypt token, best-effort revoke at Google; delete row regardless. |
| `src/email-accounts/email-accounts.controller.ts` | New | Guarded thin controller for the three endpoints; validates body with `ZodValidationPipe(LinkGmailAccountSchema)`; maps entities to `EmailAccountResponseSchema` shape. All responses — including DELETE — use the standard `ApiResponse` JSON envelope, never 204. |
| `src/email-accounts/email-accounts.module.ts` | New | `MikroOrmModule.forFeature([EmailAccount])` (same pattern as `UsersModule`); providers: `EmailAccountsService` + a factory provider for `OAuth2Client` built from `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. |
| `src/app.module.ts` | Mod | Import `EmailAccountsModule`. |
| `migrations/` (generated) | New | Two migrations, not one — see Risk 3. (1) Baseline the existing `user` table with `pnpm migrate:create --initial` (root script; extra args pass through to `mikro-orm migration:create`). (2) After adding the entity, `pnpm migrate:create` emits the `email_account` diff (FK to `user`, composite unique index). |
| `package.json` | Mod | Add `google-auth-library`. (No script changes needed — the root `package.json` already provides `migrate:create` / `migrate:up` delegating to this package's `mikro-orm` bin.) |

### apps/web

| File | New/Mod | Change |
|------|---------|--------|
| `src/lib/google-identity.ts` | New | Loads the GIS script once on demand; `requestGmailAuthCode(): Promise<string>` wrapping `initCodeClient` (popup mode, scope `'openid email https://www.googleapis.com/auth/gmail.readonly'`; no `prompt` option — it does not exist on `CodeClientConfig`). Wire `error_callback` to reject the promise (popup blocked / closed / GIS load failure) — otherwise it hangs forever. Minimal inline types for `window.google`; reads `VITE_GOOGLE_CLIENT_ID`. |
| `src/features/email-accounts/use-email-accounts.ts` | New | Hook: fetch list, `link()` (GIS code → POST with Firebase token), `unlink(id)`; loading/error state; uses `apiRequest` + `useAuth().getToken()`. |
| `src/features/email-accounts/linked-accounts-section.tsx` | New | "Linked accounts" card: list of Gmail addresses with Unlink buttons, "Link Gmail account" button, empty state. |
| `src/pages/settings.tsx` | New | Settings page composing `LinkedAccountsSection` (thin route file). |
| `src/components/ui/dropdown-menu.tsx` | New | shadcn dropdown-menu (Radix) for the avatar menu. |
| `src/components/user-avatar-menu.tsx` | New | Initials avatar (from displayName/email) as dropdown trigger; menu contains Sign out (navigates to `/login` after). |
| `src/app/layout.tsx` | Mod | Signed-in state: settings gear icon button (`Link` to `/settings`) + `UserAvatarMenu`, replacing the bare Sign out button. Signed-out state unchanged. |
| `src/app/router.tsx` | Mod | Add `/settings` under `ProtectedRoute`. |
| `src/pages/welcome.tsx` | Mod | Add "Link your Gmail" CTA using `use-email-accounts.link()`, with linked-state confirmation and a small "Manage in settings" link. |
| `package.json` | Mod | Add `@radix-ui/react-dropdown-menu` (shadcn dropdown dependency). |

## Test Strategy (P0 — written in a separate generate-test pass)

- **Zod**: `LinkGmailAccountSchema` rejects empty/missing code; env schema
  rejects a `TOKEN_ENCRYPTION_KEY` that is not 32 bytes when decoded.
- **token-cipher**: encrypt→decrypt round-trip; decrypt fails on tampered
  ciphertext/auth tag.
- **EmailAccountsService** (`OAuth2Client` mocked via DI): rejects exchange
  result missing `refresh_token`; rejects missing `gmail.readonly` scope;
  re-link of same `(user, emailAddress)` updates the row instead of
  duplicating; `unlink` deletes even when revoke throws; `unlink` of another
  user's account id → 404.
- **Controller**: endpoints reject requests without a valid bearer token;
  list/link responses never include token fields.
- **Web**: `use-email-accounts.link()` posts the GIS code with auth token (GIS
  mocked); `LinkedAccountsSection` renders accounts and calls unlink;
  `UserAvatarMenu` shows correct initials and signs out; welcome CTA triggers link.

## Risks

1. **Google returns no `refresh_token`** (user previously consented without
   revoking). There is no `prompt` knob on the GIS code client to force
   re-consent. Mitigation: the GIS code-flow consent dialog yields a refresh
   token in practice; when it doesn't, the API fails loudly with an actionable
   message ("remove Yagyu at myaccount.google.com/permissions and retry")
   rather than storing nothing.
2. **Popup blocked / GIS script fails to load.** Mitigation: only invoke the
   popup from a direct click handler (user gesture); `error_callback` rejects
   the wrapper promise so the UI surfaces a clear error instead of hanging.
3. **First-ever migration in a repo whose schema is not empty** — the `user`
   table already exists (created outside migrations) and there is no snapshot,
   so a naive `migration:create` emits the full schema and `migrate:up` fails
   on `create table "user"`. Mitigation: baseline first with
   `pnpm migrate:create --initial` (MikroORM marks the initial migration as
   executed on databases where the schema already exists), then add the entity
   and run `pnpm migrate:create` for the `email_account` diff. Review both SQL
   files by hand (FK + composite unique) and run `pnpm migrate:up` against the
   dev database before merging.
4. **Token leakage via entity serialization.** Mitigation: two layers — column
   `hidden: true` and explicit response mapping through
   `EmailAccountResponseSchema`; a P0 test asserts no token fields in responses.
5. **Testing-status OAuth consent screen limits.** While the Google Cloud
   consent screen is in "Testing" status, refresh tokens for restricted scopes
   like `gmail.readonly` expire after 7 days, and production use of that scope
   requires Google's app verification. Not a blocker for this feature (nothing
   reads mail yet), but the verification path must be decided before sync is
   built.
