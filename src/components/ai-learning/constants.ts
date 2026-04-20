// Fine-tuning 목표 학습 건수 (정답 + 교정)
export const FINE_TUNING_GOAL = 20;

// 1건당 예상 비용 (USD) — gemini-2.5-flash 40 epoch 기준
export const COST_PER_SAMPLE_USD = 0.008;

// 학습 시간 추정 기본값 (분) — 실제 메트릭 수신 전까지 fallback
export const DEFAULT_TRAINING_ESTIMATE_MINUTES = 60;

// 학습 모델 기본값 (activeModel이 없을 때 표시)
export const DEFAULT_BASE_MODEL = 'gemini-2.5-flash';

// 교정 평균 차이 상태 임계값 (절대값 기준)
export const CORRECTION_THRESHOLDS = {
  NEEDS_IMPROVEMENT: 2.0, // >= 2.0 → 개선 필요
  UNDER_OBSERVATION: 1.5, // >= 1.5 → 관찰 중 (미만은 양호)
} as const;

export type CorrectionStatus = '개선 필요' | '관찰 중' | '양호';

export const getCorrectionStatus = (absDiff: number): CorrectionStatus => {
  if (absDiff >= CORRECTION_THRESHOLDS.NEEDS_IMPROVEMENT) return '개선 필요';
  if (absDiff >= CORRECTION_THRESHOLDS.UNDER_OBSERVATION) return '관찰 중';
  return '양호';
};
