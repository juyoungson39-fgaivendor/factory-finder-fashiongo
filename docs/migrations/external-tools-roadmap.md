# 외부 도구 필요 기능 로드맵

> 이 문서는 **현재 우리가 보유한 두 도구(Apify 스크래핑 + Alibaba OAuth API)
> 만으로는 구현 불가능한** 필터/기능을 정리하고, 각각을 가능하게 하려면
> 어떤 외부 도구를 추가해야 하는지 기록합니다.
>
> 우리 보유 도구로 가능한 것은 이미 구현됨:
>   - 무게 · 소재 · 정확한 카테고리 → `enrich-alibaba-product-details`
>     edge function (detail page 스크래핑)
>   - 가격 환율 환산 (CNY → USD) → 클라이언트 환율 적용
>
> 자세한 분석 결과: `docs/migrations/20260518-alibaba-to-sourceable-products.md`

---

## 1. 색상 감지 (Color Detection)

**현재 상태**: NULL — UI 필터 섹션 자동 hide

**왜 두 도구로 안 되나**
- Apify list page: 색상 정보 노출 안 됨 (이미지 카드만)
- Apify detail page: attribute table 에 "Color" 가 있을 때도 있으나, SKU 옵션으로 들어가는 경우가 많아서 안정적인 추출이 어려움
- OAuth Buyer API: `eco.buyer.product.search` 응답에 색상 필드 없음
- OAuth ICBU API: `alibaba.icbu.product.get` 의 `attributes[]`/`product_sku` 에 색상 있으나 — 셀러 본인 OAuth 필요 (우리는 외부 공장 스카우팅이라 적용 불가)

**필요한 외부 도구**: **AI Vision API**
- 후보:
  - `gpt-4o` (OpenAI) — vision 입력 가능, $0.005~0.01/image
  - `claude-3-7-sonnet` — vision 입력 가능
  - Google Cloud Vision API — image labeling, 색상 감지 별도 endpoint
- 입력: `main_image_url` (이미 우리가 저장 중)
- 출력: 의류 주 색상 1~3개
- 저장: `sourceable_products.detected_colors TEXT[]` (이미 컬럼 존재)
- UI: 자동으로 "색상 감지" 섹션이 부활 (조건부 렌더링 가드 `distinctDetectedColors.length > 0`)
- 비용 추정: 151개 상품 × $0.005 ≈ $0.75 (한 번 backfill 기준)

**예상 작업량**: 3~5h
- 신규 edge function `vision-tag-product-image` (이미지당 vision API 호출)
- `BulkVisionTagButton` UI + 클라이언트 청크 처리
- detected_colors 결과 저장

---

## 2. 스타일 감지 (Style Detection — 캐주얼/포멀/오피스/스트릿 등)

**현재 상태**: NULL — UI 필터 섹션 자동 hide

**왜 두 도구로 안 되나**
- Apify list/detail page: "Style" attribute 가 가끔 존재하지만 자유 텍스트라 분류 정확도 낮음 (예: "Casual style", "Trendy" 등)
- OAuth Buyer API: 스타일 필드 없음
- OAuth ICBU API: `attributes` 에 있을 수 있지만 자유 텍스트 + 셀러 본인 OAuth 한계

**필요한 외부 도구**: **AI Vision API** (위와 같음)
- 의류 스타일 분류 프롬프트 예시:
  ```
  Given a fashion product image, classify it into ONE of:
  Casual / Formal / Office / Streetwear / Sportswear / Evening / Lounge / Bohemian
  ```
- 저장: `sourceable_products.detected_style TEXT`
- UI: "스타일 감지" 섹션 자동 부활

**예상 작업량**: vision 호출 공통 작업에 포함 (1.과 같이 한 vision call 로 다중 라벨 추출 가능)

---

## 3. 소재 감지 — 시각 보조 (Material Detection — Visual Hint)

**현재 상태**:
- ✅ Material **명시 텍스트** (예: "100% Cotton") 는 detail page 에서 이미 추출 중 → `material` 컬럼 + 소재 필터
- ❌ 단, attribute table 에 material 이 없는 상품은 NULL 그대로

**왜 두 도구로 안 되나 (NULL 채우기 한정)**
- 두 도구로 안 잡힌 경우는 정의 자체가 없는 것 — AI 추론 필요
- 시각만으로 cotton/polyester 구분은 본질적으로 어려움 (질감 fine detail 필요)

**필요한 외부 도구**: **AI Vision API**
- 신뢰도가 낮음을 명시한 채로 "추정 소재" 라벨 별도 컬럼에 저장 권장
- 컬럼 분리: `material` (확실, attribute 기반) vs `detected_material` (Vision 추정)
- 이미 두 컬럼이 분리되어 있음

**우선순위**: 낮음 (소재 attribute 매칭률이 충분히 높으면 후순위)

---

## 4. 색상 변형 / 사이즈 옵션 (SKU Variants)

**현재 상태**: NULL — UI 에 별도 컬럼/필터 없음

**왜 두 도구로 안 되나**
- Apify list page: SKU 옵션 미노출
- Apify detail page: SKU table 이 동적 JS 로딩되어 우리 Apify Playwright 기본 wait 으로는 안 잡힐 가능성 높음 (sometimes works)
- OAuth Buyer API: SKU 정보 없음
- OAuth ICBU API: `product_sku` 에 옵션 + 가격 + 재고 다 있음 — 셀러 본인 OAuth 필요

**필요한 외부 도구**: 없음. 두 가지 추가 옵션:
- (a) Apify detail 페이지 추가 wait + selector 강화 → 가능성 있음. 단 안정성 ↓
- (b) **별도 detail HTML 정적 분석 라이브러리** (Cheerio + 추출 로직 강화) → 큰 변화 없음
- (c) Apify "Alibaba.com Product Scraper" 같은 전용 actor → **외부 도구** 추가
  - Apify Store 에 알리바바 전용 스크래퍼 actor 존재 (예: `apify/alibaba-scraper`)
  - 비용은 일반 actor 와 비슷, SKU/이미지/속성 모두 추출됨

**예상 작업량**: 2~4h (전용 actor 사용 시), 6~8h (직접 파서 보강 시)

---

## 5. 정확한 가격 단계 (Bulk Discount Tiers)

**현재 상태**: 단일 가격 범위 (`price_min`, `price_max`) 만 저장

**왜 두 도구로 안 되나**
- Apify detail page: 가격 단계 테이블 정적 HTML 에 노출되긴 함 (e.g., "10~99 pcs: $40.90 / 100~999 pcs: $35.50") — 파싱 가능하지만 현재 구현엔 없음
- OAuth Buyer API: search 응답엔 단일 가격만
- OAuth ICBU API: `bulk_discount_prices[]` (max 20 levels) — 셀러 본인 OAuth 필요

**필요한 외부 도구**: 없음. **Apify detail page 파서 보강만 하면 가능**
- 현재 `enrich-alibaba-product-details/index.ts` 의 `extractAttributes` 를 확장
- 새 컬럼: `factory_alibaba_products.bulk_discount_prices JSONB` (예: `[{min:10, max:99, price:40.90}, ...]`)
- UI: 상품 카드 hover 시 "Tier 가격" 툴팁

**예상 작업량**: 2~3h — **외부 도구 없이 가능, 우선순위 자동 ↑**

---

## 6. EUR 가격 환산

**현재 상태**: USD/CNY 는 환율 환산되어 가격 필터 작동, EUR 은 NULL 처리되어 가격 필터 켜는 순간 제외

**왜 두 도구로 안 되나**
- 환율 정보 자체가 두 도구 영역 밖
- DB `exchange_rates` 테이블엔 `cny_to_usd_rate` 만 저장 — EUR 환율 없음

**필요한 외부 도구**: **환율 API** (or 정적 환산 상수)
- 후보:
  - `exchangerate.host` (무료, no API key)
  - Open Exchange Rates API
  - ECB 공식 환율 RSS feed
- 또는 정적 상수 (1 EUR ≈ 1.07 USD) 로 대충 처리도 가능 (정확도는 떨어짐)

**예상 작업량**: 1~2h
- DB: `exchange_rates.eur_to_usd_rate NUMERIC` 컬럼 추가
- 환율 fetch cron (예: 일 1회)
- 클라이언트 `effectiveUsd` 에 EUR 분기 추가

---

## 7. 이미지 기반 유사 상품 매칭

**현재 상태**: 기존 mock 데이터엔 `embedding vector(768)` 컬럼이 있음 (트리거 자동 생성)

**왜 두 도구로 안 되나**
- Apify / OAuth 어느 쪽도 임베딩 안 만듦
- 이미지 → 벡터 변환은 별도 모델 필요

**필요한 외부 도구**: **임베딩 모델**
- 후보:
  - OpenAI `text-embedding-3-small` (텍스트만 — 이미지엔 적합 안 함)
  - **CLIP** (open-source) — Vision encoder + text encoder, 이미지/텍스트 cross-modal
  - **Sentence Transformers ViT** — 이미지 임베딩 특화
  - Google Cloud Vertex AI multimodal embeddings
- 현재 시스템에 `match_sourceable_products` RPC 가 이미 있음 → 이걸 알리바바 row 에도 적용하려면 embedding 만 채워주면 됨

**예상 작업량**: 4~6h
- 이미지 → embedding edge function (CLIP/Vertex 호출)
- 트리거가 알리바바 row 에도 발동되도록 정리 (이미 INSERT trigger 있음)
- 트렌드 매칭 풀에 알리바바 상품 합류

---

## 📋 우선순위 정리 (실용적)

| 순위 | 작업 | 외부 도구 | 비용 (한 번 backfill) | 작업 시간 |
|---|---|---|---|---|
| ⭐ 1 | 가격 단계 (Bulk discount tiers) | **없음** (Apify 파서 보강) | 0 | 2~3h |
| ⭐ 2 | EUR 환율 환산 | 환율 API (무료 가능) | 0 | 1~2h |
| 🥇 3 | 색상 + 스타일 감지 (Vision API) | AI Vision API | ~$0.75 (151개) | 3~5h |
| 🥈 4 | SKU 변형 (옵션) | Apify 전용 actor or 파서 보강 | 약간 ↑ | 2~4h |
| 🥉 5 | 이미지 임베딩 + 유사도 매칭 | CLIP/Vertex | ~$1~2 | 4~6h |
| ⚪ 6 | 시각 추정 소재 (보조) | AI Vision API | 위 3 과 묶음 | +1h |

---

## 🛠️ 도구 도입 시 권장 순서

1. **외부 도구 없이 가능한 ①②** 부터 처리 → 즉시 가치
2. **AI Vision API (Anthropic/OpenAI 키 등록)** → ③④⑥ 한 번에 해결
3. **임베딩 모델** ⑤ — 유사 상품 추천 기능 (선택적)
4. EUR 환율은 ②와 별개로 cron 한 번 설치하면 자동 갱신

---

## 📌 의사결정 트리거

이 문서는 **두 도구의 한계** 를 명확히 하고 외부 도구 도입 시점 판단에 사용.

> 만약 사용자가 "색상으로 필터링 하고 싶다" 같은 요청이 다시 들어오면,
> 이 문서의 §1 항목을 보고 **AI Vision API 도입 단계로 넘어갈 시점**임을
> 즉시 알 수 있도록.
