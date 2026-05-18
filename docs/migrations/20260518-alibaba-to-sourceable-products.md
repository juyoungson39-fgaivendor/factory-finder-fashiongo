# 20260518 — Alibaba 크롤 데이터 → `sourceable_products` 통합

> 소싱가능상품 페이지(`/products/sourceable-agent`)의 mock 데이터를 백업하고
> 실제 알리바바 크롤 데이터로 대체한 마이그레이션 런북.

- **Migrations:**
  - `supabase/migrations/20260518000000_alibaba_to_sourceable_products.sql` — 백업 + 1차 마이그레이션
  - `supabase/migrations/20260518100000_alibaba_category_and_moq.sql` — 카테고리 backfill + MOQ 컬럼
- **Edge function:** `supabase/functions/crawl-alibaba-products/index.ts`
- **UI:** `src/pages/SourceableAgent.tsx`, `src/components/product/ProductTable.tsx`
- **시점:** 2026-05-18
- **상태:** Applied

---

## 1. 변경 범위 (What changed)

### 1.1 DB
| 객체 | 변경 |
|---|---|
| `sourceable_products_mock_backup` | **신규** — 마이그레이션 직전 `sourceable_products` 전체를 `CREATE TABLE AS TABLE` 로 복사 |
| `trend_sourceable_matches_mock_backup` | **신규** — 마이그레이션 직전 `trend_sourceable_matches` 전체 복사 (FK CASCADE로 잃을 데이터 보존) |
| `sourceable_products` | mock row 삭제 (`source IN ('agent_auto','csv_upload','seed')`) |
| `sourceable_products.alibaba_product_id` | **신규 컬럼** (TEXT, nullable) |
| `sourceable_products` UNIQUE 제약 | **신규** — `UNIQUE (factory_id, alibaba_product_id)` (NULL은 PG 기본 동작으로 충돌 안 함) |
| `sourceable_products_source_check` | `alibaba_crawl` 값 허용하도록 재정의 |
| `sourceable_products` 초기 backfill | `factory_alibaba_products` 전체를 `source='alibaba_crawl'` 로 INSERT |

### 1.2 Edge Function
`crawl-alibaba-products` 가 매 크롤마다 두 테이블을 동시에 upsert:
- `factory_alibaba_products` (raw 데이터 — 기존 동작)
- `sourceable_products` (UI 표시용 미러 — 신규)
  - currency-aware mapping: USD → `unit_price_usd`, CNY → `unit_price_cny`
  - 미러 upsert 실패 시 non-fatal (경고 로그만 남기고 crawl은 completed 처리)

### 1.3 UI
- 출처 필터에 `Alibaba` 체크박스 추가 (`SOURCE_KEY: alibaba_crawl`)
- `ProductTable` 출처 뱃지 매핑에 `alibaba_crawl: 'Alibaba'` 추가

### 1.4 필터 호환성 보강 (2차 migration `20260518100000_alibaba_category_and_moq.sql`)
mock 데이터엔 채워져 있었지만 알리바바 row 엔 비어있어서 필터가 무력화되던
필드를 보정.

| 필드 | 처리 방식 |
|---|---|
| `category` | 크롤 시 title 키워드 매칭 (Dress / Top / Set / Pants / Shirt / Skirt / Jacket / Coat / Hoodie / Sweater / Cardigan / Suit / Swimwear / Lingerie / Jumpsuit) — 기존 row 도 1회 backfill |
| `moq_value`, `moq_unit` | 신규 컬럼. `factory_alibaba_products` 의 MOQ 를 미러 + 기존 row 1회 backfill |
| `detected_colors`, `detected_style`, `detected_material`, `image_description` | **보류** (Vision API 비용 발생) — distinct 가 비면 UI에서 섹션 자동 hide |
| `weight_kg` | **알리바바 미제공** — null 그대로. 무게 필터는 mock row 대상 그대로 작동 |

UI 측 변경:
- `FilterState` 에 `moqMin`, `moqMax` 추가, 상세검색 펼침 영역에 MOQ 입력 행 추가
- `ProductRow` 타입에 `moq_value`, `moq_unit`, `alibaba_product_id` 추가
- 클라이언트 필터: MOQ 도 무게와 동일 규칙 (`min`만 있으면 null 제외, `max`만 있으면 null 포함)

---

## 2. 왜 이렇게 했나 (Decisions)

| 결정 | 대안 | 채택 이유 |
|---|---|---|
| 테이블 통째 복사 백업 (`CREATE TABLE AS`) | 컬럼별 dump 파일 | 동일 DB 안에 SQL 한 줄로 복구 가능. 별도 파일/스토리지 불필요 |
| `factory_alibaba_products` → `sourceable_products` INSERT (양쪽 운영) | UI에서 알리바바 테이블 직접 조회 | 기존 CRUD(수정/보관/CSV/매칭/embedding)이 그대로 동작. trend_sourceable_matches FK도 유지 |
| Edge function이 두 테이블 모두 upsert | 트리거(Trigger) 동기화, 또는 별도 sync 버튼 | 트리거는 RLS와의 상호작용이 까다롭고, 별도 버튼은 UX 분기 발생. 한 번 invoke 안에 끝내는 게 가장 단순 |
| `alibaba_product_id` 컬럼 + UNIQUE(factory_id, alibaba_product_id) | partial unique index (`WHERE source='alibaba_crawl'`) | supabase-js upsert가 partial index의 `ON CONFLICT` 추론을 지원하지 않음. NULL distinct 동작으로 자연스럽게 비-알리바바 row와 충돌 회피 |
| `DELETE ... WHERE source IN (...)` (mock만 삭제) | `TRUNCATE` | 마이그레이션 재실행 시 신규 알리바바 row를 보호 (idempotency) |

---

## 3. 롤백 절차 (Rollback)

### 3.1 즉시 롤백 — UI를 mock 상태로 되돌리기

```sql
BEGIN;

-- (1) 알리바바 미러 row 모두 삭제
DELETE FROM public.sourceable_products
WHERE source = 'alibaba_crawl';

-- (2) mock row 복원
INSERT INTO public.sourceable_products
SELECT * FROM public.sourceable_products_mock_backup;

-- (3) mock 매칭 기록 복원
INSERT INTO public.trend_sourceable_matches
SELECT * FROM public.trend_sourceable_matches_mock_backup;

-- (4) source check 제약을 원래대로
ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_source_check;
ALTER TABLE public.sourceable_products
  ADD CONSTRAINT sourceable_products_source_check
  CHECK (source IN ('agent_auto', 'csv_upload', 'seed'));

-- (5) 신규 컬럼/제약 제거 (선택)
ALTER TABLE public.sourceable_products
  DROP CONSTRAINT IF EXISTS sourceable_products_factory_alibaba_unique;
ALTER TABLE public.sourceable_products
  DROP COLUMN IF EXISTS alibaba_product_id;

COMMIT;
```

### 3.2 Edge function 롤백
`crawl-alibaba-products/index.ts` 의 sourceable_products 미러 블록(주석 `// Mirror the crawl results into sourceable_products …` 부터 `if (sourceableError) { … }` 닫는 괄호까지)을 제거하고 `supabase functions deploy crawl-alibaba-products` 재배포.

### 3.3 UI 롤백
다음 두 파일에서 `alibaba_crawl` / `Alibaba` 항목을 제거:
- `src/pages/SourceableAgent.tsx` — `SourceKey`, `ALL_SOURCES`, `SOURCE_LABEL`
- `src/components/product/ProductTable.tsx` — `SOURCE_MAP`

### 3.4 백업 테이블 삭제 (롤백 검증 후 안전하게)
```sql
DROP TABLE IF EXISTS public.sourceable_products_mock_backup;
DROP TABLE IF EXISTS public.trend_sourceable_matches_mock_backup;
```

> ⚠️ **검증 전에는 절대 백업 테이블을 지우지 말 것.** 한 번 지우면 mock 데이터는 복원 불가.

### 3.5 2차 migration (카테고리·MOQ) 만 롤백
1차 migration 은 그대로 두고 필터 보강만 되돌리고 싶을 때:
```sql
BEGIN;
ALTER TABLE public.sourceable_products
  DROP COLUMN IF EXISTS moq_value,
  DROP COLUMN IF EXISTS moq_unit;
-- 키워드 backfill 했던 카테고리도 되돌리려면:
UPDATE public.sourceable_products
SET category = NULL
WHERE source = 'alibaba_crawl';
COMMIT;
```
그 뒤 edge function 의 `extractCategoryFromTitle`, `sourceableRows` 의 `category` / `moq_value` / `moq_unit` 매핑과 `SourceableAgent.tsx` 의 `moqMin` / `moqMax` 상태·UI 만 제거해 재배포.

---

## 4. 검증 쿼리 (Sanity check)

### 4.1 마이그레이션 직후
```sql
-- mock 백업이 살아있는지
SELECT COUNT(*) FROM public.sourceable_products_mock_backup;          -- > 0 이어야 함
SELECT COUNT(*) FROM public.trend_sourceable_matches_mock_backup;     -- > 0 이어야 함

-- 알리바바 row 가 들어왔는지
SELECT source, COUNT(*)
FROM public.sourceable_products
GROUP BY source;
-- 기대값: alibaba_crawl 만 보임 (혹은 마이그레이션 후 CSV 업로드가 있다면 csv_upload 도)

-- alibaba_product_id 가 모든 alibaba_crawl row 에 채워졌는지
SELECT COUNT(*) FROM public.sourceable_products
WHERE source = 'alibaba_crawl' AND alibaba_product_id IS NULL;
-- 기대값: 0
```

### 4.2 재크롤 후 동기화 확인
```sql
-- 두 테이블의 (factory_id, alibaba_product_id) 갯수가 일치하는지
SELECT
  (SELECT COUNT(*) FROM public.factory_alibaba_products) AS fap_count,
  (SELECT COUNT(*) FROM public.sourceable_products WHERE source = 'alibaba_crawl') AS sp_count;
-- fap_count == sp_count 이어야 함

-- 카테고리 backfill 효과: 매칭률 확인 (NULL 비율이 50% 이하면 양호)
SELECT
  COUNT(*) FILTER (WHERE category IS NOT NULL) AS categorized,
  COUNT(*) FILTER (WHERE category IS NULL)     AS uncategorized,
  COUNT(*)                                     AS total
FROM public.sourceable_products
WHERE source = 'alibaba_crawl';

-- MOQ backfill: alibaba_crawl row 중 moq_value 채워진 비율
SELECT
  COUNT(*) FILTER (WHERE moq_value IS NOT NULL) AS with_moq,
  COUNT(*)                                      AS total
FROM public.sourceable_products
WHERE source = 'alibaba_crawl';
```

### 4.3 롤백 후
```sql
SELECT source, COUNT(*) FROM public.sourceable_products GROUP BY source;
-- 기대값: 마이그레이션 이전과 동일한 분포 (agent_auto / csv_upload / seed)
```

---

## 5. 데이터 매핑 표

| `factory_alibaba_products` | `sourceable_products` | 비고 |
|---|---|---|
| `user_id` | `user_id` | 1:1 |
| `factory_id` | `factory_id` | 1:1 |
| `alibaba_product_id` | `alibaba_product_id` | 1:1 (신규 컬럼) |
| `title` | `item_name` | |
| `main_image_url` | `image_url` | |
| `alibaba_url` | `source_url` | |
| `price_min` | `unit_price` | raw 가격 |
| `price_min` (currency='USD'일 때) | `unit_price_usd` | 그 외 NULL |
| `price_min` (currency='CNY'일 때) | `unit_price_cny` | 그 외 NULL |
| `currency` | `currency` | USD/CNY/EUR |
| — | `source` | 항상 `'alibaba_crawl'` (고정) |
| — | `status` | 항상 `'active'` (신규 row) |
| — | `vendor_name` | `factories.name` 으로 채움 |
| `scraped_at` | `created_at` | 초기 backfill 시 |
| `updated_at` | `updated_at` | |
| `moq_value` | `moq_value` | 2차 migration 으로 추가 |
| `moq_unit` | `moq_unit` | 2차 migration 으로 추가 |
| (title 키워드 추출) | `category` | `extractCategoryFromTitle(title)` 결과 — Dress / Top / Set / Pants / Shirt / Skirt / Jacket / Coat / Hoodie / Sweater / Cardigan / Suit / Swimwear / Lingerie / Jumpsuit 중 첫 일치, 없으면 NULL |

---

## 6. 알려진 한계

1. **EUR 가격은 USD/CNY 둘 다 NULL** → ProductTable의 USD 환산 표시 안됨. 필요 시 환율 적용한 컬럼 추가.
2. **mock 데이터의 이미지 임베딩**(`embedding`) 은 백업되지만 알리바바 row 들은 INSERT 트리거(`trg_autofill_sourceable_embedding`)가 비동기로 채움. 첫 크롤 직후엔 트렌드 매칭 풀에서 누락될 수 있음.
3. **MOQ / 가격 범위**(price_max, moq_value, moq_unit)는 `sourceable_products` 쪽엔 매핑 안됨. 원본 정보는 `factory_alibaba_products.raw_data` JSONB 또는 `moq_text` 에 남아있음. 필요해지면 컬럼 추가.

---

## 7. 참고 링크
- 최초 알리바바 통합 migration: `supabase/migrations/20260514090000_factory_alibaba_products.sql`
- Crawl edge function: `supabase/functions/crawl-alibaba-products/index.ts`
- 일괄 크롤 버튼: `src/components/factory/BulkAlibabaCrawlButton.tsx`
- 알리바바 설정 페이지: `src/pages/AlibabaSettings.tsx`
