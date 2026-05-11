# Stage 3 매칭 자동화 — 「실행하기」 버튼 구현 계획

## 1. 스키마 진단 결과

현재 DB 상태:
- `matches` 존재하나 컬럼이 다름 (`target_id`, `product_id`, `factory_id`, `total_score`, `breakdown` — `product_id`는 `sourceable_products`를 가리킴)
- `target_products` 존재 (active 필터 사용 가능)
- `sourcing_products` **없음** → 신규 생성 필요
- `e2e_stage_runs` **없음** → 신규 생성 필요
- `factories.stock_score`, `oem_score`, `score_status` 모두 존재 → 필터 가능

기존 `matches`는 `sourceable_products` 기반이라 충돌. 새 매칭은 `sourcing_products` 기반이므로 컬럼을 추가(`sourcing_product_id`, `run_id`)하여 한 테이블에서 양립시킨다 (기존 데이터 유지).

## 2. 마이그레이션 (idempotent)

```sql
-- sourcing_products
CREATE TABLE IF NOT EXISTS public.sourcing_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factory_id uuid NOT NULL REFERENCES public.factories(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  title text,
  image_url text,
  tags text[] DEFAULT '{}',
  category text,
  price_cny numeric,
  price_usd_est numeric,
  is_new boolean DEFAULT false,
  is_best boolean DEFAULT false,
  rank_in_factory int,
  source_platform text,
  fetched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(factory_id, external_id)
);
ALTER TABLE public.sourcing_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read sourcing_products" ON public.sourcing_products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service manages sourcing_products" ON public.sourcing_products
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- e2e_stage_runs
CREATE TABLE IF NOT EXISTS public.e2e_stage_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_no smallint NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  summary jsonb DEFAULT '{}',
  triggered_by uuid
);
ALTER TABLE public.e2e_stage_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read e2e_stage_runs" ON public.e2e_stage_runs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert e2e_stage_runs" ON public.e2e_stage_runs
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service manages e2e_stage_runs" ON public.e2e_stage_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- matches: extend
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS sourcing_product_id uuid REFERENCES public.sourcing_products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES public.e2e_stage_runs(run_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_product_id uuid,
  ADD COLUMN IF NOT EXISTS score numeric,
  ADD COLUMN IF NOT EXISTS score_breakdown jsonb;
CREATE INDEX IF NOT EXISTS idx_matches_run ON public.matches(run_id);
CREATE INDEX IF NOT EXISTS idx_matches_target_product ON public.matches(target_product_id);
```

## 3. Edge Function `run-matching`

`supabase/functions/run-matching/index.ts`. Service-role client. 흐름:

1. 인증된 user 식별 → run row INSERT (stage_no=3, status=running)
2. 임계값 파라미터: `factory_threshold` (default 60), `score_threshold` (default 0.60)
3. 통과 공장: `factories WHERE GREATEST(stock_score, oem_score) >= factory_threshold AND score_status='ai_scored' AND deleted_at IS NULL`
4. 통과 공장 ids로 `sourcing_products` 로드
5. `target_products WHERE status='active'` 로드
6. 메모리 내 카르테시안 계산:
   - **keyword**: jaccard(target.trend_keywords, sourcing.tags)
   - **category**: 동일/부모-자식/형제/무관 (간이 매핑 — 동일 1.0, 다르면 0)
   - **price_fit**: target.price_min_usd~price_max_usd 범위 vs sourcing.price_usd_est (없으면 cny*0.14*1.5)
   - **image_sim**: 0 (임베딩 미보유 시 가중치 재분배: 0.15를 keyword/category/price/best 비례 분배)
   - **best_weight**: is_best=1.0, is_new=0.7, else 0
7. score >= threshold만 보존, target별 top 5
8. `matches` INSERT (run_id 포함)
9. summary 계산 후 e2e_stage_runs UPDATE (status=completed, finished_at, summary)
10. 빈 데이터 가드: targets=0 / sourcing_pool=0 / passing_factories=0 / pairs=0 → 각각 status=completed + summary에 reason 기록 (실패 아님, UI가 안내 모달 표시)

응답:
```json
{ "run_id": "...", "summary": { "targets": N, "sourcing": N, "passing_factories": N, "pairs": N, "avg_score": 0.7, "threshold_factory": 60, "threshold_match": 0.6, "reason": "ok|no_targets|no_sourcing|no_factories|no_matches" } }
```

## 4. 「실행하기」 버튼 + 결과 모달

`src/components/dashboard/AngelAgentPanel.tsx`의 Stage 3 카드에 「실행하기」 버튼:
- 클릭 → `toast("매칭 실행 중...")` → `supabase.functions.invoke('run-matching', { body: { factory_threshold: 60, score_threshold: 0.6 } })`
- 응답 후 `MatchingResultDialog` 자동 오픈 (run_id 전달)

새 컴포넌트 `src/components/matching/MatchingResultDialog.tsx`:
- `summary.reason`별 분기:
  - `no_targets` → "타겟 상품을 윤 담당자가 채우는 중입니다." + Stage 2 이동 버튼
  - `no_factories` / `no_sourcing` → "Alibaba API 연결 대기 중. 점수 통과 공장: X개."
  - `no_matches` → "임계값 0.60 이상 매칭 없음." + Slider(0.3~0.8) → 슬라이더 변경 시 재실행
  - `ok` → 요약 카드 4개 + target별 가로 행
- 각 target 행: 썸네일·제목·가격 → sourcing top 5 가로 카드 (이미지·USD가·공장 배지·점수·외부 링크)
- 푸터: [전체 매칭 페이지 →] (`/matches/runs/{run_id}`) [닫기]

## 5. 활동 로그

`AngelAgentPanel`(또는 `DashboardActivity`) 하단에 e2e_stage_runs 최근 10건:
- `useQuery` → `select * from e2e_stage_runs order by started_at desc limit 10`
- 한 줄: `시각 · Stage N · status 배지 · summary.pairs쌍 · run_id 클릭 시 결과 페이지 이동`

## 6. `/matches/runs/:run_id` 페이지

`src/pages/MatchingRunDetail.tsx` 신설, App.tsx 라우터 등록:
- run row + matches(run_id=:id) 조인 표시
- 모달과 동일한 target→sourcing top5 레이아웃을 페이지 형태로
- 필터: 카테고리, 점수 범위

## 기술 노트

- 매칭 산식은 Edge Function 내 TypeScript로 구현 (DB 함수 X — 가중치 재분배 로직 가시성 위해)
- 카테고리 트리 매핑은 v1에서 단순화 (동일=1.0, 다르면 0). 추후 보강.
- image_sim은 v1에서 0 고정. 가중치 0.15는 keyword/category/price/best의 합(0.85)에 비례 재분배.
- `target_products`의 `trend_keywords`(text[]), `category`, `price_min_usd`, `price_max_usd` 컬럼 사용
- `sourcing_products`가 비어있어도(현 상황) 함수는 정상 종료, summary.reason='no_sourcing'

## 작업 순서

1. 마이그레이션 (사용자 승인 대기)
2. Edge Function `run-matching` 작성·배포
3. `MatchingResultDialog` 컴포넌트
4. `AngelAgentPanel` Stage 3에 버튼 + 모달 연결
5. 활동 로그 위젯 (e2e_stage_runs)
6. `/matches/runs/:run_id` 페이지 + 라우트 등록
