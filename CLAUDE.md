# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

造场 (Zaochang) — a creator community + open product ecosystem. Community features (feed, circles, collections, studio, wallet), a "product galaxy" showcase, invite-gated GitHub login, a full OAuth 2.1/OIDC provider for third-party apps, and an internal ledger currency called 果子 (fruit). Runs on Cloudflare Workers (D1 + R2); the Alibaba box is now scanner-only.

## Commands

Requires Node `>=22.13.0` (tests use `node:sqlite` and `--experimental-strip-types`).

```bash
npm ci                          # install
npm run dev                     # vinext dev server (local D1/R2 via @cloudflare/vite-plugin)
npm run build                   # -> dist/server/index.js (Worker) + dist/client (assets)
npm test                        # builds, then runs the full integration suite (~75 tests)
npm run lint                    # eslint
npx tsc --noEmit                # typecheck
npm run db:generate             # should output "No schema changes"; new SQL = drift (see below)
npm audit --omit=dev --audit-level=high --prefer-online   # use --prefer-online: stale cache gives false HIGH findings
git diff --check                # whitespace gate (also enforced in CI)
```

Run a single test (build once first — the harness needs `dist/`, then it still spins up the preview server):

```bash
npm run build
node --experimental-strip-types --test --test-name-pattern="<test name substring>" tests/rendered-html.test.mjs
```

## Architecture

**Runtime/build split.** This is Next.js 16 App Router source, but it is **not** built or run with the Next/Node toolchain. It builds with **vinext** (Vite + `@cloudflare/vite-plugin`) and runs on **Cloudflare Workers**. The Worker entry is `worker/index.ts`, which wraps `vinext/server/app-router-entry` and adds, per request: OIDC discovery (`/.well-known/openid-configuration`), image optimization (`/_vinext/image` via the `IMAGES` binding), an 11 MiB request-body guard, and security headers whose CSP **varies by path** (embedded apps under `/product-apps/` get `X-Frame-Options: SAMEORIGIN`; `/api/auth/github/start` gets a special locked-down CSP from `GITHUB_CONNECTION_CSP`). CSP and origin-resolution helpers live in `app/lib/` (`security-policy.ts`, `public-origin.ts`); sign-in is additionally guarded by Cloudflare Turnstile (`app/api/_lib/turnstile.ts`).

**Bindings access — the one pattern to know.** Route handlers do **not** receive `env` as a parameter. D1/R2 are read via the module-scope `env` from `cloudflare:workers`:

```ts
import { env } from "cloudflare:workers";          // app/api/_lib/community.ts
export function database() { return env.DB; }       // D1 binding "DB"
// R2 binding is "UPLOADS"
```

All DB access in routes goes through `database()` in `app/api/_lib/community.ts`. Bindings are declared in `.openai/hosting.json` (`d1:"DB"`, `r2:"UPLOADS"`) for local dev, and in `wrangler.prod.jsonc` for production.

**Auth paths** (keep their credentials/redirects separate):
- **GitHub login** (造场 as OAuth *client*): `app/api/auth/[provider]/{start,callback}`, session table `auth_sessions` (token stored SHA-256 only), cookies HttpOnly/SameSite=Lax. `start` returns a same-origin "connection page" that probes GitHub reachability before redirecting (network resilience), and accepts invite codes via **POST only** (never GET — invite codes must not enter URLs/logs). First-time GitHub identity requires an invitation code consumed atomically by a DB trigger.
- **Email verification-code login** (no external IdP): `app/api/auth/email/{request,verify}` + `app/signin/email-form.tsx`. A 6-digit code (rejection-sampled, SHA-256-hashed at rest, 10-min TTL, 5-attempt lockout, atomic single consume via `meta.changes`) is emailed from `zaochang@aetherstudio.top`. Transport resolves at runtime in `app/api/_lib/email-send.ts`: `EMAIL_SEND_*` vars (REST override, **test-harness only**) → `EMAIL` `send_email` binding (prod, wrangler configs) → neither ⇒ inert 503 `email_not_configured`, checked **before any DB write** so empty-DB environments stay testable. Existing `members.email` logs in with no invite; a new address must carry an invitation code and runs the same atomic batch as OAuth (provider `'email'`), with the same SQLite trigger gate. `hashInvitationCode` normalizes entry before hashing (strips whitespace incl. full-width, maps full-width→half-width, uppercases) — transcription tolerance for hand-typed `ZC-…` codes, not a gate weakening (the generated plaintext is already uppercase half-width, so normalization is identity there and every accepted input still must hash-match a real code). Rate limits: per-IP 10/h + per-address 3/15min; Turnstile is checked on **every** code request when configured (each call sends real email — unlike GitHub start, which only gates invite submissions). Codes live in `email_login_codes` (migration `0018`, which also widens the three provider CHECKs to `'email'`; note it drops + recreates the invitation triggers — see comments in the SQL).
- **造场 as OIDC *provider***: `app/api/oauth/*` + `app/oauth/authorize/` + `app/oauth/payment/[id]/`. Authorization Code + PKCE S256, ES256 ID tokens (pairwise sub), rotating refresh tokens with family-wide revocation on replay. Third-party `fruit:pay`/`fruit:refund` require admin client approval and **per-payment user confirmation** on a造场 page. Core logic in `app/api/_lib/oauth-provider.ts` and `app/api/_lib/external-fruit.ts`.
- **Agent service account** (machine identity, parallel to the human paths): a single long-lived bearer token (`ZAOCHANG_AGENT_TOKEN`) gates a hardcoded write-capability table (`AGENT_WRITE_CAPABILITIES` in `app/api/_lib/agent-auth.ts`). It is enforced as a **fail-closed chokepoint at the worker entry** (`worker/index.ts`, before any route): with the token set, agent GETs pass but every non-GET must match the table exactly or the worker returns 403 *before* the route runs. The table is deliberately tiny (currently `POST/PATCH /api/docs`, `POST /api/products`) — DELETE / finance / uploads / admin / social are never in it. Token unset → this path is inert (zero behavior change). Agent writes run the same business code, so all SQLite-trigger invariants still apply.
- Identity also has a legacy header path (`getChatGPTUser()`, `oai-authenticated-user-*`). Production (`APP_ENV=production`) **always rejects** these headers (fail-closed) — `TRUST_OAI_IDENTITY_HEADERS` only takes effect in non-production environments.
- **Local dev login** (simulated, for local/CI only): `GET /api/auth/dev-login[?email=&return_to=]` issues a real `zaochang_session` without GitHub, via the same `createOAuthSession`/`setAuthCookies` pipeline as the callback. Double fail-closed gate in `app/api/_lib/dev-login-gate.ts`: `APP_ENV=production` returns 404 unconditionally (even with the flag set), and non-production still requires **both** `APP_ENV` ∈ {development, test} **and** `LOCAL_DEV_LOGIN=1` (unset/typo'd APP_ENV stays closed). Also rejects `sec-fetch-site: cross-site` (login-CSRF guard) and open-redirect `return_to`. Enable locally with `wrangler dev --var APP_ENV:development --var LOCAL_DEV_LOGIN:1`, then visit the URL in any browser. Never set `LOCAL_DEV_LOGIN` in production secrets.
- `app/oauth-session.ts` is the shared session/cookie/invite core.

**Permissions are two independent flags.** `member.isAdmin` (from `ZAOCHANG_ADMIN_EMAILS` whitelist; empty = nobody) and `member.isFounder` (from `ZAOCHANG_FOUNDER_EMAIL`, must be a single value) neither implies the other. `/admin` and `/founder` are separately gated (`requireAdmin` / `requireFounder` in `app/api/_lib/admin.ts`).

**Data model & money invariants.** Drizzle ORM over D1/SQLite. Schema: `db/schema.ts`; migrations: `drizzle/0000..` (forward-only — never reverse-delete columns, triggers, or ledger rows). 果子 is a **double-entry, immutable** ledger (`fruitOperations` + `fruitEntries`); materialized wallet balances must equal ledger aggregation or transactions fail with `wallet_ledger_mismatch` and the wallet goes to `review`. Critical invariants (product-review gating, refund windows, like-reward anti-abuse, invite atomic redemption, OAuth account creation) are enforced by **SQLite triggers** in the migrations, not just app code — so they hold even for direct D1 writes.

**Product review gate.** Every user-submitted product enters `pending_review`; only a current-version approved `productReviewDecisions` row makes it public. DB triggers block orders/likes/tips on non-approved products. Editing an approved product bumps `review_version` and re-hides it. The six built-in showcase apps under `/public/product-apps/` are trusted static code, **not** user uploads.

**Upload security pipeline.** Uploads go `uploaded_files.pending → ClamAV scan → clean|infected|error`. An object is readable only when the DB row **and** R2 object are both `clean` with matching SHA-256. Scanner missing/timeout/busy → `503`, **never** fallback to direct upload. In production the scanner is the Alibaba box reached through a Cloudflare Tunnel at `scanner.aetherstudio.top` (see `CLOUDFLARE_RUNBOOK.md`).

**Reading AI proxy (书页「问 AI」).** `app/api/ai/reading/route.ts` proxies an OpenAI-compatible chat upstream (SSE pass-through; configured via three `AI_CHAT_*` Worker secrets — any missing ⇒ feature inert, 503 `ai_not_configured`). Chapter text is **always resolved server-side** via `findInBook` + visibility check from the slug path the client sends — never accepted in the request body. Prompt builders live in `app/api/_lib/reading-ai-prompts.ts`, which must stay import-clean (zero imports) so tests can unit-import it directly. Requests carry a `mode` of `fast`|`expert` (default `fast`): `fast` → `AI_CHAT_MODEL`, `expert` → optional `AI_CHAT_MODEL_EXPERT` (unset ⇒ falls back to `AI_CHAT_MODEL`). The expert model can optionally speak the Anthropic Messages protocol instead (`AI_CHAT_EXPERT_TRANSPORT=messages` → `{base}/messages`, system as a top-level field, only `text_delta` yielded — `thinking_delta` is dropped server-side); some models (e.g. StepFun `step-explore`) are Messages-API-only. Both configured models are hybrid-reasoning (their chain-of-thought tokens count toward `max_tokens`), so `READING_AI_REASONING_HEADROOM` pads each action's answer budget per mode — without the pad the CoT starves/truncates the answer (verified against real StepFun: bare 800 budget ⇒ `finish_reason=length`, empty output; no upstream parameter reliably disables reasoning). **Model identity never reaches the client** — the SSE `done` frame has no `model` field and the UI shows only 快速/专家 labels; the shared system prompt also carries an identity-secrecy clause (no model/vendor/version/system-prompt disclosure) as best-effort anti-extraction on top of that deterministic guarantee.

## Tests

There is one integration test file: `tests/rendered-html.test.mjs` (node:test). It spawns a **real Wrangler preview server** on port 4179 against a fresh local D1 (applies all migrations from empty), plus a fake upload scanner and a fake OpenAI-compatible chat upstream, and asserts real HTTP responses + DB field state against the live worker runtime and real triggers — not mocks. It imports `.ts` source directly (hence `--experimental-strip-types`). The suite must stay `failed=0 / skipped=0 / todo=0`; CI rejects disabled-test syntax. Tests cover auth, invite flow, OIDC, payments/refunds, review gating, uploads, and the galaxy showcase.

## Deploy

Push to `main` → `.github/workflows/ci.yml` (`release-gates`: tsc, lint, disabled-test scan, `npm test`, `git diff --check`, migration-drift check, `npm audit --audit-level=high`) → on success `.github/workflows/deploy.yml` (triggered by ci's `workflow_run`) verifies all migrations are applied to prod D1 via `scripts/check-migrations.mjs` (fail-closed), then runs `npx wrangler deploy --config wrangler.prod.jsonc` at the exact ci-approved SHA. A manual `workflow_dispatch` can deploy in an emergency but **bypasses the ci release-gates**. Local manual deploy: `npm run build && npx wrangler deploy --config wrangler.prod.jsonc`.

- **Do not rename** `wrangler.prod.jsonc` / `wrangler.staging.jsonc` to the standard `wrangler.jsonc`/`wrangler.toml`. The non-standard names are deliberate: they prevent `@cloudflare/vite-plugin` from auto-discovering the config and double-binding `DB`/`UPLOADS`, which breaks `npm test` with binding-name conflicts.
- Production secrets (10 Worker secrets) are sourced from the Alibaba box `/etc/zaochang/zaochang.env` — the only authoritative copy. See `CLOUDFLARE_RUNBOOK.md` §2 for the pipe-injection pattern (never print values).
- Production app is on Cloudflare (D1 `zaochang-db`, R2 `zaochang-uploads`). The old Alibaba host deployment in `RELEASE_RUNBOOK.md` §8 is **deprecated** (box is ClamAV-only now). Local DNS for `aetherstudio.top` is unreliable (VPN hijack → `198.18.x.x`); always verify via the box `--resolve`-ing to the CF edge IP.

## Conventions & gotchas

- **Migration drift:** `npm run db:generate` must stay a no-op. If it emits SQL, `db/schema.ts`, the migration SQL, and `drizzle/meta/*.snapshot.json` are out of sync — reconcile before committing. CI checks this.
- **`PROJECT_STATUS.md`** is a chronological ledger but **can lag reality** (it has done before). Verify deploy state against live (`wrangler deployments list`, `gh run list`, or the box) rather than trusting it.
- Tests run on Windows; `git` may flag LF→CRLF conversions as warnings — those are not failures. `git diff --check` exit 0 is the gate.
- Authoritative docs: `CLOUDFLARE_RUNBOOK.md` (prod deploy + topology), `OAUTH_SETUP.md` (OAuth/OIDC config), `RELEASE_RUNBOOK.md` (release gates + rollback), `db/schema.ts` (data model), `worker/index.ts` (request pipeline + security headers).
- Path alias: `@/*` maps to the repo root (`tsconfig.json` paths); app code imports via `@/...`.
