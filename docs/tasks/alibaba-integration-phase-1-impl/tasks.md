# Tasks: Alibaba Integration — Phase 1.2 through 1.5

**Input**: `docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md`, `docs/adr/0001-alibaba-integration.md`
**Prerequisites**: Phase 1.1 migration deployed (`20260413160000_create_alibaba_integration.sql`), `_shared/cors.ts` present
**Task Strategy**: Single-repo, multi-layer (Edge Functions + client React)
**Affected Paths**: `supabase/functions/`, `src/integrations/alibaba/`, `src/pages/`, `src/components/AppLayout.tsx`, `src/App.tsx`

Markers:
- `[P]` — parallelizable with sibling tasks in the same Phase (no shared files)
- `[CRIT]` — blocks the rest of the Phase if it fails

---

## Phase 1: Shared Edge Function Modules — BLOCKING

**Purpose**: Build the four shared modules all OAuth Edge Functions depend on. Nothing else compiles without these.

- [ ] **T001** [P] [CRIT] Create `supabase/functions/_shared/alibaba-config.ts` — reads and validates env vars at import time. Exports `config` object of type `AlibabaConfig` with fields: `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `OAUTH_AUTHORIZE_URL`, `OAUTH_TOKEN_URL`, `API_BASE_URL`, `STATE_SIGNING_SECRET`, `APP_ORIGIN`, `DEFAULT_SCOPES`, `ENV`. Throws at module load if any required var missing. Ref: tech_spec §4.2.

- [ ] **T002** [P] [CRIT] Create `supabase/functions/_shared/alibaba-state.ts` — HMAC-SHA256 signed state utility. **Two-part format (NOT a three-part JWS)**: `state = base64url(JSON(payload)) + "." + base64url(HMAC-SHA256(payload_b64, SIGNING_KEY))` — exactly one dot. Exports `signState(payload: StatePayload): string` and `verifyState(state: string): StatePayload` (throws on invalid signature, expired TTL 15 min, malformed, or missing required fields). Uses Web Crypto API (`crypto.subtle.importKey` + `crypto.subtle.sign` + `crypto.subtle.verify`). Signature comparison uses `timingSafeEqual` via crypto.subtle's `verify()`. TTL 15 min hardcoded as `const STATE_TTL_SECONDS = 15 * 60;` near top of file. Ref: tech_spec §3.1 + §4.3.

- [ ] **T003** [P] [CRIT] Create `supabase/functions/_shared/alibaba-vault.ts` — token bundle CRUD against `vault.secrets`. Exports `putTokenBundle(name, bundle)`, `getTokenBundle(name)`, `deleteTokenBundle(name)`. Internally uses a service-role Supabase client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`). Ref: tech_spec §4.4.

- [ ] **T004** [P] [CRIT] Create `supabase/functions/_shared/alibaba-client.ts` — Alibaba REST helper. Exports `exchangeCodeForTokens(code)`, `refreshAccessToken(refreshToken)`, `revokeToken(accessToken)`, `fetchShopInfo(accessToken)`. 10 s timeout, single retry on 5xx with 500 ms backoff. Ref: tech_spec §4.5. **`fetchShopInfo` fallback: on ANY failure return `{ shop_id: 'unknown_' + crypto.randomUUID(), shop_name: null }` and log at `console.warn` (no PII, no token).** Add comment `// TODO: confirm exact endpoint against Alibaba docs during Sandbox testing` above the fetch call. `revokeToken` swallows errors; `exchangeCodeForTokens` + `refreshAccessToken` propagate errors.

- [ ] **T005** [P] [CRIT] Create `supabase/functions/_shared/alibaba-supabase.ts` — central Supabase auth helper. Exports:
  - `getUserClient(req: Request): SupabaseClient` — user-scoped client with `Authorization` header passed through, RLS enforced
  - `requireUser(req: Request): Promise<{ user: User; client: SupabaseClient }>` — throws `UnauthorizedError` (401) if no user
  - `getServiceClient(): SupabaseClient` — service-role client for Vault + cross-user writes
  - `requireServiceRoleBearer(req: Request): void` — constant-time compares `Authorization: Bearer <token>` against `SUPABASE_SERVICE_ROLE_KEY`; throws `UnauthorizedError` on mismatch
  - `UnauthorizedError` class (maps to 401)

  Every other Edge Function MUST use these helpers — do NOT inline `createClient` or service-role comparison logic. Ref: tech_spec §4.5a + §6.

- [ ] **T006** [P] Create `supabase/functions/_shared/alibaba-dtos.ts` — Deno-local copy of the client-facing DTOs (`OAuthStartRequest`, `OAuthStartResponse`, `DisconnectRequest`, `DisconnectResponse`, `RefreshTokenResponse`). Mirror `src/integrations/alibaba/types.ts` (T030). Add a top-of-file comment: `// Keep in sync with src/integrations/alibaba/types.ts` and list the 5 types. Ref: tech_spec §2.3.

**Checkpoint**: `deno check supabase/functions/_shared/*.ts` (or tsc) produces 0 errors. All shared modules follow `typescript.md` §2 — no `any`, explicit return types on every exported function. → proceed to Phase 2.

---

## Phase 2: OAuth Edge Functions

**Purpose**: Ship the two user-facing OAuth endpoints. After this Phase the full consent flow runs end-to-end against Sandbox.

- [ ] **T010** [P] Create `supabase/functions/alibaba-oauth-start/index.ts` — implements `POST /functions/v1/alibaba-oauth-start`. Calls `requireUser(req)` from `_shared/alibaba-supabase.ts` (T005) to verify JWT + get user. Validates `return_to` against `config.APP_ORIGIN` (must start with it). Signs state via `signState` from T002. Returns `{ authorize_url, state }` as JSON. Uses `serve` from `std@0.168.0`, imports `handleCorsPreflight`, `jsonResponse`, `errorResponse` from `../_shared/cors.ts`. On `UnauthorizedError` → 401; on `return_to` mismatch → 400; on missing env → 500. Do NOT inline `createClient` — use T005 helpers. Ref: tech_spec §3.1, §4.6, §5.1, §6.

- [ ] **T011** [P] Create `supabase/functions/alibaba-oauth-callback/index.ts` — implements `GET /functions/v1/alibaba-oauth-callback`. No JWT (state-signed). Uses `getServiceClient()` from T005 after state verification. Flow per tech_spec §5.2 with **explicit idempotency + cleanup**:
  1. Parse `code`/`state`/`error`. If `error` present → 302 with `?error=${error}`
  2. `verifyState(state)` → extract `statePayload`. On fail → 302 with `?error=invalid_state`
  3. `exchangeCodeForTokens(code)` → `tokens`
  4. `fetchShopInfo(tokens.access_token)` → `{ shop_id, shop_name }` (auto-fallback to `unknown_<uuid>` per T004)
  5. Generate `connection_id = crypto.randomUUID()`, `vault_secret_name = 'alibaba_token_' + connection_id`
  6. `putTokenBundle(vault_secret_name, tokens)`
  7. INSERT connection row (catch unique violation):
     - **If UNIQUE conflict** → SELECT existing row, overwrite its Vault bundle with new tokens, **delete the orphan secret created in step 6**, UPDATE existing row (status/expires/scopes/last_error=null). Redirect uses existing `connection_id`.
     - **If any other DB error after step 6** → `deleteTokenBundle(vault_secret_name)` (swallow cleanup errors, log them), propagate original error → 302 with `?error=db_insert_failed`.
  8. 302 redirect to `${config.APP_ORIGIN}${statePayload.return_to ?? '/settings/alibaba'}?connected=1&connection_id=${connection_id}`

  Never log `access_token`, `refresh_token`, `code`, `state` contents. OK to log: `connection_id`, `user_id`, `platform`, `shop_id`, error codes. Ref: tech_spec §3.2, §5.2, §6.

**Checkpoint**: Manual Sandbox test — `POST alibaba-oauth-start` returns a URL; opening it → consent → callback lands with `?connected=1`; new row in `alibaba_shop_connections` + Vault secret present. → proceed to Phase 3.

---

## Phase 3: Lifecycle Edge Functions

**Purpose**: Close the loop — tokens auto-refresh; user can disconnect.

- [ ] **T020** [P] Create `supabase/functions/alibaba-refresh-token/index.ts` — implements `POST /functions/v1/alibaba-refresh-token`. Calls `requireServiceRoleBearer(req)` from T005 as the FIRST line after CORS preflight — any non-matching bearer → 401 immediately. Uses `getServiceClient()` for DB + Vault. Accepts optional body `{ connection_id?: string }`. If `connection_id` provided → refresh that single row; else `SELECT * FROM alibaba_connections_needing_refresh()`. Loops max 20 with `await sleep(200)` stagger. Per connection:
  1. `bundle = await getTokenBundle(vault_secret_name)`
  2. `newBundle = await refreshAccessToken(bundle.refresh_token)`
  3. `await putTokenBundle(vault_secret_name, newBundle)`
  4. UPDATE row: `access_token_expires_at`, `last_refreshed_at=now()`, `status='active'`, `last_error=null`

  Error handling:
  - `invalid_grant` (refresh_token expired) → UPDATE row `status='refresh_required'`, `last_error='refresh_token expired'`. Do NOT delete Vault bundle (needed for Alibaba re-consent UX).
  - Other errors → UPDATE row `status='error'`, `last_error=String(err).slice(0, 500)`, increment `metadata.refresh_retry_count`.

  Returns `{ refreshed: number, skipped: number, failed: Array<{ connection_id, error }> }`. Log `connection_id`, `user_id`, `status` transitions. Never log tokens. Ref: tech_spec §3.3, §5.3, §6.

- [ ] **T021** [P] Create `supabase/functions/alibaba-disconnect/index.ts` — implements `POST /functions/v1/alibaba-disconnect`. Calls `requireUser(req)` from T005. Parses body `{ connection_id: string }` — validate UUID format (regex `/^[0-9a-f]{8}-...$/i`), 400 if malformed.
  1. Query existing row via user-scoped client: `SELECT id, vault_secret_name FROM alibaba_shop_connections WHERE id = connection_id`. RLS ensures caller owns it; empty result → 404.
  2. Best-effort: `const bundle = await getTokenBundle(...)` then `await revokeToken(bundle.access_token).catch(console.warn)`.
  3. Call `alibaba_delete_connection(connection_id)` SQL function via service client (function self-gates ownership + cascades).
  4. Return `{ ok: true }`.

  Never log token contents. Ref: tech_spec §3.4, §5.4, §6.

- [ ] **T022** Create follow-up migration `supabase/migrations/<NEW_TIMESTAMP>_alibaba_pg_cron.sql`. Registers two pg_cron jobs:
  - `alibaba-refresh-token` every 30 min → `pg_net` `http_post` to the Edge Function URL with service-role bearer
  - `alibaba_purge_expired_cache()` daily at 03:00 UTC → in-DB SQL function, no HTTP

  **Config source for pg_cron = Vault (NOT env vars)** — SQL cannot read `Deno.env`, so the function URL + bearer MUST be pre-seeded in `vault.secrets` before this migration runs. The migration body reads them via `vault.decrypted_secrets`.

  **Mandatory migration header comment** (copy verbatim):
  ```sql
  -- PREREQUISITES (see tech_spec §6 "Deployment ceremony"):
  --   1. Phase 1.1 migration applied (supabase_vault + pg_net enabled)
  --   2. Edge Functions T001–T011 deployed
  --   3. Supabase Secrets set (ALIBABA_* env vars + SUPABASE_SERVICE_ROLE_KEY)
  --   4. Vault secrets seeded:
  --        SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/alibaba-refresh-token', 'alibaba_function_url');
  --        SELECT vault.create_secret('Bearer <SUPABASE_SERVICE_ROLE_KEY>',                           'alibaba_service_role_bearer');
  --   Running this migration BEFORE step 4 will silently register a job that always fails.
  ```

  **Pre-flight check (MANDATORY — first statement after the header comment):**
  ```sql
  DO $$
  DECLARE
      v_missing TEXT[];
  BEGIN
      SELECT COALESCE(array_agg(expected.name), ARRAY[]::TEXT[])
        INTO v_missing
        FROM (VALUES ('alibaba_function_url'), ('alibaba_service_role_bearer')) AS expected(name)
        LEFT JOIN vault.decrypted_secrets v ON v.name = expected.name
       WHERE v.name IS NULL;

      IF array_length(v_missing, 1) > 0 THEN
          RAISE EXCEPTION 'Missing Vault secrets: %. Seed them via vault.create_secret(...) first — see migration header comment.', v_missing
              USING ERRCODE = '55000'; -- object_not_in_prerequisite_state
      END IF;
  END$$;
  ```
  This fails the migration loudly (not silently) if step 4 of the deployment ceremony was skipped.

  Migration body (after the pre-flight) reads secrets via:
  ```sql
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'alibaba_function_url';
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'alibaba_service_role_bearer';
  ```
  Both used inside a `DO` block that calls `cron.schedule(...)` with a `net.http_post` body. Ref: tech_spec §3.3 + §6 Deployment ceremony.

**Checkpoint**: Manual invoke `alibaba-refresh-token` once → verify `last_refreshed_at` updates. Invoke `alibaba-disconnect` → row + Vault secret + cache rows gone. → proceed to Phase 4.

---

## Phase 4: Client Integration Layer

**Purpose**: Expose OAuth flow to the React app via typed hooks. No UI yet.

- [ ] **T030** [P] [CRIT] Create `src/integrations/alibaba/types.ts` — exports TS types + DTOs used by client hooks:
  - `AlibabaPlatform`, `AlibabaConnectionStatus`, `AlibabaShopConnection` (row shape)
  - Edge Function DTOs: `OAuthStartRequest`, `OAuthStartResponse`, `DisconnectRequest`, `DisconnectResponse`, `RefreshTokenResponse`
  - Error code union: `export type AlibabaErrorCode = 'invalid_state' | 'expired_state' | 'db_insert_failed' | 'exchange_failed' | 'revoked' | 'network_error' | 'unknown'`

  All types PascalCase per `typescript.md §5`. All exported functions/constants have explicit return types per `typescript.md §2`. No `any`. Must stay in lockstep with `supabase/functions/_shared/alibaba-dtos.ts` (T006). Mirrors types from tech_spec §2.1, §2.3.

- [ ] **T031** [CRIT] Create `src/integrations/alibaba/client.ts` — thin wrapper around `supabase.functions.invoke(name, { body })`. Exports:
  - `startOAuth(args: OAuthStartRequest): Promise<OAuthStartResponse>`
  - `disconnect(args: DisconnectRequest): Promise<DisconnectResponse>`

  All wrap errors into a typed `AlibabaError { code, message }`. Depends on T030.

- [ ] **T032** [P] Create `src/integrations/alibaba/hooks/use-alibaba-connections.ts` — React Query hook. Query key `['alibaba-connections']`, `staleTime: 30_000`, `enabled: !!user`. SELECT from `alibaba_shop_connections` via existing `supabase` client (RLS restricts to `auth.uid()`).

- [ ] **T033** [P] Create `src/integrations/alibaba/hooks/use-connect-alibaba.ts` — React Query mutation. On mutate: calls `client.startOAuth` then `window.location.href = response.authorize_url`. No onSuccess toast (navigation happens).

- [ ] **T034** [P] Create `src/integrations/alibaba/hooks/use-disconnect-alibaba.ts` — mutation. Calls `client.disconnect`, invalidates `['alibaba-connections']` on success.

- [ ] **T035** [P] Create `src/integrations/alibaba/hooks/use-alibaba-callback-result.ts` — `useEffect` hook, reads `URLSearchParams` once on mount. Behavior:
  - `?connected=1` → `toast.success(t('alibaba.toast.connected'))` + invalidate `['alibaba-connections']` query
  - `?error=<code>` → `toast.error(errorCodeToMessage(code, t))`
  - Always: `history.replaceState({}, '', window.location.pathname)` to clean URL so refresh doesn't re-fire the toast

  **Error code → i18n message mapping** — implement inline in the hook:
  ```ts
  const ERROR_MESSAGES: Record<AlibabaErrorCode, string> = {
    invalid_state:    'alibaba.error.invalid_state',    // "인증 요청이 변조되었거나 만료되었습니다. 다시 시도해 주세요."
    expired_state:    'alibaba.error.expired_state',    // "연결 요청이 만료되었습니다 (15분 제한). 다시 시도해 주세요."
    db_insert_failed: 'alibaba.error.db_insert_failed', // "연결 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요."
    exchange_failed:  'alibaba.error.exchange_failed',  // "Alibaba 인증 서버 응답 오류. 잠시 후 다시 시도해 주세요."
    revoked:          'alibaba.error.revoked',          // "Alibaba 상점에서 권한이 해제되었습니다. 상점 소유주에게 문의하세요."
    network_error:    'alibaba.error.network_error',    // "네트워크 오류가 발생했습니다."
    unknown:          'alibaba.error.unknown',          // "알 수 없는 오류가 발생했습니다."
  };
  function errorCodeToMessage(code: string, t: (k: string) => string): string {
    const key = (code in ERROR_MESSAGES ? code : 'unknown') as AlibabaErrorCode;
    return t(ERROR_MESSAGES[key]);
  }
  ```
  Add the 7 i18n keys to each locale file (ko/en/zh) if the project uses a central translation object; otherwise fall back to hardcoded KR strings with TODO.

**Checkpoint**: `npx tsc --noEmit` produces 0 new errors. → proceed to Phase 5.

---

## Phase 5: Connection UI + Routing

**Purpose**: Ship the user-facing Settings page.

- [ ] **T040** Create `src/pages/AlibabaSettings.tsx` — functional component. Uses shadcn `Card`, `Button`, `Badge`, `AlertDialog` from `@/components/ui/*`.

  **Acceptance criteria (each testable independently):**

  1. **Header** — renders title via `t('alibaba.settings.title')` + subtitle via `t('alibaba.settings.subtitle')`.
  2. **Connect button** — primary button labeled `t('alibaba.settings.connect')`; on click calls `useConnectAlibaba().mutate({ return_to: '/settings/alibaba' })`; disabled while mutation is pending.
  3. **Empty state** — when `connections.length === 0`, shows centered card with `t('alibaba.settings.empty')` and the Connect button.
  4. **Status banner** — when `connections.some(c => c.status !== 'active')`, renders an `Alert` component at top:
     - Variant: `destructive` if any `status === 'error'`; else `default` (warning color) for `refresh_required` / `revoked`
     - Message: interpolated with count + shop names, e.g., `t('alibaba.settings.banner.refresh_required', { names })`
     - Action button "재연결" (re-connect) → triggers `useConnectAlibaba` for the first problematic shop
  5. **Connection list** — renders one `Card` per connection with:
     - Row 1: `Store` icon + `shop_name ?? shop_id` + platform badge (`alibaba_com`)
     - Row 2: status badge (color-coded: active=green-500, refresh_required=amber-500, error=red-500, revoked=gray-500), last-refreshed relative time (`date-fns formatDistanceToNow`)
     - Row 3: Disconnect button → opens `AlertDialog` confirming "정말 연결을 해제하시겠습니까?" → on confirm calls `useDisconnectAlibaba().mutate({ connection_id })`
  6. **Callback side-effect** — calls `useAlibabaCallbackResult()` exactly once on mount (hook body uses `useEffect` with empty deps internally).
  7. **Loading state** — while `connections` query is loading, shows `Skeleton` placeholders (3 rows).
  8. **Error state** — if `connections` query errors, shows inline alert with `t('alibaba.settings.load_error')` and retry button.

- [ ] **T041** Modify `src/App.tsx` — add import `import AlibabaSettings from "./pages/AlibabaSettings";` and route `<Route path="/settings/alibaba" element={<ProtectedRoute><AlibabaSettings /></ProtectedRoute>} />`. Place near the existing `/settings/pricing` route (line ~90 per current file) to keep settings routes grouped.

- [ ] **T042** Modify `src/components/AppLayout.tsx` — add navigation entry for `/settings/alibaba` under the Settings group. Use `Store` icon from `lucide-react`. Label: "Alibaba 연결" (KR), "Alibaba" (EN), "阿里巴巴" (ZH) — follow the existing `useLanguage()` t() pattern used by other nav links.

**Checkpoint**: `npm run build` succeeds. Manual: navigate to `/settings/alibaba` → see empty state. Click Connect → redirected to Alibaba consent (Sandbox). Return → connection appears in the list. Disconnect → list empties. → ready for commit.

---

## Phase 6: Post-implementation Verification

- [ ] **T050** Run `npx tsc --noEmit` in project root → 0 new errors (pre-existing errors are acceptable per project convention).
- [ ] **T051** Run `npm run build` → success.
- [ ] **T052** Run `npx eslint src/integrations/alibaba/ src/pages/AlibabaSettings.tsx` → 0 errors.
- [ ] **T053** Update `docs/project-architecture.md`:
  - Add `alibaba-oauth-start`, `alibaba-oauth-callback`, `alibaba-refresh-token`, `alibaba-disconnect` to the Edge Functions table (increment count to 30)
  - Add 4 new tables (`alibaba_shop_connections`, `alibaba_order_cache`, `alibaba_message_cache`, `alibaba_inventory_cache`) to the Supabase Tables reference
  - Add `/settings/alibaba` to the Route tree
  - Add Alibaba Open Platform to the External Integrations table
- [ ] **T054** Update `docs/constitution.md` Quick Reference table — add row for `/settings/alibaba` → `AlibabaSettings` → `useAlibabaConnections`, `useConnectAlibaba`, `useDisconnectAlibaba` → Supabase + Edge Functions.

---

## Out-of-scope (deferred to later phases)

- Phase 2 (ADR) — `alibaba-fetch-orders` Edge Function + Orders page
- Phase 3 (ADR) — `alibaba-fetch-inventory` + Inventory page
- Phase 4 (ADR) — `alibaba-fetch-messages` + Messages page
- Phase 5 (ADR) — CSV/Excel fallback (`alibaba-csv-import`)
- Vitest hook tests — deferred to Phase 1.6 once surface area justifies setup (current project has only an example test)
- Rate limiting beyond the 200 ms stagger in the refresh loop
- Supporting `1688` / `taobao` platforms (schema is ready, wiring is not)
- Webhook-based message sync (currently polling-only design)

---

## Dependency Graph

```
Phase 1 (T001-T006, all [P])
  ├─ T001 config
  ├─ T002 state
  ├─ T003 vault
  ├─ T004 Alibaba REST client
  ├─ T005 supabase auth helper  ◀── consumed by T010/T011/T020/T021
  └─ T006 DTOs (Deno local copy; mirror of T030)
  └─▶ Phase 2 (T010, T011, [P])
        └─▶ Phase 3 (T020, T021, [P]; T022 deployed after EF + secrets)
              └─▶ Phase 4 (T030 → T031 → T032-T035 [P])
                    └─▶ Phase 5 (T040 → T041, T042)
                          └─▶ Phase 6 (T050-T054)
```

Phase 1 tasks T001–T006 all run in parallel. Phase 2's T010 and T011 run in parallel. Phase 3's T020 and T021 run in parallel; T022 (pg_cron migration) is independent of the Edge Functions but must be applied AFTER both the functions are deployed and the `alibaba_function_url` + `alibaba_service_role_bearer` Vault secrets are set (see Phase 0 guide §7 + T022 header comment). Phase 4 Hook tasks T032–T035 all run in parallel once T030/T031 (types + client) are in place. Phase 5 T041 and T042 are both tiny edits to different files, can run in parallel after T040.
