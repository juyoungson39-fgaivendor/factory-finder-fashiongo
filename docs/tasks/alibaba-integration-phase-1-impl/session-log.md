# Session Log — Alibaba Integration Phase 1 Implementation

**Date:** 2026-04-13
**Target project:** `factory-finder-fashiongo` (sub-project of FGAngels workspace)
**Methodology:** Claude Code + sdev skill (speckit-core agent pipeline)
**Session outcome:** Phase 1 OAuth infrastructure shipped, code review passed, commit deferred

---

## 0. Goal

Enable sourcing managers to securely read **private shop data** from their own Alibaba.com accounts (orders, inventory, TradeManager messages) through the official Open Platform API.

Phase 1 scope: **OAuth connection lifecycle infrastructure** only — actual data-fetch endpoints are deferred to Phases 2–5.

---

## 1. Full Pipeline Timeline

```
Stage A — Foundation (direct, without sdev)
  ├── @Atlas baseline: project-architecture.md + constitution.md
  │     (4 re-review rounds → 95→100% accuracy)
  ├── @SA ADR-0001: architectural decision + Mermaid diagram + roadmap
  ├── Phase 0 guide: Alibaba Open Platform app registration steps
  └── Phase 1.1 migration: 4 tables + RLS + 3 helper RPCs

Stage B — sdev pipeline (full mode, @QA deferred per user)
  ├── Step 0 Router: text mode, --skip-pm, --skip-@SA (ADR covers both)
  ├── Step 3 @TL: tech_spec.md + tasks.md (draft: 415L / 139L)
  ├── Artifact Dual Review — 4 rounds to convergence
  │     R1: @SWE 72, @TL 72 → 6 CRITICAL fixes
  │     R2: @SWE 98, @TL 82 → 3 HIGH+MED fixes
  │     R3: @SWE 98, @TL 82 → 1 HIGH fix (pre-flight check)
  │     R4: @SWE 98, @TL 96 → APPROVE (converged)
  │     Final: tech_spec 503L, tasks 263L
  ├── Step 4 @SWE implementation (25 tasks T001–T054)
  │     Phase 1.2: 6 shared modules + 2 OAuth Edge Functions
  │     Phase 1.3: 2 lifecycle EFs + pg_cron migration
  │     Phase 1.4: types + client + 4 React Query hooks
  │     Phase 1.5: AlibabaSettings page + route + nav entry
  │     Phase 1.6: tsc + build + eslint + doc updates
  └── Code Review — 2 rounds
        R1: Backend APPROVE w/2 HIGH · Frontend REQUEST CHANGES
          → 4 fixes applied (scopes=[], vault try-create-first, i18n deferred, icon deferred)
        R2: Backend APPROVE · Frontend REQUEST CHANGES (1 HIGH)
          → 2 fixes applied (user-scoped query key, last_error truncate)

Stage C — Closure
  ├── QA cross-check: SKIPPED per user (intentional)
  └── Checkpoint 4: session ended without git commit per user
```

---

## 2. Artifact Review Convergence

Final spec quality after 4 rounds of fresh-subagent review:

| Round | @SWE score | @TL score | Action taken |
|-------|-----------|----------|--------------|
| R1 | 72 | 72 | Applied C1–C6: state format, idempotency, shared helper (T005), error map, T040 acceptance criteria |
| R2 | **98 APPROVE** | 82 | Applied N1–N3: deployment ceremony, secret store separation, T022 header |
| R3 | 98 APPROVE | 82 | Applied N5: T022 pre-flight check (fails migration if Vault secrets missing) |
| R4 | **98 APPROVE** | **96 APPROVE** | ✅ Converged |

### Critical decisions locked in by review

- **State token format:** two-part `base64url(payload).base64url(HMAC)`, NOT JWS three-part
- **Idempotency contract:** OAuth callback explicitly handles `UNIQUE(user_id, platform, shop_id)` conflict + orphan Vault cleanup on any DB failure
- **Auth helper centralization:** `_shared/alibaba-supabase.ts` is the only surface for JWT / service-role verification
- **Two secret stores separated:**
  1. **Supabase Secrets** (env vars for Edge Functions via `Deno.env.get`)
  2. **Supabase Vault** (SQL-accessible via `vault.decrypted_secrets`, seeded manually for pg_cron)
- **Pre-flight check:** T022 migration fails loudly with SQLSTATE 55000 if Vault secrets missing

---

## 3. Code Review Findings & Fixes

### Round 1

| Fix | File | Issue | Resolution |
|-----|------|-------|-----------|
| 1 | `alibaba-refresh-token/index.ts:126` | `scopes: ... undefined` caused Supabase to skip the update, retaining stale scopes on provider-side narrowing | `undefined` → `[]` (explicit empty array) |
| 2 | `_shared/alibaba-vault.ts` | Lookup-then-create TOCTOU race between two concurrent requests | Refactored to try-create-first, fall back to update on SQLSTATE 23505 or duplicate-text match |

Deferred (user decision): Frontend i18n keys (project-wide hardcoded-KR pattern, same as `PricingSettings`) and nav icon structure (`Store` per-child vs current per-group).

### Round 2

| Fix | File | Issue | Resolution |
|-----|------|-------|-----------|
| 3 | `use-alibaba-connections.ts` | Query key lacked user scoping → cross-user cache leak on logout/login | Added `alibabaConnectionsKey(userId)` per-user variant + `removeQueries` eviction on logout |
| 4 | `AlibabaSettings.tsx:77` | `last_error` rendered without bounds → very long errors break layout | Added `truncate max-w-[24rem]` + `title` tooltip |

Round 2 backend review explicitly APPROVED both Round 1 fixes as "correctly closed."

---

## 4. Final Deliverables

### Documents (6 new / 2 updated)

```
docs/
├── adr/
│   └── 0001-alibaba-integration.md              NEW  198L  ADR: OAuth + Vault pattern
├── integrations/alibaba/
│   └── phase-0-app-registration.md              NEW  207L  8-step app-registration guide
├── tasks/alibaba-integration-phase-1-impl/
│   ├── tech_spec.md                             NEW  503L  Tony's detailed tech spec
│   ├── tasks.md                                 NEW  263L  T001–T054 implementation tasks
│   └── session-log.md                           NEW  ---   (this file)
├── project-architecture.md                      UPDATED    +4 Edge Functions, +4 tables, +3 RPCs
└── constitution.md                              UPDATED    +1 Quick Reference row
```

### Backend code (11 new files, 528 L SQL + 1244 L TS)

```
supabase/migrations/
├── 20260413160000_create_alibaba_integration.sql   426 L   4 tables + RLS + 3 RPCs
└── 20260413170000_alibaba_pg_cron.sql              102 L   pg_cron + pre-flight

supabase/functions/
├── _shared/
│   ├── alibaba-config.ts                            75 L   env var validator
│   ├── alibaba-state.ts                            128 L   HMAC-SHA256 signed state
│   ├── alibaba-vault.ts                            136 L   Vault CRUD (TOCTOU-safe)
│   ├── alibaba-client.ts                           227 L   Alibaba REST + fallback
│   ├── alibaba-supabase.ts                          99 L   auth helper (single source)
│   └── alibaba-dtos.ts                              56 L   Deno-local DTO copy
├── alibaba-oauth-start/index.ts                    100 L   JWT → sign state → authorize URL
├── alibaba-oauth-callback/index.ts                 251 L   state verify → token exchange → Vault + DB (with idempotency)
├── alibaba-refresh-token/index.ts                  192 L   service-role cron endpoint
└── alibaba-disconnect/index.ts                      99 L   user-initiated disconnect
```

### Frontend code (7 new files, 515 L; 2 modified)

```
src/integrations/alibaba/
├── types.ts                                         68 L   client-facing types
├── client.ts                                        45 L   Edge Function invoke wrapper
└── hooks/
    ├── use-alibaba-connections.ts                   64 L   user-scoped React Query
    ├── use-connect-alibaba.ts                       28 L   mutation → OAuth redirect
    ├── use-disconnect-alibaba.ts                    26 L   mutation → invalidate cache
    └── use-alibaba-callback-result.ts               55 L   side-effect toast + URL clean

src/pages/AlibabaSettings.tsx                       229 L   Settings page (8 acceptance criteria)

src/App.tsx                                         MODIFIED  +import +route
src/components/AppLayout.tsx                        MODIFIED  +nav entry +page title
```

**Net code impact:** 1,287 lines of source (excluding migrations), zero breaking changes to existing code, zero pre-existing tests disturbed.

---

## 5. Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Deno type check (Edge Functions) | `deno check supabase/functions/**/*.ts` | ✅ 0 errors |
| TypeScript project check | `npx tsc --noEmit --project tsconfig.app.json` | ✅ 0 errors |
| Production build | `npm run build` | ✅ `✓ built in 3.81s` |
| ESLint (alibaba files) | `npx eslint src/integrations/alibaba/ src/pages/AlibabaSettings.tsx` | ✅ 0 errors |
| Artifact Review (4 rounds) | fresh @SWE + @TL subagents | ✅ APPROVE |
| Code Review (2 rounds) | fresh Review @SWE subagents | ✅ APPROVE (after fixes) |

---

## 6. Deliberately Deferred (with rationale)

| Item | Why deferred | Future owner |
|------|--------------|--------------|
| i18n: hardcoded Korean strings in toasts, page, ERROR_MESSAGES | Project-wide pattern — same as `PricingSettings.tsx`. A global i18n sprint is needed, not a task-scoped patch. | Future i18n sprint |
| Nav icon: `Store` per child | Current `AppLayout` architecture only supports per-group icons. Changing this affects unrelated nav entries. | Future AppLayout refactor |
| `fetchShopInfo` Alibaba endpoint path | Unverified against current Alibaba docs. Mitigated by fallback `shop_id = unknown_<uuid>`. | Sandbox testing (Phase 0 step 8) |
| `supabaseUntyped as any` cast in `use-alibaba-connections.ts` | Supabase generated types don't yet include `alibaba_*` tables. Will be resolved by `supabase gen types` after Phase 1.1 migration deploys. | Post-deploy one-liner |
| Automated tests (vitest) | Matches project convention — only an example test exists currently. | Phase 1.6 future sprint |
| Rate limiting beyond 200 ms stagger | Phase 1 is low-traffic (manual user connects). Proper per-shop token bucket is Phase 2+ where fetch endpoints ship. | Phase 2 |
| 1688 / Taobao platform support | DB supports via `platform` enum; client code wires only `alibaba_com`. | Future sprint (post-Alibaba launch) |
| git commit | User requested ending without commit. | User's call |
| QA cross-check (sdev final @QA) | Initially deferred to end per user, then user requested skip entirely. | N/A (skipped) |

---

## 7. What Phase 1 Actually Enables

### ✅ Working now (pending Sandbox keys + deploy)

- User clicks "Connect Alibaba Shop" → OAuth consent → returns to app connected
- Connection list shows each shop with status badge (active / refresh_required / error / revoked)
- access_token auto-refreshes every 30 min via pg_cron (invoking `alibaba-refresh-token`)
- Expired cache rows auto-purged daily at 03:00 UTC (`alibaba_purge_expired_cache`)
- `invalid_grant` (refresh_token expired) → status flips to `refresh_required`, UI shows re-connect banner
- Disconnect → atomic delete of connection row + Vault secret + cascades caches via `alibaba_delete_connection(p_connection_id)` SQL function

### ❌ Not yet (Phase 2+)

- Actually fetching orders / inventory / messages (tables exist, fetch Edge Functions don't)
- CSV/Excel fallback import
- 1688 / Taobao connections

---

## 8. Pre-Launch Checklist (for the human)

### Phase 0 — External (blocking, 1–4 weeks)

- [ ] Create Alibaba.com Open Platform developer account
- [ ] Create app, register Redirect URI: `https://<ref>.supabase.co/functions/v1/alibaba-oauth-callback`
- [ ] Obtain Sandbox App Key + App Secret (copy App Secret immediately — shown once)
- [ ] Apply for scopes: orders read / inventory read / messaging read / product catalog read
- [ ] (Later) Submit Production review with demo video + privacy policy + data flow diagram

### Phase 1 deploy — Once Sandbox keys are in hand

- [ ] Supabase Vault enabled (Dashboard → Settings → Vault)
- [ ] Apply migration `20260413160000_create_alibaba_integration.sql`
- [ ] Deploy 4 Edge Functions (`alibaba-oauth-start`, `oauth-callback`, `refresh-token`, `disconnect`)
- [ ] Register 8 Supabase Secrets (`ALIBABA_*` + `ALIBABA_STATE_SIGNING_SECRET`)
- [ ] Seed 2 Vault secrets via SQL:
  ```sql
  SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1/alibaba-refresh-token', 'alibaba_function_url');
  SELECT vault.create_secret('Bearer <SUPABASE_SERVICE_ROLE_KEY>',                           'alibaba_service_role_bearer');
  ```
- [ ] Apply migration `20260413170000_alibaba_pg_cron.sql` (pre-flight will fail loudly if Vault step skipped)
- [ ] `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts` (removes the `as any` cast)
- [ ] Smoke test: `/settings/alibaba` → Connect → Sandbox consent → return with success toast

---

## 9. Key Files to Re-open Next Session

If resuming this work in a future session, start by reading:

1. `docs/adr/0001-alibaba-integration.md` — the "why"
2. `docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md` — the "how"
3. `docs/tasks/alibaba-integration-phase-1-impl/tasks.md` — the "what (completed)"
4. This file — the "what happened and what's next"

---

## 10. Notable Engineering Choices

- **HMAC state, not JWT.** OAuth state only carries opaque CSRF + user-binding context. A full JWT library is overkill.
- **Vault, not envelope-encryption-in-column.** Supabase Vault already provides encrypted secret storage with audit trails; re-inventing with pgcrypto would add key-management burden.
- **Per-connection Vault secret name** (`alibaba_token_<uuid>`) instead of a shared table. Enables independent rotation and simple cascade deletion.
- **try-create-first instead of upsert.** `vault.create_secret` + `vault.update_secret` don't expose a single atomic upsert; the SQLSTATE 23505 path is explicit and race-safe.
- **Fallback `shop_id = unknown_<uuid>`.** Letting `fetchShopInfo` failures cascade into a failed connect would create a bad UX for a recoverable API hiccup. User can rename the shop later.
- **Deno-local DTO copy (T006).** Importing TS from `src/` into Deno Edge Functions is not reliably supported; a small duplicated surface is cheaper than tooling it out.
- **pg_cron config in Vault, not env.** SQL cannot read `Deno.env`, and hardcoding the function URL / bearer in the migration would leak secrets into git history.

---

*Session conducted with Claude Code (Opus 4.6) · 2026-04-13 · ~7 hours elapsed*
