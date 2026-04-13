# Alibaba 통합 Phase 1 — 개요와 다음 할 일

> **이 문서의 목적:** "지금까지 뭘 만들었고, 앞으로 뭘 해야 하는지"를 한눈에 볼 수 있게 정리합니다.
> 기술적 상세는 동일 디렉토리의 다른 문서를 참조하세요.

---

## TL;DR

- **만든 것:** Alibaba.com 상점 소유주가 OAuth로 앱에 연결하고, 앱이 그 상점의 비공개 데이터(주문/재고/메시지)를 받을 수 있게 하는 **인증 인프라**
- **아직 없는 것:** 실제 주문/재고/메시지를 **가져오는 기능** (Phase 2~5)
- **다음 해야 할 일:** Alibaba 개발자 포털에서 앱 등록 → Supabase 배포 → Sandbox 테스트 → Production 승인

---

## 📦 뭘 만들었나?

### 사용자 관점
`/settings/alibaba` 페이지에서:
1. **"Alibaba 상점 연결"** 버튼 클릭
2. Alibaba 동의 화면으로 이동 → 상점 소유주 로그인 + 권한 승인
3. 앱으로 돌아오면 연결된 상점이 목록에 나타남
4. 상태 배지로 정상/재연결 필요/오류 확인
5. 언제든 "연결 해제" 가능

### 기술 관점

| 계층 | 내용 |
|------|------|
| **DB** | 4개 테이블 (`alibaba_shop_connections` + 3 cache) + User-scoped RLS |
| **Secret 보관** | Supabase Vault로 access/refresh 토큰 암호화 (DB 컬럼 노출 0) |
| **OAuth 서버** | 4개 Supabase Edge Functions (Deno) |
| **토큰 자동 갱신** | pg_cron 30분마다, 만료 1시간 전 자동 refresh |
| **캐시 자동 정리** | pg_cron 매일 03:00 UTC, 만료 cache row 삭제 |
| **React 클라이언트** | 설정 페이지 1개 + React Query 훅 4개 + 라우트/네비 추가 |
| **보안** | HMAC state (CSRF), constant-time bearer 비교, RLS, service-role 격리 |

### 파일 요약

| 카테고리 | 신규 | 수정 |
|----------|------|------|
| 문서 | 5 (ADR, Phase 0 가이드, tech_spec, tasks, session-log) | 2 (project-architecture, constitution) |
| DB 마이그레이션 | 2 (schema + pg_cron) | 0 |
| Edge Functions | 10 (shared 6 + endpoints 4) | 0 |
| React 코드 | 7 (types, client, 4 hooks, 1 page) | 2 (App.tsx, AppLayout.tsx) |
| **합계** | **24 신규** | **4 수정** |

코드량: SQL 528줄 + TypeScript 1,759줄

### 지금 동작하는 것 ✅
- OAuth 연결 전체 플로우 (consent → callback → Vault 저장 → DB insert)
- access_token 자동 갱신 + refresh_token 만료 감지
- 재연결(같은 상점 재동의) 시 orphan Vault secret 자동 정리
- 연결 해제 (토큰 폐기 + Vault 삭제 + cache cascade)
- User-scoped 캐시 격리 (다른 사용자 데이터 누수 방지)

### 아직 없는 것 ❌
- 실제 주문/재고/메시지 **조회** Edge Functions (Phase 2~4)
- CSV/Excel 업로드 폴백 (Phase 5)
- 1688 / Taobao 연결 (스키마는 지원, 코드는 alibaba.com 전용)
- i18n (하드코딩된 한국어 — 프로젝트 전체 패턴과 일치)

---

## 🎯 이제 뭘 해야 하지?

### 단계별 우선순위

```
🔴 블로커 (사람만 가능, 다른 모든 작업의 전제)
└─ 1. Alibaba 개발자 앱 등록 + Sandbox 키 확보

🟡 Sandbox 키 받으면 즉시
├─ 2. Supabase 배포 (migration + Edge Functions + secrets + Vault seed)
├─ 3. Sandbox 스모크 테스트
└─ 4. Git 커밋 (원할 경우)

🟢 나중에 (Production 승인 후 / 추후 스프린트)
├─ 5. Production 심사 제출 + 승인 대기 (1~4주)
├─ 6. Phase 2~5 (주문/재고/메시지/CSV) 개발
└─ 7. 기술 부채 정리 (i18n, 테스트, 나머지 플랫폼)
```

---

### 🔴 1. Alibaba 앱 등록 (이번 주)

**가이드:** `docs/integrations/alibaba/phase-0-app-registration.md` (상세 8단계)

핵심 액션:
- [ ] **https://open.alibaba.com** 에서 개발자 계정 생성 + 신원 인증
- [ ] 앱 생성, 아래 Redirect URI 등록:
  ```
  https://<your-supabase-project-ref>.supabase.co/functions/v1/alibaba-oauth-callback
  ```
- [ ] **App Key + App Secret 받기** (App Secret은 한 번만 노출, 즉시 복사!)
- [ ] 권한 스코프 신청:
  - Trade / Order (read)
  - Inventory / Product Stock (read)
  - TradeManager / Messaging (read)
  - Product Catalog (read)

**예상 소요:** Sandbox 1~3일, Production 승인 1~4주

---

### 🟡 2. Supabase 배포 (Sandbox 키 받은 당일 가능)

**실행 순서 (엄격)** — tech_spec §6 Deployment ceremony 참조

#### 2-a. Vault 활성화
```
Supabase Dashboard → Settings → Vault → "Enable"
```
```sql
-- 동작 확인
SELECT extname FROM pg_extension WHERE extname = 'supabase_vault';
```

#### 2-b. 마이그레이션 적용 #1 (테이블 + RLS)
```bash
# supabase/migrations/20260413160000_create_alibaba_integration.sql 적용
supabase db push   # 또는 Dashboard → SQL Editor에 붙여넣기
```

#### 2-c. Edge Functions 배포
```bash
supabase functions deploy alibaba-oauth-start
supabase functions deploy alibaba-oauth-callback
supabase functions deploy alibaba-refresh-token
supabase functions deploy alibaba-disconnect
```

#### 2-d. Supabase Secrets 등록 (8개)
```bash
supabase secrets set \
  ALIBABA_CLIENT_ID=<App Key> \
  ALIBABA_CLIENT_SECRET=<App Secret> \
  ALIBABA_REDIRECT_URI=https://<ref>.supabase.co/functions/v1/alibaba-oauth-callback \
  ALIBABA_OAUTH_AUTHORIZE_URL=<Alibaba 콘솔에서 복사> \
  ALIBABA_OAUTH_TOKEN_URL=<Alibaba 콘솔에서 복사> \
  ALIBABA_API_BASE_URL=<Alibaba 콘솔에서 복사> \
  ALIBABA_STATE_SIGNING_SECRET=$(openssl rand -base64 48) \
  ALIBABA_APP_ORIGIN=<앱 도메인, 예: http://localhost:8080> \
  ALIBABA_ENV=sandbox \
  --project-ref <ref>
```

#### 2-e. Vault secrets 시드 (SQL Editor)
```sql
SELECT vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/alibaba-refresh-token',
  'alibaba_function_url'
);
SELECT vault.create_secret(
  'Bearer <SUPABASE_SERVICE_ROLE_KEY>',
  'alibaba_service_role_bearer'
);
```

> ⚠️ 이 단계를 건너뛰면 다음 단계가 `SQLSTATE 55000`으로 중단됩니다. (의도된 fail-fast)

#### 2-f. 마이그레이션 적용 #2 (pg_cron)
```bash
# supabase/migrations/20260413170000_alibaba_pg_cron.sql 적용
supabase db push
```

#### 2-g. Supabase 타입 재생성 (선택, 권장)
```bash
supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts
```
→ `use-alibaba-connections.ts`의 `supabaseUntyped as any` 캐스트 제거 가능

---

### 🟡 3. Sandbox 스모크 테스트

1. `npm run dev` 실행
2. 브라우저에서 `/settings/alibaba` 접속
3. **"Alibaba 상점 연결"** 클릭
4. Alibaba Sandbox 상점으로 로그인 + 동의
5. 앱으로 돌아와서 확인:
   - [ ] "Alibaba 상점이 연결되었습니다" 토스트
   - [ ] 상점이 목록에 `active` 상태로 표시
   - [ ] URL 쿼리 파라미터가 clean 처리됨 (새로고침해도 토스트 재발생 X)
6. Supabase SQL Editor:
   ```sql
   SELECT id, user_id, platform, shop_id, status, vault_secret_name
     FROM alibaba_shop_connections;
   -- → 1 row 존재
   SELECT name FROM vault.secrets WHERE name LIKE 'alibaba_token_%';
   -- → 1 row 존재
   ```
7. **강제 refresh 테스트:**
   ```sql
   SELECT net.http_post(
     url := 'https://<ref>.supabase.co/functions/v1/alibaba-refresh-token',
     headers := jsonb_build_object(
       'Content-Type', 'application/json',
       'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
     ),
     body := '{}'::jsonb
   );
   -- → 응답이 200 OK, last_refreshed_at 갱신됨
   ```
8. **연결 해제 테스트:** 목록에서 "연결 해제" 클릭 → 확인 → 상점 제거됨

---

### 🟡 4. Git 커밋 (원할 경우)

```bash
cd /Users/nhn/Project/FGAngels/factory-finder-fashiongo
git status
git add docs/ supabase/ src/
```

**커밋 메시지 (프로젝트 컨벤션):**
```
[dongbin] <Dooray-task>: feat: add Alibaba OAuth integration Phase 1

- 4 tables + RLS migration for connection/caches
- 4 Edge Functions: oauth-start, oauth-callback, refresh-token, disconnect
- pg_cron for 30-min token refresh + daily cache purge
- Vault-backed token storage (no raw tokens in DB columns)
- React Query hooks + AlibabaSettings page + routing
- Code review: 4 fixes applied (scopes=[], vault race, user-scoped query key, error truncation)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

> Dooray 태스크 번호가 있으면 commit 제목에 포함. 없으면 사내 컨벤션 확인 후 조정.

---

### 🟢 5. Production 승인 (승인 기간 1~4주)

Alibaba 콘솔에서 각 스코프별 "Apply for Production" 클릭 후 제출 자료:

- [ ] **데모 영상/스크린샷** — 앱에서 OAuth 동의부터 데이터 표시까지 흐름
- [ ] **Privacy Policy URL** (앱 등록 시 URL과 동일)
- [ ] **Data Flow 다이어그램** — ADR-0001 Mermaid 재사용 가능
- [ ] **보안 조치 설명**:
  - 토큰은 Supabase Vault에 AES 암호화 저장
  - User-scoped RLS로 사용자 간 데이터 격리
  - HTTPS 전용
  - 캐시 TTL 정책 (주문 30일, 메시지 7일)

반려 시 사유 보고 자료 보완하여 재제출 (보통 2~3회 반복).

---

### 🟢 6. Phase 2~5 개발

| Phase | 범위 | 의존 | 예상 |
|-------|------|------|------|
| **Phase 2** | 주문 조회 (`alibaba-fetch-orders` + Orders UI) | Production 승인 | 1 스프린트 |
| **Phase 3** | 재고 조회 (`alibaba-fetch-inventory` + Inventory UI) | Production 승인 | 1 스프린트 |
| **Phase 4** | 메시지 조회 (`alibaba-fetch-messages` + incremental sync) | Production 승인 | 1~2 스프린트 (복잡) |
| **Phase 5** | CSV/Excel fallback | 독립 (Phase 1 직후 가능) | 1 스프린트 |

새 Claude Code 세션에서 `/sdev` 스킬로 실행 가능. 입력 예:
> "Alibaba 통합 Phase 2 주문 조회 구현. docs/adr/0001 + tasks/alibaba-integration-phase-1-impl/ 참조."

---

### 🟢 7. 기술 부채 정리 (이번 Phase 의도적 보류)

| 항목 | 해결 방법 |
|------|----------|
| i18n 하드코딩 KR | 프로젝트 전체 i18n 스프린트에서 일괄 전환 (PricingSettings 등도 함께) |
| Nav 아이콘 `Store` | AppLayout child별 아이콘 지원 구조로 리팩토링 |
| 자동 테스트 부재 | vitest 실사용 도입 + 주요 훅 유닛 테스트 |
| `supabaseUntyped as any` | 2-g 수행하면 자동 해결 |

---

## 📂 관련 문서 (동일 디렉토리)

| 파일 | 내용 |
|------|------|
| `tech_spec.md` | 503줄 — Tony(@TL)의 상세 기술 스펙 (데이터 모델, API, 로직) |
| `tasks.md` | 263줄 — T001~T054 태스크 리스트 (완료) |
| `session-log.md` | 260줄 — 세션 전체 이력, 리뷰 라운드, 수정 내역, 배포 체크리스트 |
| `README.md` | (이 파일) 개요 + 다음 할 일 요약 |

## 📂 관련 문서 (상위 디렉토리)

| 파일 | 내용 |
|------|------|
| `../../adr/0001-alibaba-integration.md` | ADR — 아키텍처 결정 + Mermaid 다이어그램 |
| `../../integrations/alibaba/phase-0-app-registration.md` | Alibaba 앱 등록 상세 8단계 |
| `../../project-architecture.md` | 프로젝트 전체 아키텍처 (Alibaba 통합 반영) |
| `../../constitution.md` | 프로젝트 아키텍처 헌법 (Quick Reference 업데이트) |

---

## 🆘 막히면 어디를 볼까?

| 증상 | 참조 문서 |
|------|----------|
| "Alibaba 앱 어떻게 만들지?" | `phase-0-app-registration.md` Step 1~5 |
| "Secret을 어디에 등록하지?" | `phase-0-app-registration.md` Step 6 + 이 문서 §2-d |
| "pg_cron이 동작 안 해요" | `tech_spec.md` §6 Deployment ceremony + 이 문서 §2-e |
| "재연결하면 중복 row 생기나?" | `tech_spec.md` §5.2 idempotency contract |
| "토큰 만료 시 뭐가 일어나?" | `tech_spec.md` §5.3 refresh flow |
| "이 코드가 왜 이렇게 됐지?" | `session-log.md` §10 Notable Engineering Choices |

---

*Last updated: 2026-04-13 · Phase 1 complete, Phase 2+ pending*
