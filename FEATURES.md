# Factory Finder × FashionGo — 기능 & 기술 스택 명세서

> **Version**: `v1.1.0`
> **Last Updated**: 2026-04-29
> **Maintainer**: yun hye ryeon (hyeryeon.yun@nhn-commerce.com)

---

## 📌 버전 관리 규칙 (Versioning Policy)

이 문서는 [Semantic Versioning](https://semver.org/lang/ko/)을 따른다.

| 변경 유형 | 버전 변화 | 예시 |
|---|---|---|
| **MAJOR** (`X.0.0`) | 기능 카테고리 자체 추가/삭제, 아키텍처 변경 | 새로운 모듈(예: 결제) 추가 |
| **MINOR** (`x.Y.0`) | 기존 카테고리 안에 페이지/기능 추가 | 트렌드 카테고리에 새 패널 추가 |
| **PATCH** (`x.y.Z`) | 라이브러리 버전 갱신, 오탈자, 설명 보완 | recharts 버전 업데이트 |

> 문서 갱신 시 반드시 **상단 Version**과 하단 **Changelog**를 함께 수정할 것.

---

## 🏷️ 상태 표기 (Status Legend)

| 표기 | 의미 |
|---|---|
| ✅ | **구현됨** — 메뉴 노출 + 라우팅 + 페이지 모두 완료 |
| 🔗 | **구현됨 (서브 페이지)** — GNB에는 없지만 라우팅·페이지 존재 |
| 🚧 | **진행 중** — 페이지 파일은 있으나 라우팅 미연결 또는 부분 구현 |
| ⬜ | **구현 예정** — 코드 없음, 기획만 존재 |

---

## 🌐 프로젝트 개요

- **레포**: `factory-finder-fashiongo`
- **라이브 URL**: https://factory-finder-fashiongo.lovable.app/
- **개발 방식**: 3인 협업 (Lovable + Claude Code + GitHub 동기화)
- **한 줄 설명**: 패션 소싱 공장 발굴 → AI 스코어링 → 트렌드 분석 → 상품 매칭 → FashionGo 등록 → 학습/개선 루프를 하나로 묶은 운영 플랫폼
- **GNB 구조 출처**: `src/components/AppLayout.tsx` (`NAV_ITEMS`)
- **라우팅 출처**: `src/App.tsx`

---

## 🧱 공통 기반 스택 (Foundation)

| 영역 | 기술 |
|---|---|
| Frontend Build | Vite 5, `@vitejs/plugin-react-swc` |
| Language | TypeScript 5 |
| Framework | React 18 |
| UI Kit | shadcn-ui (Radix UI 30+ 프리미티브) |
| Styling | Tailwind CSS 3, `tailwindcss-animate`, `class-variance-authority`, `tailwind-merge` |
| Routing | `react-router-dom` v6 (`ProtectedRoute` / `AuthRoute` 가드) |
| Server State | `@tanstack/react-query` v5 |
| Auth & DB | Supabase (`@supabase/supabase-js`) |
| Form & Validation | `react-hook-form` + `@hookform/resolvers` + `zod` |
| Notification | `sonner` + shadcn Toaster |
| i18n | 자체 `LanguageContext` |
| Animation | `framer-motion` |
| Icons | `lucide-react` |
| Test | `vitest` + `@testing-library/react` + `jsdom` |
| Build Tagger | `lovable-tagger` |

---

## 🗺️ 메뉴 & 라우팅 맵 (한눈에 보기)

| 상태 | GNB 메뉴 | 서브 메뉴 | Path | 페이지 파일 |
|---|---|---|---|---|
| ✅ | 대시보드 | — | `/` | `pages/Dashboard.tsx` |
| ✅ | 진척도 | — | `/progress` | `pages/ProgressE2ERoadmap.tsx` |
| 🔗 | 진척도 | (서브) 멤버별 | `/progress/by-member` | `pages/ProgressPeople.tsx` |
| 🔗 | 진척도 | (서브) 프로젝트별 | `/progress/projects` | `pages/Progress.tsx` |
| ✅ | 소싱 | 공장 추가 | `/factories/new` | `pages/AddFactory.tsx` |
| ✅ | 소싱 | 공장 목록 | `/factories` | `pages/FactoryList.tsx` |
| ✅ | 소싱 | 공장 순위 | `/factories/ranking` | `pages/FactoryRanking.tsx` |
| ✅ | 소싱 | 스코어링 설정 | `/scoring` | `pages/ScoringSettings.tsx` |
| 🔗 | 소싱 | (서브) 공장 상세 | `/factories/:id` | `pages/FactoryDetail.tsx` |
| 🔗 | 소싱 | (서브) 대량 등록 | `/factories/bulk-import` | `pages/BulkImport.tsx` |
| 🚧 | 소싱 | 공장 비교 | *(라우팅 미연결)* | `pages/CompareFactories.tsx` |
| ✅ | 상품 목록 | 타겟상품 | `/products/target-fg` | `pages/SourcingTargetFG.tsx` |
| ✅ | 상품 목록 | 소싱가능상품 | `/products/sourceable-agent` | `pages/SourceableAgent.tsx` |
| 🔗 | 상품 목록 | (서브) 상품 전체 | `/products` | `pages/ProductList.tsx` |
| 🔗 | 상품 목록 | (서브) SNS/타 사이트 타깃 | `/products/target-other` | `pages/SourcingTargetOther.tsx` |
| 🔗 | 상품 목록 | (서브) CSV 업로드 상품 | `/products/sourceable-csv` | `pages/SourceableCSV.tsx` |
| ✅ | 상품 탐색 | 트렌드 상품 탐색 | `/trend` | `pages/TrendRecommendation.tsx` |
| ✅ | 상품 탐색 | AI 상품 탐색 | `/ai-search` | `pages/AIFactorySearch.tsx` |
| ✅ | FASHIONGO | Angel 's vendor | `/ai-vendors` | `pages/AIVendors.tsx` |
| ✅ | FASHIONGO | Setting | `/settings/pricing` | `pages/PricingSettings.tsx` |
| ✅ | FASHIONGO | Alibaba | `/settings/alibaba` | `pages/AlibabaSettings.tsx` |
| 🔗 | FASHIONGO | (서브) Vendor 상세 | `/ai-vendors/:id` | `pages/AIVendorDetail.tsx` |
| 🔗 | FASHIONGO | (서브) Vendor 상품 | `/ai-vendors/:id/products` | `pages/AIVendorProducts.tsx` |
| ✅ | 마스터 전용 | AI 학습 관리 | `/admin/ai-training` | `pages/AILearning.tsx` |
| ✅ | 마스터 전용 | AI Tool 연결 | `/admin/ai-tools` | `pages/AIToolSettings.tsx` |
| ✅ | 마스터 전용 | 계정 관리 | `/admin/accounts` | `pages/AccountManagement.tsx` |
| 🔗 | (인증) | 로그인/회원가입 | `/auth` | `pages/Auth.tsx` |
| 🔗 | (인증) | 비밀번호 재설정 | `/reset-password` | `pages/ResetPassword.tsx` |
| 🔗 | (시스템) | 404 | `/*` | `pages/NotFound.tsx` |

> **리다이렉트 라우트**: `/progress/e2e-roadmap` → `/progress`, `/progress/people` → `/progress/by-member`

---

## 🧩 기능별 구현 상세 & 사용 기술

### 1. 인증 & 계정 관리

| 항목 | 상태 | Path | 비고 |
|---|---|---|---|
| 로그인/회원가입 | ✅ | `/auth` | `AuthRoute` 가드 |
| 비밀번호 재설정 | ✅ | `/reset-password` | — |
| 계정/역할 관리 | ✅ | `/admin/accounts` | 마스터 전용, `useIsAdmin` |

**사용 기술**: Supabase Auth(이메일/비번, magic link), `AuthContext`, react-hook-form + zod

### 2. 대시보드

| 항목 | 상태 | Path |
|---|---|---|
| 메인 대시보드 | ✅ | `/` |

**컴포넌트**: `VendorKPIBar`
**사용 기술**: react-query 기반 KPI 집계, recharts 시각화

### 3. 진척도 (Progress Tracker)

| 항목 | 상태 | Path |
|---|---|---|
| E2E 로드맵 | ✅ | `/progress` |
| 멤버별 진척도 | 🔗 | `/progress/by-member` |
| 프로젝트별 진척도 | 🔗 | `/progress/projects` |

**컴포넌트**: `progress/assignee.tsx`
**사용 기술**: `@dnd-kit/core` / `sortable` / `utilities` (DnD), framer-motion

### 4. 소싱 — 공장 관리

| 항목 | 상태 | Path |
|---|---|---|
| 공장 추가 | ✅ | `/factories/new` |
| 공장 목록 | ✅ | `/factories` |
| 공장 순위 | ✅ | `/factories/ranking` |
| 스코어링 설정 | ✅ | `/scoring` |
| 공장 상세 | 🔗 | `/factories/:id` |
| 대량 등록 | 🔗 | `/factories/bulk-import` |
| **공장 비교** | 🚧 | *(라우팅 미연결)* — `pages/CompareFactories.tsx`만 존재 |

**컴포넌트**: `BulkFactoryUpload`, `CrawlProgressWidget`, `RecentFactoryActivityWidget`, `FactoryLogTimeline`, `AIPhase1ScoreCard`, `RawCrawlDataCard`, `ModelImprovementCard`, `AIPhase1FormulaCard`
**훅**: `useAIMatching`, `useFactoryLogs`
**Edge Functions**: `scrape-factory`, `factory-crawl-result`, `sync-factory-external`, `sync-factory-platform`, `auto-score-factory`, `match-trend-factories`
**유틸**: `factoryCsvParser.ts`, `seedFactories.ts`, `syncFactory.ts`
**사용 기술**: Supabase Edge Functions(Deno), `xlsx`, `file-saver`, Supabase Realtime

### 5. 상품 목록 (소싱 타깃 / 소싱 가능)

| 항목 | 상태 | Path |
|---|---|---|
| 타겟상품 (FashionGo) | ✅ | `/products/target-fg` |
| 소싱가능상품 (Agent) | ✅ | `/products/sourceable-agent` |
| 상품 전체 | 🔗 | `/products` |
| SNS/타 사이트 타깃 | 🔗 | `/products/target-other` |
| CSV 업로드 상품 | 🔗 | `/products/sourceable-csv` |

**컴포넌트**: `ProductTable`, `CSVUploadDialog`, `ProductConfirmCard`, `ProductLogTimeline`, `FGRegistrationSheet`
**훅**: `useBuyerSignalTracker`, `use-fg-registered-products`, `use-fashiongo-queue`
**Edge Functions**: `aggregate-buyer-demand`, `collect-fg-buyer-signals`, `match-trend-to-products`, `match-keyword-to-products`
**사용 기술**: xlsx, file-saver, `exportFailedProduct.ts`

### 6. 상품 탐색 — 트렌드

| 항목 | 상태 | Path |
|---|---|---|
| 트렌드 상품 탐색 | ✅ | `/trend` |

**메인 컴포넌트**: `TrendDashboard`, `TrendClusterView`, `TrendMomentum`, `TrendScoreCard`, `HotKeywordWall`, `TopTrendSources`, `RegistrationBar`, `ProductCard`, `ProductRecommendations`, `ChannelLogos`, `CollectionSettingsPanel`
**탭**: `ImageTrendTab`, `KeywordRecommendationTab`, `TrendReportTab`, `ScoringSettingsTab`
**리포트 패널**: `CategoryTrendPanel`, `ColorTrendPanel`, `KeywordTrendPanel`, `ItemRankingPanel`, `PlatformComparePanel`, `ReportSummaryCards`
**훅**: `useHotKeywords`, `useTopTrendSources`, `useTrendImage`, `useTrendKeywordStats`, `useTrendReport`, `useSnsTrendFeed`, `use-instagram-trends`, `useStyleTaxonomy`
**State**: `TrendContext`
**수집 Edge Functions**: `collect-amazon-image-trends`, `collect-google-image-trends`, `collect-pinterest-image-trends`, `collect-shein-trends`, `collect-magazine-trends`, `collect-sns-trends`, `fetch-instagram-trends`, `scrape-fashiongo-trends`
**분석 Edge Functions**: `analyze-trend`, `analyze-trend-keywords`, `cluster-trends`, `recommend-keywords`, `update-trend-backprop`, `scheduled-trend-analysis`, `scheduled-trend-collector`
**시각화**: recharts, embla-carousel-react

### 7. 상품 탐색 — AI 상품 탐색

| 항목 | 상태 | Path |
|---|---|---|
| AI 이미지/텍스트 검색 | ✅ | `/ai-search` |

**서비스**: `imageMatchingService.ts`, `ogImage.ts`
**타입**: `types/matching.ts`
**Edge Functions**: `ai-image-search`, `ai-image-similarity`, `ai-product-search`, `analyze-product-image`, `search-product-images`, `generate-embedding`, `batch-generate-image-embeddings`
**사용 기술**: pgvector 기반 임베딩 매칭

### 8. FASHIONGO — Vendor / 가격 / Alibaba

| 항목 | 상태 | Path |
|---|---|---|
| Angel's Vendor 목록 | ✅ | `/ai-vendors` |
| Setting (가격 변환) | ✅ | `/settings/pricing` |
| Alibaba 연결 관리 | ✅ | `/settings/alibaba` |
| Vendor 상세 | 🔗 | `/ai-vendors/:id` |
| Vendor 상품 | 🔗 | `/ai-vendors/:id/products` |

**가격 컴포넌트**: `AIVendorManagementSection`, `ProductDefaultsSection`, `VendorPolicySection`
**Vendor 모델**: `VendorModelSettingsDialog` + `generate-vendor-model` Edge Function
**Alibaba UI**: `ConnectionList`, `ConnectionCard`, `AddConnectionButton`, `DisconnectConfirmDialog`, `ExpiredConnectionBanner`, `SyncStatusIndicator`, `ProductDataTable`, `OrderDataTable`, `InventoryDataTable`
**Alibaba Edge Functions**: `alibaba-oauth-start`, `alibaba-oauth-callback`, `alibaba-refresh-token`, `alibaba-sync-data`, `alibaba-disconnect`
**클라이언트**: `integrations/alibaba/client.ts` + 훅 6개
**VA-API 연동**: `integrations/va-api/` (categories, attributes, products, vendor-config)
**FG 큐/설정**: `use-fashiongo-queue`, `use-fg-settings`
**테스트**: Alibaba 클라이언트/타입/연결 상태 단위 테스트

### 9. 마스터 전용 — AI 학습 관리

| 항목 | 상태 | Path |
|---|---|---|
| AI 학습 관리 | ✅ | `/admin/ai-training` |

**컴포넌트**: `ActiveModelSection`, `CorrectionStatsSection`, `ErrorTrendChart`, `FewShotStatusSection`, `FineTuningSection`, `ModelHistorySection`, `ModelVersionDetailDialog`, `RunningJobSection`, `TrainingDataStatus`, `TrainingDetailReport`
**Edge Functions**: `trigger-finetuning`, `poll-training-job`, `batch-pipeline`, `test-vertex-ai`
**사용 기술**: Vertex AI / Gemini fine-tuning, training snapshot 마이그레이션, recharts
**참고 문서**: `docs/plans/ai-learning-system-implementation.md`

### 10. 마스터 전용 — AI Tool 설정

| 항목 | 상태 | Path |
|---|---|---|
| AI Tool 연결 | ✅ | `/admin/ai-tools` |

**Edge Function**: `ai-tool-registry`
**유틸**: `runtimeMode.ts`
**사용 기술**: AI Provider 라우팅 테이블 (Gemini, Vertex AI, fal.ai 등)

### 11. 전역 AI Agent (이미지/모델 변환)

> 단일 라우트가 아닌, 모든 보호된 페이지의 `AppLayout` 안에서 노출되는 글로벌 모듈.

**컴포넌트**: `AIAgentBar`, `AIModelImageDialog`, `FactorySyncDialog`, `FGDataConvertDialog`, `ImageConvertDialog`
**Edge Functions**: `convert-product-image`, `generate-model-image`, `generate-sourcing-report`, `scrape-vendor-products`
**유틸**: `imageStorage.ts`, `trendImageUtils.ts`
**사용 기술**: Supabase Storage

---

## 🚧 진행 중 / 구현 예정 (Backlog)

| 상태 | 항목 | 설명 / 메모 |
|---|---|---|
| 🚧 | **공장 비교** (`CompareFactories.tsx`) | 페이지 파일은 존재하나 `App.tsx` 라우팅 미연결 — 추후 `/factories/compare` 등으로 연결 필요 |
| 🚧 | **`Index.tsx`** | Lovable 기본 생성 파일 추정, 라우팅 미사용 — 정리 또는 삭제 검토 |
| ⬜ | (추후 추가) | — |

---

## 🗄️ 백엔드 인프라

| 항목 | 규모 / 기술 |
|---|---|
| **Postgres 마이그레이션** | 82개 (`supabase/migrations/`) — 스키마, RLS, 인덱스, 시드 |
| **Edge Functions (Deno)** | 약 50개 — 수집 8 / 분석·매칭 10 / Alibaba 5 / AI·임베딩 10 / 운영 6 / 스케줄러 2 / 기타 |
| **Storage** | Supabase Storage (제품/모델/트렌드 이미지) |
| **Realtime** | Supabase Realtime (공장 크롤링 진행도, 등록 큐) |
| **Vector DB** | pgvector (이미지/상품 임베딩) |
| **Scheduler** | `scheduled-trend-analysis`, `scheduled-trend-collector` (pg_cron 추정) |

---

## 📚 부수적으로 사용한 라이브러리

| 라이브러리 | 용도 |
|---|---|
| `date-fns`, `react-day-picker` | 날짜 처리 |
| `react-resizable-panels`, `vaul` | 패널/드로어 |
| `input-otp` | OTP 입력 |
| `cmdk` | 커맨드 팔레트 |
| `next-themes` | 테마 |
| `embla-carousel-react` | 캐러셀 |

---

## 📝 Changelog

### v1.1.0 — 2026-04-29
- **추가**: 메뉴 & 라우팅 맵 (한눈에 보기) 표 — GNB / Path / 페이지 파일 매핑
- **추가**: 상태 표기 시스템(✅/🔗/🚧/⬜) — 구현됨·서브·진행중·예정 구분
- **추가**: 진행 중 / 구현 예정 (Backlog) 섹션
- **반영**: `CompareFactories.tsx` 라우팅 미연결 상태(🚧) 명시
- **반영**: `Index.tsx` 미사용 추정 항목 추가
- **반영**: `/progress/by-member`, `/progress/projects`, `/products`, `/products/target-other`, `/products/sourceable-csv`, `/factories/:id`, `/factories/bulk-import`, `/ai-vendors/:id`, `/ai-vendors/:id/products` 등 서브 라우트 누락분 보완
- **반영**: 리다이렉트 라우트(`/progress/e2e-roadmap`, `/progress/people`) 명시

### v1.0.0 — 2026-04-29
- 초기 문서 작성
- 11개 기능 카테고리 정리
- Foundation 스택, 백엔드 인프라(Edge Functions 50+, Migrations 82개), 부수 라이브러리 정리

---

> 📌 **다음 업데이트 가이드**
> 1. 변경 내용을 해당 카테고리에 반영
> 2. 메뉴 & 라우팅 맵 표 갱신 (상태 ✅/🔗/🚧/⬜ 조정)
> 3. 상단 `Version` 갱신 (MAJOR/MINOR/PATCH 규칙 준수)
> 4. `Last Updated` 날짜 갱신
> 5. **Changelog**에 새 버전 항목 추가 (변경 사항 bullet)
