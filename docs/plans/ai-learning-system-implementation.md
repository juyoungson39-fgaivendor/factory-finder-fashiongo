# AI Learning System Implementation Plan

## Branch: `feature/ai-learning-system`
## Base: `develop`
## Date: 2026-03-22
## Spec Reference: Dooray FGAngels/#28 (v5.2 기능명세 + 가이드라인)

---

## Overview

FactoryDetail 스코어링 탭에서 AI 학습 데이터를 수집하고, Vertex AI Fine-tuning 파이프라인을 연결하는 기능 구현.

### 학습 데이터 3가지 유형
| Type | Collection Method | Learning Purpose |
|------|------------------|-----------------|
| Correction | AI 점수 수정 + 수정 사유 입력 | AI가 틀린 패턴 학습 |
| Confirmed | [✓ AI 점수 확인] 버튼 클릭 | AI가 맞춘 패턴 강화 |
| Deleted | 공장 소프트 삭제 + 사유 선택 | 소싱 부적합 패턴 학습 |

---

## Tasks

### Task 1. updateScore 확장 — ai_original_score 보존 ✅
- **File**: `src/pages/FactoryDetail.tsx` (updateScore mutationFn)
- **Changes**:
  - upsert 전 기존 레코드 조회
  - `ai_original_score` 보존: `existing.ai_original_score ?? existing.score ?? score` (최초 1회)
  - `correction_reason` 저장: AI 원본과 다를 때만, 같으면 null
  - mutationFn 파라미터에 `correctionReason?: string` 추가

### Task 2. 스코어링 탭 UI — 뱃지 + AI 마커 + 수정 사유 ✅
- **File**: `src/pages/FactoryDetail.tsx` (scoring TabsContent)
- **Changes**:
  - `getScoreStatus()` 함수: 4상태 (no-ai/modified/confirmed/pending)
  - 기준 카드에 상태 뱃지 표시
  - `AI N → M /10` 비교 표시
  - 슬라이더 위 `▼ AI: N` 마커 (고정 위치)
  - 관리자만 슬라이더 수정 가능 (`useIsAdmin`)
  - 수정 시 `⚠ AI 점수(N)에서 수정됨` 경고
  - 수정 사유 textarea (필수 5자+)
  - '학습 데이터로 수집' 버튼 → scoring_corrections 저장

### Task 3. 헤더 영역 UI — 확인 버튼 + 학습 상태 ✅
- **File**: `src/pages/FactoryDetail.tsx` (Header section)
- **Changes**:
  - `AI 점수 → 적용 점수` 비교 (예: 85 → 62)
  - `✏ 수정됨 — N개 항목 변경` 뱃지
  - `[✓ AI 점수 확인]` 버튼 (score_confirmed = false 일 때)
  - `✓ 확인됨` 뱃지 (score_confirmed = true 일 때)
  - `confirmScore` mutation 추가

### Task 4. 소프트 삭제 전환 + 삭제 사유 ✅
- **Files**: `src/pages/FactoryDetail.tsx`, `FactoryList.tsx`, `CompareFactories.tsx`, `FashionGoPage.tsx`
- **Changes**:
  - Hard DELETE → soft delete (deleted_at + deleted_reason UPDATE)
  - 삭제 사유 Dialog (프리셋 5개 + 직접 입력)
  - 공장 목록 쿼리에 `.is('deleted_at', null)` 필터 추가

### Task 5. trigger-finetuning Edge Function ✅
- **New File**: `supabase/functions/trigger-finetuning/index.ts`
- **Implementation**:
  1. 학습 데이터 수집: scoring_corrections + confirmed factories + soft-deleted factories
  2. JSONL 변환 (Vertex AI supervised tuning 포맷)
  3. GCS 업로드 (`_shared/google-auth.ts` 활용)
  4. Vertex AI Fine-tuning Job 생성 (gemini-2.5-flash base)
  5. ai_training_jobs 테이블에 job 정보 insert
- **Dependencies**: `_shared/google-auth.ts` (existing)

### Task 6. 학습 Job 폴링 ✅
- **Files**: `src/components/ai-learning/RunningJobSection.tsx`, new Edge Function or extension
- **Implementation**:
  - Vertex AI Job 상태 조회 (PENDING → RUNNING → SUCCEEDED/FAILED)
  - ai_training_jobs 테이블 상태 업데이트
  - 완료 시 ai_model_versions에 새 모델 등록 (is_active = true)
  - 프론트엔드 10초 간격 폴링

### Task 7. 대시보드 액션 연결 ✅
- **Files**: `src/components/ai-learning/FineTuningSection.tsx`, `src/pages/AILearning.tsx`, router config
- **Implementation**:
  - Fine-tuning 버튼 → trigger-finetuning Edge Function 호출
  - 학습 데이터 100건 미만 시 버튼 비활성화
  - 데이터 분류 표시: 교정 N건 · 정답 N건 · 부적합 N건
  - 예상 비용/시간 안내
  - 라우트 변경: `/ai-learning` → `/admin/ai-training`

---

## Execution Order (Dependency Graph)

```
Task 1 (updateScore) ──┬──→ Task 2 (스코어링 탭 UI)
                       └──→ Task 3 (헤더 UI)
Task 4 (소프트 삭제)  ────→ 독립 (병렬 가능)
Task 5 (Edge Function) ──→ Task 6 (폴링) ──→ Task 7 (대시보드 연결)
```

## DB Schema (Already Migrated)

### factory_scores — added columns
- `ai_original_score` NUMERIC(4,1) — AI 최초 채점 점수
- `correction_reason` TEXT — 관리자 수정 사유

### factories — added columns
- `score_confirmed` BOOLEAN DEFAULT false
- `deleted_at` TIMESTAMPTZ DEFAULT null
- `deleted_reason` TEXT

### Existing tables used
- `scoring_corrections` — AI 교정 데이터 (Fine-tuning 학습용)
- `ai_model_versions` — 모델 버전 관리
- `ai_training_jobs` — Fine-tuning Job 이력
