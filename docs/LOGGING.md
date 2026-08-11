# LOGGING.md

Logging rules for this repository.

## 1) Logger Strategy

| App      | Library                       | Package                    |
| -------- | ----------------------------- | -------------------------- |
| apps/api | nestjs-pino (wraps pino-http) | `nestjs-pino`, `pino-http` |
| apps/web | pino/browser                  | `pino`                     |

Development: pretty-print via `pino-pretty`.
Production: JSON to stdout (Vercel captures, optional Axiom drain).

## 2) What to Log

- request boundaries (auto: nestjs-pino logs method, url, status, duration)
- auth failures (token missing, expired, invalid)
- database errors (connection, query, migration)
- AI provider failures (rate limit, timeout, model error)
- env validation failures at boot
- graceful fallbacks

## 3) What Not to Log

Never:

- secrets, tokens, API keys
- full message content or chat history
- full request/response payloads
- stack traces more than once per error path

Log IDs, counts, slugs — not full content.

## 4) Log Levels

| Level | Use                                   |
| ----- | ------------------------------------- |
| debug | local troubleshooting                 |
| info  | successful major operation            |
| warn  | degraded but recoverable              |
| error | failed operation or broken assumption |

## 5) Required Context Fields

Where applicable: `requestId`, `userId`, `method`, `route`, `statusCode`,
`duration`, `errorName`, `entityId`.

## 6) Redaction

Redact `request.headers.authorization` in nestjs-pino config.

## 7) Observability (optional)

Axiom free tier: 500GB/mo, 30-day retention. Setup:

1. Create Axiom account → dataset
2. Vercel dashboard → Log Drains → add Axiom (requires Pro plan)
3. Or: use `pino-axiom` transport in nestjs-pino config with AXIOM_TOKEN env var

## 8) Anti-Patterns

- no `console.log` in app logic (use logger)
- no logging inside hot loops
- no duplicate failure messages at multiple layers
- no swallowing errors without logging

## 9) Production troubleshooting

Vercel exposes two different log surfaces — use the right one:

| Goal                        | Command                                      |
| --------------------------- | -------------------------------------------- |
| Runtime (requests, crashes) | `npx vercel logs yagyu.app`                  |
| Build / deploy compile logs | `npx vercel inspect <deployment-url> --logs` |

`vercel inspect --logs` is **build-only**. Cold-start and request failures
show up only in runtime logs.

Plain-text body `A server error has occurred` with header
`x-vercel-error: FUNCTION_INVOCATION_FAILED` means the Node process crashed
before Nest's JSON exception filter could run (module load or bootstrap).
The SPA client used to surface this as `Unexpected token 'A'... is not valid
JSON` — `apiRequest` now reports status + body preview + the Vercel error
header instead.

A common cold-start crash on this API is ESM/CJS interop (`ERR_REQUIRE_ESM`)
when Nest's CommonJS emit statically `require()`s ESM-only `ai` /
`@ai-sdk/*`. See Key Invariants in `ARCHITECTURE.md` (`importEsm`).

When pasting logs into chat or tickets: never include secret values, tokens,
connection strings, or full env dumps — redact first.
