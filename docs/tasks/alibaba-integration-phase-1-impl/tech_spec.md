# [SPEC] Alibaba Integration — Phase 1.2 through 1.5

**Status:** Draft
**Author:** Tech Lead (Tony)
**Date:** 2026-04-13
**Target Component:** `factory-finder-fashiongo` (Supabase Edge Functions — Deno + TypeScript, React client)

---

## 1. Overview

Phase 1 of ADR-0001 establishes the OAuth infrastructure for Alibaba.com Open Platform integration. Phase 1.1 (DB migration) is done. This spec covers Phase 1.2–1.5: Edge Functions for OAuth lifecycle + client integration layer + connection-management UI.

**What ships:** user can connect an Alibaba.com shop via OAuth, tokens are encrypted in Supabase Vault, automatic refresh runs every 30 min, user can disconnect. Order/Inventory/Message API calls are **stubbed** here — concrete fetching is Phase 2–4.

**What is NOT in this phase:** order/message/inventory fetching Edge Functions, CSV fallback import, rate-limit orchestration beyond simple backoff, multi-platform support (1688/Taobao) — table already accommodates but only `alibaba_com` is wired.

---

## 2. Data Model (Schema & Types)

Tables already created by Phase 1.1 migration. This section defines the **TypeScript types** that mirror those tables and flow through Edge Functions + client.

> **Note to SWE:** Tables and RLS policies are live. Do NOT create them again.

### 2.1. Connection status enum

```ts
// src/integrations/alibaba/types.ts
export type AlibabaPlatform = 'alibaba_com' | '1688' | 'taobao';
export type AlibabaConnectionStatus = 'active' | 'refresh_required' | 'revoked' | 'error';

export interface AlibabaShopConnection {
  id: string;                      // uuid
  user_id: string;                 // uuid — always equal to auth.uid()
  platform: AlibabaPlatform;
  shop_id: string;
  shop_name: string | null;
  scopes: string[];
  status: AlibabaConnectionStatus;
  last_error: string | null;
  access_token_expires_at: string | null;   // ISO-8601
  refresh_token_expires_at: string | null;  // ISO-8601
  last_refreshed_at: string | null;         // ISO-8601
  vault_secret_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

### 2.2. OAuth token bundle (lives in Vault)

```ts
// supabase/functions/_shared/alibaba-vault.ts
export interface AlibabaTokenBundle {
  access_token: string;
  refresh_token: string;
  token_type: string;                  // typically "Bearer"
  expires_in_seconds: number;          // original value from Alibaba
  refresh_expires_in_seconds: number | null;
  issued_at: string;                   // ISO-8601 — when we received it
  scope: string;                       // space-separated scopes granted
  raw: Record<string, unknown>;        // full token response, for forward compat
}
```

Stored as a single JSON-stringified blob under Vault secret name `alibaba_token_<connection_id>`.

### 2.3. Edge Function request/response DTOs

All DTOs below live in `src/integrations/alibaba/types.ts` AND are imported by the Edge Functions (Deno reads them via relative `../../../src/integrations/alibaba/types.ts` path, OR — safer — by duplicating the types in a Deno-local `_shared/alibaba-dtos.ts`). **Choose the second option** to avoid cross-runtime import pain. Keep both files in sync via a lint rule or manual review.

```ts
// POST /alibaba-oauth-start
export interface OAuthStartRequest {
  platform?: AlibabaPlatform;          // default: 'alibaba_com'
  return_to?: string;                  // client path to redirect after successful connect (validated against allowlist)
}
export interface OAuthStartResponse {
  authorize_url: string;               // URL the client should open in a new tab / redirect to
  state: string;                       // echoed back so client may store it if desired (server is source of truth)
}

// GET /alibaba-oauth-callback?code=...&state=...
// Edge Function responds with a 302 redirect (HTML) to the client app.
// Success: <app_origin>/settings/alibaba?connected=1&connection_id=<uuid>
// Error:   <app_origin>/settings/alibaba?error=<code>&message=<url-encoded>

// POST /alibaba-refresh-token  (invoked by pg_cron via pg_net)
export interface RefreshTokenResponse {
  refreshed: number;
  skipped: number;
  failed: Array<{ connection_id: string; error: string }>;
}

// POST /alibaba-disconnect
export interface DisconnectRequest {
  connection_id: string;
}
export interface DisconnectResponse {
  ok: true;
}
```

---

## 3. Interface Design (API / Signatures)

### 3.1. `POST /functions/v1/alibaba-oauth-start`

Build and return the Alibaba OAuth authorize URL with a signed `state` token. Client redirects the user there.

* **Auth:** required (`Authorization: Bearer <user_jwt>`). 401 if missing.
* **Request body:** `OAuthStartRequest` (all fields optional)
* **Response 200:** `OAuthStartResponse`
* **Errors:**
  * `401` — missing/invalid JWT
  * `400` — `return_to` not in allowlist
  * `500` — missing required env vars (`ALIBABA_CLIENT_ID`, `ALIBABA_REDIRECT_URI`, etc.)

State payload structure — **two-part** (NOT a three-part JWS):
```
payload_b64 = base64url(JSON.stringify({ user_id, nonce, return_to, platform, iat }))
sig_b64     = base64url(HMAC-SHA256(payload_b64, SIGNING_KEY))
state       = payload_b64 + "." + sig_b64      // exactly one dot

iat         = Math.floor(Date.now() / 1000)    // epoch seconds
ttl         = 15 min (enforced on verification via iat check)
nonce       = crypto.randomUUID()              // 16-byte random UUID, prevents replay
```

Verifier splits on the last `.`, recomputes HMAC over the left half, constant-time compares against the right half, then decodes + validates the payload.

### 3.2. `GET /functions/v1/alibaba-oauth-callback`

Handles the redirect from Alibaba's consent page.

* **Auth:** none (public — Alibaba calls this with a browser redirect). Request is authenticated by the signed state.
* **Query params:** `code`, `state`, optional `error`, `error_description`
* **Response:** HTTP 302 redirect to `<app_origin>/settings/alibaba?...`
* **Flow:**
  1. Verify state signature + TTL + CSRF
  2. Exchange `code` for tokens (`POST ALIBABA_OAUTH_TOKEN_URL`)
  3. Call Alibaba "get shop info" endpoint to obtain `shop_id` + `shop_name` (best-effort; falls back to payload fields if available)
  4. Store `AlibabaTokenBundle` in Vault as `alibaba_token_<new_uuid>`
  5. Insert row in `alibaba_shop_connections` with `status='active'`
  6. 302 redirect with `connected=1&connection_id=<uuid>`
* **Error handling:** any failure redirects with `?error=<code>&message=<...>` — no stack traces in URL.

### 3.3. `POST /functions/v1/alibaba-refresh-token`

Invoked by pg_cron every 30 min (configured in a follow-up migration after deploy).

* **Auth:** service role only. Verified via `Authorization: Bearer <SERVICE_ROLE_KEY>` header set by pg_net call. 401 for any other caller.
* **Request body:** none (or `{ connection_id?: string }` to force refresh a single connection)
* **Response 200:** `RefreshTokenResponse`
* **Flow:**
  1. Call `alibaba_connections_needing_refresh()` SQL function → list of connections
  2. For each (max 20 per invocation, with 200ms stagger):
     a. Read token bundle from Vault
     b. `POST ALIBABA_OAUTH_TOKEN_URL` with `grant_type=refresh_token`
     c. On success: write new bundle to Vault, update `access_token_expires_at`, `last_refreshed_at`, `status='active'`
     d. On `invalid_grant` (refresh_token expired): set `status='refresh_required'`, `last_error=<msg>`
     e. On other errors: set `status='error'`, `last_error=<msg>`, increment retry counter in `metadata`
  3. Return counts

### 3.4. `POST /functions/v1/alibaba-disconnect`

* **Auth:** required user JWT
* **Request body:** `DisconnectRequest`
* **Response 200:** `DisconnectResponse`
* **Flow:**
  1. Best-effort: call Alibaba revoke endpoint if available (ignore failures)
  2. Call `alibaba_delete_connection(p_connection_id)` SQL function (owner-gated, deletes Vault secret + connection row + cascades caches)
* **Errors:**
  * `401` — missing JWT
  * `404` — connection not found
  * `403` — connection not owned by caller (enforced by SQL function)

### 3.5. Client hooks

```ts
// src/integrations/alibaba/hooks/use-alibaba-connections.ts
export function useAlibabaConnections(): UseQueryResult<AlibabaShopConnection[], Error>;

// src/integrations/alibaba/hooks/use-connect-alibaba.ts
export function useConnectAlibaba(): UseMutationResult<void, Error, ConnectArgs>;
// Behavior: calls POST alibaba-oauth-start, then window.location.href = authorize_url

// src/integrations/alibaba/hooks/use-disconnect-alibaba.ts
export function useDisconnectAlibaba(): UseMutationResult<void, Error, { connection_id: string }>;

// src/integrations/alibaba/hooks/use-alibaba-callback-result.ts
// Reads URL query params on /settings/alibaba page to surface success/error toasts.
export function useAlibabaCallbackResult(): void; // side-effect hook
```

---

## 4. Internal Component Design

### 4.1. Edge Function files (new)

```
supabase/functions/
├── _shared/
│   ├── cors.ts                 (done)
│   ├── alibaba-config.ts       — NEW: env var reader + validation
│   ├── alibaba-state.ts        — NEW: HMAC sign/verify
│   ├── alibaba-vault.ts        — NEW: Vault CRUD helpers
│   ├── alibaba-client.ts       — NEW: Alibaba REST wrapper (token exchange, shop info, revoke, refresh)
│   └── alibaba-supabase.ts     — NEW: Supabase auth helpers (user client + service client + service-role bearer verification)
├── alibaba-oauth-start/
│   └── index.ts                — NEW
├── alibaba-oauth-callback/
│   └── index.ts                — NEW
├── alibaba-refresh-token/
│   └── index.ts                — NEW
└── alibaba-disconnect/
    └── index.ts                — NEW
```

### 4.2. `_shared/alibaba-config.ts` (module)

Reads and validates env vars at cold start. Exposes a typed `AlibabaConfig` object. Throws at import time if required vars missing → function will 500 immediately (fail fast).

Required vars: `ALIBABA_CLIENT_ID`, `ALIBABA_CLIENT_SECRET`, `ALIBABA_REDIRECT_URI`, `ALIBABA_OAUTH_AUTHORIZE_URL`, `ALIBABA_OAUTH_TOKEN_URL`, `ALIBABA_API_BASE_URL`, `ALIBABA_STATE_SIGNING_SECRET`, `ALIBABA_APP_ORIGIN` (client app origin for redirect).

Optional: `ALIBABA_DEFAULT_SCOPES` (space-sep), `ALIBABA_ENV` (`sandbox|production`).

### 4.3. `_shared/alibaba-state.ts` (module)

* `signState(payload: StatePayload): string` — returns `base64url.header.base64url.signature`
* `verifyState(state: string): StatePayload` — throws on signature mismatch / expired / malformed
* Uses Web Crypto `crypto.subtle.importKey` + `crypto.subtle.sign/verify` (HMAC-SHA256)

### 4.4. `_shared/alibaba-vault.ts` (module)

* `putTokenBundle(secretName: string, bundle: AlibabaTokenBundle, description?: string): Promise<void>` — uses `vault.create_secret()` via service-role Supabase client
* `getTokenBundle(secretName: string): Promise<AlibabaTokenBundle>` — reads from `vault.decrypted_secrets`
* `deleteTokenBundle(secretName: string): Promise<void>` — deletes row from `vault.secrets`
* All methods internally use a service-role client (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

### 4.5. `_shared/alibaba-client.ts` (module)

* `exchangeCodeForTokens(code: string): Promise<AlibabaTokenBundle>`
* `refreshAccessToken(refreshToken: string): Promise<AlibabaTokenBundle>`
* `revokeToken(accessToken: string): Promise<void>` (best-effort; catches all errors)
* `fetchShopInfo(accessToken: string): Promise<{ shop_id: string; shop_name: string | null }>` — **[endpoint unverified — confirm against Alibaba docs during Sandbox testing]**
  * **Fallback on any failure** (network error, non-2xx, missing shop_id in response): return `{ shop_id: 'unknown_' + crypto.randomUUID(), shop_name: null }`. This allows the OAuth flow to complete even if shop info is temporarily unavailable; the user can later rename the shop via a future settings action. Log the fallback at `console.warn` level (no PII).

All methods: timeout 10 s, retry once on 5xx with 500 ms backoff. On final failure `revokeToken` and `fetchShopInfo` swallow errors and return a safe default; `exchangeCodeForTokens` and `refreshAccessToken` propagate errors.

### 4.5a. `_shared/alibaba-supabase.ts` (module)

Central auth helpers — used by every Edge Function. Removes duplicated JWT / service-role verification code and guarantees a single, audited implementation.

* `getUserClient(req: Request) → SupabaseClient` — creates a user-scoped Supabase client by passing the incoming `Authorization` header to `createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })`. All DB operations through this client are RLS-enforced.
* `requireUser(req: Request) → Promise<{ user: User; client: SupabaseClient }>` — calls `supabase.auth.getUser()`, throws `UnauthorizedError` (maps to 401 response) if no user.
* `getServiceClient() → SupabaseClient` — service-role client for Vault access and cross-user writes. Uses `SUPABASE_SERVICE_ROLE_KEY`.
  * **Safe to use from user-facing endpoints ONLY after explicit authentication.** Valid safeguards, in order of preference: (a) `requireUser()` return value's `user.id` (JWT-verified), (b) HMAC-signed state payload's `user_id` after `verifyState()` success (used by `alibaba-oauth-callback`). Never write to rows without scoping by the authenticated `user_id`.
  * **Do NOT use** from endpoints that accept neither a JWT nor a signed state.
* `requireServiceRoleBearer(req: Request): void` — constant-time compares `Authorization: Bearer <token>` against `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')`. Throws `UnauthorizedError` on mismatch. Used by `alibaba-refresh-token` only.

### 4.6. `alibaba-oauth-start/index.ts` (function)

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, handleCorsPreflight, jsonResponse, errorResponse } from "../_shared/cors.ts";
import { config } from "../_shared/alibaba-config.ts";
import { signState } from "../_shared/alibaba-state.ts";
// ... handler logic per 3.1
```

### 4.7. Client module files (new)

```
src/integrations/alibaba/
├── types.ts                             — NEW: shared TS types
├── client.ts                            — NEW: Edge Function invoke wrapper
└── hooks/
    ├── use-alibaba-connections.ts       — NEW
    ├── use-connect-alibaba.ts           — NEW
    ├── use-disconnect-alibaba.ts        — NEW
    └── use-alibaba-callback-result.ts   — NEW
```

### 4.8. Page + navigation (new / modified)

* **NEW** `src/pages/AlibabaSettings.tsx` — list connections, "Connect shop" button, disconnect action, status banner
* **MODIFIED** `src/App.tsx` — add route `/settings/alibaba` → `AlibabaSettings`, protected
* **MODIFIED** `src/components/AppLayout.tsx` — add nav entry under "Settings" group (icon: `Store` from lucide)

---

## 5. Business Logic & Algorithms

### 5.1. OAuth start flow

1. Verify JWT via `createClient(...).auth.getUser()` — extract `user_id`
2. Validate `return_to` (if provided) against allowlist: must start with `config.APP_ORIGIN + '/'`
3. Build `StatePayload = { user_id, nonce: crypto.randomUUID(), return_to, platform, iat: now() }`
4. `state = signState(StatePayload)`
5. Build authorize URL:
   ```
   ${config.OAUTH_AUTHORIZE_URL}
     ?response_type=code
     &client_id=${config.CLIENT_ID}
     &redirect_uri=${config.REDIRECT_URI}
     &scope=${config.DEFAULT_SCOPES}
     &state=${state}
   ```
6. Return `{ authorize_url, state }`

### 5.2. OAuth callback flow

1. Parse query params. If `error` present → redirect to app with `?error=${error}&message=${error_description}`.
2. `verifyState(state)` — on failure redirect with `?error=invalid_state`
3. Check `iat + 15min > now()` (TTL) — on failure redirect with `?error=expired_state`
4. `exchangeCodeForTokens(code)` → `tokens`
5. `fetchShopInfo(tokens.access_token)` → `{ shop_id, shop_name }`
   * If this fails, still proceed — store a placeholder `shop_id = 'unknown_' + uuid` and let user rename later
6. Generate `connection_id = crypto.randomUUID()`, `vault_secret_name = 'alibaba_token_' + connection_id`
7. `putTokenBundle(vault_secret_name, tokens)` → Vault
8. INSERT row into `alibaba_shop_connections` using service-role client (RLS bypassed; we set `user_id = statePayload.user_id`):
   ```ts
   await supabase.from('alibaba_shop_connections').insert({
     id: connection_id,
     user_id: statePayload.user_id,
     platform: statePayload.platform ?? 'alibaba_com',
     shop_id, shop_name,
     scopes: tokens.scope.split(' '),
     status: 'active',
     access_token_expires_at: addSeconds(now, tokens.expires_in_seconds),
     refresh_token_expires_at: tokens.refresh_expires_in_seconds ? addSeconds(now, tokens.refresh_expires_in_seconds) : null,
     last_refreshed_at: new Date().toISOString(),
     vault_secret_name,
     metadata: { issued_at: tokens.issued_at, environment: config.ENV },
   });
   ```
9. Redirect `302` to `${config.APP_ORIGIN}${statePayload.return_to ?? '/settings/alibaba'}?connected=1&connection_id=${connection_id}`

**Idempotency + cleanup** (explicit implementation contract):

```ts
// Step 9 expanded
try {
  await serviceClient.from('alibaba_shop_connections').insert(row);
} catch (err) {
  if (isUniqueViolation(err, 'alibaba_shop_connections_user_id_platform_shop_id_key')) {
    // Re-connect: fetch existing row, update tokens in its Vault slot, delete the orphan secret we just created
    const existing = await serviceClient
      .from('alibaba_shop_connections')
      .select('id, vault_secret_name')
      .eq('user_id', statePayload.user_id)
      .eq('platform', platform)
      .eq('shop_id', shop_id)
      .single();

    await putTokenBundle(existing.vault_secret_name, tokens);        // overwrite existing bundle
    await deleteTokenBundle(vault_secret_name);                      // delete the orphan from step 7
    await serviceClient.from('alibaba_shop_connections').update({
      status: 'active',
      access_token_expires_at, refresh_token_expires_at,
      last_refreshed_at: new Date().toISOString(),
      last_error: null,
      scopes: tokens.scope.split(' '),
    }).eq('id', existing.id);

    connection_id = existing.id;     // redirect uses the existing id
  } else {
    // Generic DB failure AFTER a Vault put — delete orphan secret to avoid leaks
    await deleteTokenBundle(vault_secret_name).catch((cleanupErr) => {
      console.error('[alibaba-oauth-callback] vault cleanup failed', { vault_secret_name, cleanupErr });
    });
    throw err;                        // propagate to redirect with ?error=db_insert_failed
  }
}
```

**Contract**: after any outcome of step 9, there is at most one Vault secret per `(user_id, platform, shop_id)`. Orphans are always deleted.

### 5.3. Refresh flow (cron)

1. Authenticate: `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
2. Optional body `{ connection_id }` → refresh single; else `SELECT * FROM alibaba_connections_needing_refresh()`
3. For each connection (max 20 per invocation):
   a. `bundle = await getTokenBundle(vault_secret_name)`
   b. `newBundle = await refreshAccessToken(bundle.refresh_token)`
   c. `await putTokenBundle(vault_secret_name, newBundle)`
   d. UPDATE connection row: `access_token_expires_at`, `last_refreshed_at`, `status='active'`, `last_error=null`
   e. Catch `invalid_grant` → `status='refresh_required'`, keep old Vault bundle (needed for Alibaba re-consent UX)
   f. Catch other → `status='error'`, `last_error=String(error)`, leave bundle as-is; surface in UI

Stagger: `await sleep(200)` between items to spread load.

### 5.4. Disconnect flow

1. Verify JWT → `user_id`
2. `SELECT vault_secret_name FROM alibaba_shop_connections WHERE id=connection_id AND user_id=auth.uid()` — 404 if empty
3. Best-effort `revokeToken(bundle.access_token)` — catch & log only
4. `SELECT alibaba_delete_connection(connection_id)` — enforces ownership + cascades

### 5.5. Client-side connect flow

```tsx
// on "Connect Alibaba shop" button click
const { mutateAsync: startConnect } = useConnectAlibaba();
await startConnect({ return_to: '/settings/alibaba' });
// useConnectAlibaba internally:
// 1. POST /functions/v1/alibaba-oauth-start
// 2. window.location.href = response.authorize_url
```

### 5.6. Client-side callback result handling

On `/settings/alibaba` page mount, `useAlibabaCallbackResult()`:
1. Reads `URLSearchParams`
2. If `?connected=1` → toast success "Shop connected", invalidate `['alibaba-connections']` query
3. If `?error=<code>` → toast error with human-friendly message
4. Clean URL: `history.replaceState({}, '', '/settings/alibaba')` so refresh doesn't re-trigger

---

## 6. Security & Constraints

### Authentication / Authorization

All patterns below are implemented **once** in `_shared/alibaba-supabase.ts` (§4.5a). Edge Functions MUST use those helpers — do NOT inline the JWT or service-role logic in individual functions.

* `alibaba-oauth-start`, `alibaba-disconnect` — user JWT required. Call `requireUser(req)` → returns `{ user, client }`. The returned client is RLS-enforced.
* `alibaba-oauth-callback` — public endpoint. Authenticity enforced via HMAC-signed state (CSRF + user binding). Uses `getServiceClient()` after state verification because the callback operates "on behalf of" the user encoded in the state, not as the user directly.
* `alibaba-refresh-token` — service role only. Call `requireServiceRoleBearer(req)` at the top of the handler. Uses `getServiceClient()` for Vault + DB access (must read across all users whose tokens are expiring).

### Secrets

There are **two separate secret stores** — do not confuse them:

**(1) Supabase Secrets (env vars for Edge Functions)** — read via `Deno.env.get(...)` inside `_shared/alibaba-config.ts`. Available at Edge Function runtime. Set via Supabase Dashboard → Edge Functions → Secrets (or `supabase secrets set`):
* `ALIBABA_CLIENT_ID`, `ALIBABA_CLIENT_SECRET`, `ALIBABA_REDIRECT_URI`
* `ALIBABA_OAUTH_AUTHORIZE_URL`, `ALIBABA_OAUTH_TOKEN_URL`, `ALIBABA_API_BASE_URL`
* `ALIBABA_STATE_SIGNING_SECRET` (min 32 bytes; generated via `openssl rand -base64 48`)
* `ALIBABA_APP_ORIGIN` (e.g., `https://app.example.com` or `http://localhost:8080`)
* `ALIBABA_DEFAULT_SCOPES` (space-separated; configured per environment)
* `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase-provided standard, auto-available to every Edge Function)

**(2) Supabase Vault secrets (for SQL-level access)** — stored in `vault.secrets`, readable from SQL via `vault.decrypted_secrets`. Needed because **SQL cannot read env vars**, but `pg_cron + pg_net` must call the Edge Function URL with a bearer token from inside a SQL job. Seed these BEFORE applying the T022 migration. Only two are required:
* `alibaba_function_url` — full URL to the refresh function, e.g. `https://<ref>.supabase.co/functions/v1/alibaba-refresh-token`
* `alibaba_service_role_bearer` — the literal string `Bearer <SUPABASE_SERVICE_ROLE_KEY>` (prefix included)

Seeding SQL (run once before T022, as service role):
```sql
SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/alibaba-refresh-token', 'alibaba_function_url');
SELECT vault.create_secret('Bearer <SUPABASE_SERVICE_ROLE_KEY>',                              'alibaba_service_role_bearer');
```

Tokens themselves (per-connection `access_token` + `refresh_token` bundles) also live in Vault under names like `alibaba_token_<connection_id>` — those are written/read by Edge Functions at runtime, not seeded manually.

### Deployment ceremony

This ordering is mandatory — reversing it silently breaks pg_cron.

1. **Deploy Phase 1.1 migration** (`20260413160000_create_alibaba_integration.sql`) — creates tables, RLS, RPCs, enables `supabase_vault` + `pg_net`.
2. **Deploy Edge Functions T001–T011** — shared modules + oauth-start + oauth-callback. T020–T021 may deploy together.
3. **Set Supabase Secrets** (store 1 — env vars) — all eight `ALIBABA_*` vars listed above.
4. **Seed Vault secrets** (store 2 — SQL-accessible) — run the two `vault.create_secret(...)` statements. Required for T022 to work.
5. **Deploy Phase 1.3 migration T022** (`<NEW_TIMESTAMP>_alibaba_pg_cron.sql`) — registers the pg_cron jobs. Migration body reads URL + bearer from `vault.decrypted_secrets` (NOT env vars).
6. **Smoke test** — manually invoke `alibaba-oauth-start` with a real JWT. If 200 OK + authorize URL → env vars work. Then force-run the cron job once via `SELECT cron.schedule(...)` manual invocation to confirm Vault secrets work.

### Performance
* Edge Functions 10s timeout. OAuth start/callback must complete < 3s.
* Refresh: 20 connections × ~1s each = 20s per invocation; pg_cron schedule 30 min.

### Transactions
* Vault write + DB insert are **NOT** atomic (different stores). Compensation: on DB insert failure after Vault put, delete the orphan Vault secret; log error. For the inverse (DB row exists but Vault missing), the next fetch operation will surface an error and set `status='error'`.

### Logging
* `console.log` / `console.error` only. No structured logging library yet.
* Never log: `access_token`, `refresh_token`, `client_secret`, `state` payload.
* OK to log: `connection_id`, `user_id`, `platform`, `shop_id`, `status` transitions, error codes.

### Rate limiting
Not implemented in this phase. Refresh loop has a 200ms stagger. Per-user request rate at oauth-start is unlikely to hit any limit (manual user action). Fetch endpoints (Phase 2–4) will add proper rate limiting.

### Input validation
* `return_to` — must start with `config.APP_ORIGIN + '/'`. Reject otherwise.
* `state` — signature verify + 15-min TTL + must contain `user_id`, `nonce`, `iat`.
* `connection_id` — UUID format check (regex).

---

## 7. Tests (overview — full test tasks deferred per --no-test-like decision in this spec)

Minimum smoke checks after deploy, performed manually:
1. Call `alibaba-oauth-start` with a valid JWT → receive an authorize URL containing signed state.
2. Open the URL in Sandbox, complete consent, verify callback lands on `/settings/alibaba?connected=1`.
3. Confirm new row in `alibaba_shop_connections` + Vault secret exists.
4. Force-invoke `alibaba-refresh-token` manually → verify `last_refreshed_at` updates and `access_token_expires_at` moves forward.
5. Disconnect → row deleted + Vault secret gone + caches cascade-deleted.

Automated tests are **out of scope for this phase** (matches existing project convention — `src/test/` contains only an example test). Plan: add vitest hook tests in Phase 1.6 when there is enough surface area to justify the setup.
