/**
 * Version simulation for presentation.
 *
 * When a non-current model version is selected in the scoring page,
 * scores are modified to simulate what the AI would have scored
 * with that older (less trained) model.
 *
 * Older versions → bigger errors. Current version → real data.
 */

// 항목별 사유 (criteria_id → 과소평가/과대평가 사유)
const CRITERIA_REASONS: Record<string, { underrate: string; overrate: string }> = {
  '985a84c1-4c0c-4317-a2d5-978bf989b5c9': { // 북미 타겟 상품력
    underrate: '미국 트렌드에 맞는 디자인 보유하나 AI가 1688 내수 데이터만 참고하여 과소평가',
    overrate: '실제 상품은 중국 내수 스타일 위주로 북미 시장 적합성 매우 낮음',
  },
  'c9df80e4-abc6-4d89-97f5-a7b1de5a4db7': { // 상품 이미지 품질
    underrate: '고해상도 화이트 배경 + 모델컷 보유하나 AI가 1688 썸네일만 분석함',
    overrate: '이미지 해상도 낮고 화이트 배경/모델컷 없음. AI가 이미지 수만 보고 과대평가',
  },
  '171d5c9a-0c13-434b-adbf-7a827442a373': { // 타 플랫폼 운영 경험
    underrate: 'Amazon, Shein 등 해외 플랫폼 운영 경험 있으나 AI가 감지하지 못함',
    overrate: '1688에서만 운영 중이며 FashionGo 등 해외 플랫폼 경험 전무',
  },
  'ce492d38-727c-44f0-8a82-46a6dcbc5afc': { // 자체 발송 능력
    underrate: '자체 물류센터와 배송팀 보유하나 AI가 인식하지 못함',
    overrate: '자체 물류 없이 제3자 물류에 의존. AI가 "배송 가능" 문구를 과대 해석',
  },
  'c57c14a3-3e2c-4b85-8d28-b59080452de2': { // 가격 경쟁력
    underrate: '동종 업체 대비 10~20% 저렴하나 AI가 원가 구조를 분석하지 못함',
    overrate: '동종 업체 대비 가격이 오히려 높은 편. AI가 1688 표시가격만으로 과대평가',
  },
  '84bba4db-fbc8-4b59-8f95-05a1c397cf7c': { // MOQ 유연성
    underrate: 'MOQ 50장부터 가능하나 AI가 "협의 가능" 문구를 저평가함',
    overrate: 'MOQ 500장 이상으로 소량 주문 불가. AI가 "협의 가능" 문구를 과대 해석',
  },
  'f6741c00-e841-49bc-8caf-f8d48aadc153': { // 납기 신뢰도
    underrate: '최근 6개월 납기 준수율 95% 이상이나 AI가 과거 데이터만 참고',
    overrate: '납기 지연 이력 있음. AI가 공장 규모만 보고 높게 평가',
  },
  '93509842-c670-46c5-bac4-5597a12b8c78': { // 커뮤니케이션
    underrate: '영어 가능한 전담 매니저 배정 가능하나 AI가 감지하지 못함',
    overrate: '중국어만 가능하며 영어 소통 불가. AI가 "해외 거래 경험" 문구를 오해',
  },
  'd00aa481-5e90-4538-9d89-899471209942': { // 상품 다양성
    underrate: 'SKU 3000개 이상으로 다양성 높으나 AI가 카테고리 수만 카운트',
    overrate: '실제 판매 가능 SKU는 50개 미만. AI가 등록 상품 수만으로 과대평가',
  },
  '1b851f3d-7f52-453b-9c1a-8489dcfae69c': { // 인증/컴플라이언스
    underrate: 'Intertek 인증 보유하나 AI가 인증 정보를 파싱하지 못함',
    overrate: '주요 인증 미보유. AI가 "품질 관리" 언급만으로 인증 보유로 오인',
  },
  '19737eb0-0943-4bd6-862d-64508b5ce7b5': { // 패키징/브랜딩
    underrate: '맞춤 패키징 및 브랜드 라벨 서비스 가능하나 AI가 감지하지 못함',
    overrate: '패키징은 기본 비닐 포장만 가능. 브랜딩 커스텀 불가',
  },
  '1c114c71-3a87-4bba-b8ee-e9c3ef05b655': { // 결제 조건
    underrate: 'T/T 30% 선불 조건으로 비교적 유연하나 AI가 낮게 평가',
    overrate: '100% 선불만 가능하며 신용장(L/C) 불가. AI가 "결제 가능" 여부만 확인',
  },
};

// 오차 방향 패턴 (양수: 과대평가, 음수: 과소평가)
const ERROR_DIRECTIONS = [
  -1, +1, +1, +1, -1, +1, +1, +1, +1, -1, +1, -1, +1, -1,
];

// criteria_id로 매칭 안 될 때 사용하는 기본 사유
const FALLBACK_REASON = { underrate: 'AI가 해당 항목을 과소평가함', overrate: 'AI가 해당 항목을 과대평가함' };

/**
 * 버전의 "위치"(0=가장 오래된, 마지막=현재)에 따라 오차 스케일을 결정.
 */
function getErrorScale(versionIndex: number, totalVersions: number): number {
  if (totalVersions <= 1) return 0;
  return 1 - versionIndex / (totalVersions - 1);
}

/**
 * 선택된 버전에 맞게 scores의 ai_original_score를 시뮬레이션.
 */
export function simulateVersionScores(
  realScores: any[],
  versionIndex: number,
  totalVersions: number,
): any[] {
  const errorScale = getErrorScale(versionIndex, totalVersions);

  // 현재 버전이면 원본 그대로
  if (errorScale === 0) return realScores;

  const maxError = 6.0;

  const progress = totalVersions <= 1 ? 1 : versionIndex / (totalVersions - 1);

  // 버전이 새로울수록 AI가 정확히 맞추는 항목이 생김
  const accurateItemCount = Math.round(realScores.length * progress * 0.15);
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

    // criteria_id 기반으로 항목에 맞는 사유 선택
    const reasons = CRITERIA_REASONS[s.criteria_id] || FALLBACK_REASON;
    const reason = direction < 0 ? reasons.underrate : reasons.overrate;

    return {
      ...s,
      ai_original_score: fakeAiScore,
      correction_reason: reason,
    };
  });
}

/**
 * 선택된 버전에 맞게 학습 데이터 건수를 시뮬레이션.
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
