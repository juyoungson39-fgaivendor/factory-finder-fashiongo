/**
 * Version simulation for presentation.
 *
 * When a non-current model version is selected in the scoring page,
 * scores are modified to simulate what the AI would have scored
 * with that older (less trained) model.
 *
 * Older versions → bigger errors. Current version → real data.
 */

// AI 과소평가 시 사유 (실제로는 더 좋음 → 긍정적 톤)
const UNDERRATE_REASONS = [
  '재고 1만개 이상 보유 중이나 AI가 1688 페이지 데이터만으로 과소평가함',
  '자체 물류센터와 배송팀 보유하나 AI가 인식하지 못함',
  'SKU 3000개 이상으로 다양성 높으나 AI가 카테고리 수만 카운트',
  'Intertek 인증 보유하나 AI가 인증 정보를 파싱하지 못함',
  'T/T 30% 선불 조건으로 비교적 유연하나 AI가 낮게 평가',
  '10년 이상 수출 경험 보유하나 AI가 1688 내수 데이터만 참고',
  '자체 디자인팀 운영으로 트렌드 반영 빠르나 AI가 감지하지 못함',
];

// AI 과대평가 시 사유 (실제로는 안 좋음 → 부정적 톤)
const OVERRATE_REASONS = [
  '실제 상품은 중국 내수 스타일 위주로 북미 시장 적합성 매우 낮음',
  '이미지 해상도 낮고 화이트 배경/모델컷 없음. AI가 이미지 수만 보고 과대평가',
  '1688에서만 운영 중이며 FashionGo 등 해외 플랫폼 경험 전무',
  '동종 업체 대비 가격이 오히려 높은 편. AI가 1688 표시가격만으로 과대평가',
  'MOQ 500장 이상으로 소량 주문 불가. AI가 "협의 가능" 문구를 과대 해석',
  '납기 지연 이력 있음. AI가 공장 규모만 보고 높게 평가',
  '중국어만 가능하며 영어 소통 불가. AI가 "해외 거래 경험" 문구를 오해',
  '반품/교환 정책이 까다롭고 7일 이내만 가능. AI가 "교환 가능" 여부만 확인',
  '패키징은 기본 비닐 포장만 가능. 브랜딩 커스텀 불가',
];

// 오차 방향 패턴 (양수: 과대평가, 음수: 과소평가)
const ERROR_DIRECTIONS = [
  -1, +1, +1, +1, -1, +1, +1, +1, +1, -1, +1, -1, +1, -1,
];

/**
 * 버전의 "위치"(0=가장 오래된, 마지막=현재)에 따라 오차 스케일을 결정.
 * @param versionIndex  이 버전의 인덱스 (0부터)
 * @param totalVersions 전체 버전 수
 * @returns errorScale 0.0(현재 버전, 오차 없음) ~ 1.0(가장 오래된 버전, 최대 오차)
 */
function getErrorScale(versionIndex: number, totalVersions: number): number {
  if (totalVersions <= 1) return 0;
  // 현재 버전(마지막)은 0, 가장 오래된 버전(첫번째)은 1
  return 1 - versionIndex / (totalVersions - 1);
}

/**
 * 선택된 버전에 맞게 scores의 ai_original_score를 시뮬레이션.
 *
 * @param realScores  실제 DB에서 가져온 scores
 * @param versionIndex  선택된 버전의 인덱스 (오래된 순, 0부터)
 * @param totalVersions 전체 버전 수
 * @returns 시뮬레이션된 scores (현재 버전이면 원본 그대로)
 */
export function simulateVersionScores(
  realScores: any[],
  versionIndex: number,
  totalVersions: number,
): any[] {
  const errorScale = getErrorScale(versionIndex, totalVersions);

  // 현재 버전이면 원본 그대로
  if (errorScale === 0) return realScores;

  const maxError = 6.0; // errorScale=1일 때 최대 오차

  // progress: 0(가장 오래된) ~ 1(현재). 실제 교정 완료 수 기준으로 비례 배분
  const progress = totalVersions <= 1 ? 1 : versionIndex / (totalVersions - 1);
  const realCorrectedCount = realScores.filter(
    s => s.ai_original_score != null && Number(s.ai_original_score) !== Number(s.score) && s.correction_reason,
  ).length;
  const correctedItemCount = Math.round(realCorrectedCount * progress);

  // 버전이 새로울수록 AI가 정확히 맞추는 항목이 생김 (오차 없음)
  // V1.0: 0개 정확, V2.0: 2개 정확, V3.0(현재): real data
  const accurateItemCount = Math.round(realScores.length * progress * 0.15);
  // 정확한 항목 인덱스: 뒤에서부터 (교정 대상이 아닌 항목)
  const accurateStartIdx = realScores.length - accurateItemCount;

  return realScores.map((s, i) => {
    const direction = ERROR_DIRECTIONS[i % ERROR_DIRECTIONS.length];
    const currentScore = Number(s.score) || 0;

    // 이 항목은 AI가 정확히 맞춤 (오차 없음)
    if (i >= accurateStartIdx) {
      return {
        ...s,
        ai_original_score: currentScore,
        correction_reason: null,
      };
    }

    const offset = direction * maxError * errorScale;
    const fakeAiScore = Math.round(Math.min(10, Math.max(0, currentScore + offset)) * 10) / 10;

    // 오래된 버전일수록 교정된 항목이 적음
    const isCorrected = i < correctedItemCount;

    return {
      ...s,
      ai_original_score: fakeAiScore,
      correction_reason: isCorrected
        ? (direction < 0
            ? UNDERRATE_REASONS[i % UNDERRATE_REASONS.length]
            : OVERRATE_REASONS[i % OVERRATE_REASONS.length])
        : null,
    };
  });
}

/**
 * 선택된 버전에 맞게 학습 데이터 건수를 시뮬레이션.
 * 오래된 버전일수록 학습 데이터가 적고, 현재 버전이면 실제 값 그대로.
 */
export function simulateTrainingCount(
  realCount: number,
  versionIndex: number,
  totalVersions: number,
): number {
  if (totalVersions <= 1) return realCount;
  const progress = versionIndex / (totalVersions - 1);
  return Math.max(0, Math.round(realCount * progress));
}
