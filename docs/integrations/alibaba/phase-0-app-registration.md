# Phase 0: Alibaba.com Open Platform App Registration Guide

> **Audience:** Project owner / DevOps. This phase requires manual action on Alibaba's developer portal and **cannot be automated by code**.
>
> **Goal:** Obtain Sandbox credentials (for Phase 1 development) and Production credentials (for live release), and configure them as Supabase Secrets so that downstream Edge Functions can use them.
>
> **Estimated calendar time:** Sandbox 1–3 days · Production review 1–4 weeks (varies by Alibaba's review queue and scope sensitivity).

---

## Prerequisites

| Item | Why |
|------|-----|
| Alibaba.com buyer/seller account (or generic Alibaba account) | Required to create a developer account |
| Business email + company info (optional but recommended) | Production-tier apps usually need verified business identity |
| Public HTTPS callback URL | OAuth redirect target. Use Supabase Edge Function URL once Phase 1 is provisioned. For local dev, use a tunnel (ngrok / cloudflared) |
| Supabase project owner access | To register secrets and enable Vault |

---

## Step 1: Create developer account on Alibaba.com Open Platform

1. Navigate to **https://open.alibaba.com/** (verify the latest URL — Alibaba occasionally rebrands portals).
2. Sign in with your Alibaba account; if no developer profile exists, you will be prompted to create one.
3. Complete identity verification:
   - **Personal account**: name, ID, phone — usually enough for Sandbox
   - **Company account**: business license, company info, legal representative — usually required for Production scopes that touch order/finance data
4. Accept the **Open Platform Developer Agreement** carefully — note clauses on rate limit, data retention, PII handling, and revocation rights.

> 📌 If you already have a 1688 / Taobao developer profile, the same identity may carry over but the app and scope approvals are separate per platform.

---

## Step 2: Create the application

1. In the developer console, go to **Console → Apps → Create App** (메뉴명은 시기에 따라 다를 수 있음).
2. Fill in:
   - **App Name**: `Factory Finder FashionGo` (사용자에게 OAuth consent 화면에서 보이는 이름)
   - **App Type**: Web Application (server-side OAuth)
   - **Description**: 한 문단으로 앱이 접근하는 데이터와 사용 목적을 명확히 기술 (심사 시 검토됨)
   - **Privacy Policy URL**: 필수. 공개된 정적 페이지 URL이어야 함
   - **Terms of Service URL**: 필수
   - **Logo**: 권장 (consent 화면에 표시됨)
3. **Redirect URI** 등록 (여러 개 등록 가능):
   - Sandbox: `https://<supabase-project-ref>.supabase.co/functions/v1/alibaba-oauth-callback`
   - Production: 위와 동일 (또는 prod 전용 Supabase 프로젝트 URL)
   - Local dev (선택): `https://<ngrok-subdomain>.ngrok.io/functions/v1/alibaba-oauth-callback`
4. 앱이 생성되면 **App Key** (= `client_id`) 와 **App Secret** (= `client_secret`)이 발급된다. App Secret은 한 번만 노출되니 즉시 안전한 곳에 복사.

---

## Step 3: Apply for permission scopes (API permissions)

Alibaba.com Open Platform은 API를 카테고리(권한 묶음)로 묶어 신청받는다. 필요한 카테고리는:

| Category | Purpose | Approval risk |
|----------|---------|---------------|
| **Trade / Order (read)** | 주문 내역 조회 (`alibaba.icbu.trade.*` 계열) | **High** — 비즈니스 검증 자료 요구 가능. Use case 명확히 작성 필수 |
| **Inventory / Product Stock (read)** | 상세 재고 조회 | Medium |
| **TradeManager / Messaging (read)** | 고객 메시지 조회 | **High** — 데이터 민감도 높음. PII 처리 정책 명시 필수 |
| **Product Catalog (read)** | 상품 목록 조회 (Phase 2-1에서 검증용으로 함께 신청 권장) | Low |

**신청 팁:**
- 한 번에 여러 권한을 신청해도 되지만, 각 권한 옆에 **해당 use case + 처리할 데이터 양**을 구체적으로 적을 것
- "전체 주문" 같은 광범위 표현보다 "사용자가 자신의 상점에 대한 주문을 본인 권한 내에서 조회"처럼 범위를 좁혀 표현
- "데이터를 어디에 저장하고 보유 기간은 얼마인가" 항목이 자주 요구됨 → ADR-0001의 cache TTL 정책(주문 30일, 메시지 7일, 재고 즉시 갱신) 그대로 답변
- write 권한(주문 변경, 메시지 발송 등)은 **신청하지 말 것** — 본 통합은 read-only로 시작

---

## Step 4: Sandbox testing access

1. Sandbox는 즉시 또는 수 시간 내 활성화되는 경우가 많다.
2. Sandbox 환경에서는 가짜 상점 데이터로 OAuth flow + API 호출을 끝까지 검증할 수 있다.
3. Sandbox 키와 Production 키는 **별도**다. Phase 1 개발은 Sandbox로 진행하고, 키는 둘 다 Supabase Secrets에 환경별로 저장한다.
4. Sandbox base URL (예시 — 최신 문서 확인 필요):
   - Auth: `https://oauth.alibaba.com/authorize`
   - Token: `https://oauth.alibaba.com/token`
   - API: `https://gw.api.alibaba.com/openapi/...` 또는 `https://api-sg.aliexpress.com/...` (지역별로 상이)

> 📌 **확인 필요**: 정확한 도메인은 Alibaba.com Open Platform 콘솔의 "API Reference" → 각 API 페이지 상단에 표기된 endpoint를 그대로 복사할 것. SDK 페이지에 예시가 함께 있다.

---

## Step 5: Production review & launch

Production 권한은 별도 심사 단계가 있다.

1. 콘솔에서 각 권한별로 **Apply for Production** 버튼 클릭
2. 제출 자료:
   - **Use case demo video / screenshots**: 우리 앱에서 OAuth 동의 → 데이터 표시까지의 흐름
   - **Privacy policy** (앱과 동일한 URL이어야 함)
   - **Data flow diagram** (선택이지만 통과율 ↑) — ADR-0001의 mermaid 다이어그램 활용 가능
   - **Security measures**: 토큰을 Supabase Vault로 암호화, RLS, HTTPS 등 명시
3. 심사 기간: 보통 1–4주. **반려되면 사유 확인 후 자료 보완해서 재신청**. 보통 2–3회 반복하는 경우 흔함.
4. 승인되면 동일 App Key가 production endpoint에서도 동작한다 (별도 키 발급이 아님).

---

## Step 6: Configure Supabase Secrets

Phase 1 Edge Function이 사용할 secrets를 등록한다. 두 가지 방법:

### Option A — Supabase Dashboard
1. Supabase 프로젝트 → **Edge Functions → Secrets**
2. 다음 키-값 등록:

| Secret name | Value | Notes |
|-------------|-------|-------|
| `ALIBABA_CLIENT_ID` | App Key | 공개되어도 무방하지만 Secret으로 보관 권장 |
| `ALIBABA_CLIENT_SECRET` | App Secret | **절대 노출 금지** |
| `ALIBABA_REDIRECT_URI` | `https://<ref>.supabase.co/functions/v1/alibaba-oauth-callback` | App 등록 시 입력한 URI와 정확히 일치해야 함 |
| `ALIBABA_OAUTH_AUTHORIZE_URL` | 예: `https://oauth.alibaba.com/authorize` | 콘솔에서 확인한 정확한 값 |
| `ALIBABA_OAUTH_TOKEN_URL` | 예: `https://oauth.alibaba.com/token` | 콘솔에서 확인한 정확한 값 |
| `ALIBABA_API_BASE_URL` | 예: `https://gw.api.alibaba.com/openapi` | 콘솔에서 확인한 정확한 값 |
| `ALIBABA_ENV` | `sandbox` 또는 `production` | Phase 1은 `sandbox`로 시작 |

### Option B — CLI

```bash
supabase secrets set \
  ALIBABA_CLIENT_ID=xxxxx \
  ALIBABA_CLIENT_SECRET=xxxxx \
  ALIBABA_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/alibaba-oauth-callback \
  ALIBABA_OAUTH_AUTHORIZE_URL=https://oauth.alibaba.com/authorize \
  ALIBABA_OAUTH_TOKEN_URL=https://oauth.alibaba.com/token \
  ALIBABA_API_BASE_URL=https://gw.api.alibaba.com/openapi \
  ALIBABA_ENV=sandbox \
  --project-ref <ref>
```

---

## Step 7: Enable Supabase Vault (one-time)

Phase 1.1 마이그레이션에서 자동으로 시도하지만, 미리 활성화해두면 안전:

1. Supabase Dashboard → **Settings → Vault**
2. "Enable Vault" 클릭
3. 활성화 후, SQL Editor에서 다음으로 동작 확인:

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'supabase_vault';
-- 결과가 1 row 나오면 OK
```

> Supabase Cloud는 기본적으로 Vault를 지원. Self-hosted 환경이라면 공식 문서(`supabase.com/docs/guides/database/vault`)를 참조해서 설치 필요.

---

## Step 8: Test the Sandbox OAuth flow (Phase 1 완료 후)

Phase 1.2 (`alibaba-oauth-callback` Edge Function) 배포 후:

1. Browser에서 직접 OAuth URL 호출:
   ```
   https://oauth.alibaba.com/authorize?
     response_type=code
     &client_id=<ALIBABA_CLIENT_ID>
     &redirect_uri=<ALIBABA_REDIRECT_URI>
     &scope=<requested-scopes>
     &state=<random-csrf-token>
   ```
2. Alibaba consent 화면에서 Sandbox test 상점으로 로그인 후 동의
3. `alibaba-oauth-callback` Edge Function이 `authorization_code`를 받고 토큰 교환 → Vault 저장 → connection row 생성
4. Supabase에서 `alibaba_shop_connections` 테이블 확인 → row 존재해야 함
5. Supabase Vault에서 `alibaba_token_<connection_id>` secret 존재 확인

---

## Checklist Summary

| Step | Status | Owner |
|------|--------|-------|
| 1. 개발자 계정 생성 + 인증 | ☐ | Project Owner |
| 2. 앱 생성 + redirect URI 등록 | ☐ | Project Owner |
| 3. 권한 스코프 신청 (Trade read / Inventory read / Messaging read / Product Catalog read) | ☐ | Project Owner |
| 4. Sandbox 키 확보 + 환경 검증 | ☐ | Project Owner |
| 5. Production 심사 신청 + 승인 | ☐ | Project Owner |
| 6. Supabase Secrets 등록 (Sandbox) | ☐ | DevOps |
| 7. Supabase Vault 활성화 | ☐ | DevOps |
| 8. End-to-end Sandbox OAuth flow 테스트 | ☐ | DevOps + 개발자 (Phase 1 완료 후) |

---

## Troubleshooting (자주 발생하는 이슈)

| 증상 | 원인 / 해결 |
|------|-------------|
| OAuth consent 화면에서 "redirect_uri mismatch" | App에 등록한 redirect URI와 호출 시 사용한 URI가 한 글자라도 다름 (trailing slash 포함). 정확히 일치시킬 것 |
| Token 교환 시 `invalid_client` | `client_secret` 오타. 한 번만 노출되므로 잃어버렸으면 콘솔에서 secret 재발급 (기존 secret은 무효화됨) |
| API 호출 시 `permission denied` (Sandbox에서는 OK인데 Production에서) | 해당 권한이 Production 승인되지 않음. Step 5 진행 |
| `rate_limit_exceeded` | 분당/일별 호출 제한 초과. ADR-0001의 token bucket으로 제어. 임시로는 backoff + retry로 대응 |
| Refresh token 만료 (`invalid_grant`) | refresh_token 자체가 만료(보통 30일). 사용자에게 "Alibaba 상점을 다시 연결해주세요" 안내. UI에 status 배너로 노출 |

---

## Reference Links (확인 후 업데이트)

- Alibaba.com Open Platform: https://open.alibaba.com/
- Developer Center: https://open.alibaba.com/doc (정확한 경로는 변경될 수 있음)
- API Reference: 콘솔 → API List
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- Supabase Edge Functions Secrets: https://supabase.com/docs/guides/functions/secrets

> ⚠️ Alibaba 측 URL/스코프명/문서 위치는 자주 변경된다. 본 가이드는 2026-04 시점 추정이며, **앱 등록 직전에 콘솔에서 최신 정보를 확인할 것**.
