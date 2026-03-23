import { SEED_FACTORIES } from '@/data/factories';
import { isDevelopmentAccessMode } from '@/lib/runtimeMode';

// Generate stable deterministic IDs for dev mock data
const generateDevId = (index: number) => `dev-factory-${String(index).padStart(4, '0')}`;

export const DEV_FACTORIES = SEED_FACTORIES.map((f, i) => ({
  ...f,
  id: generateDevId(i),
  user_id: 'dev-user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  deleted_at: null,
  deleted_reason: null,
  ai_original_data: null,
  ai_original_score: null,
  score_confirmed: false,
  scraped_data: null,
  contact_email: null,
  contact_wechat: null,
}));

export const DEV_SCORING_CRITERIA = [
  { id: 'dev-crit-01', name: '제품 품질', description: '제품의 전반적인 품질 수준', weight: 3, max_score: 10, sort_order: 1, user_id: 'dev-user', created_at: new Date().toISOString() },
  { id: 'dev-crit-02', name: '가격 경쟁력', description: 'MOQ 대비 가격 합리성', weight: 2, max_score: 10, sort_order: 2, user_id: 'dev-user', created_at: new Date().toISOString() },
  { id: 'dev-crit-03', name: '납기 준수율', description: '약속된 납기일 준수 여부', weight: 2, max_score: 10, sort_order: 3, user_id: 'dev-user', created_at: new Date().toISOString() },
  { id: 'dev-crit-04', name: '커뮤니케이션', description: '응답 속도 및 소통 품질', weight: 1, max_score: 10, sort_order: 4, user_id: 'dev-user', created_at: new Date().toISOString() },
  { id: 'dev-crit-05', name: '샘플 품질', description: '샘플 제작 퀄리티', weight: 2, max_score: 10, sort_order: 5, user_id: 'dev-user', created_at: new Date().toISOString() },
  { id: 'dev-crit-06', name: 'FG 적합도', description: 'FashionGo 플랫폼 적합성', weight: 2, max_score: 10, sort_order: 6, user_id: 'dev-user', created_at: new Date().toISOString() },
];

// Generate mock scores for each factory
export const getDevScores = (factoryId: string) => {
  const factoryIndex = DEV_FACTORIES.findIndex(f => f.id === factoryId);
  if (factoryIndex < 0) return [];
  
  // Use factory overall_score to generate proportional individual scores
  const baseScore = (DEV_FACTORIES[factoryIndex].overall_score ?? 70) / 10;
  
  return DEV_SCORING_CRITERIA.map((c, i) => ({
    id: `dev-score-${factoryId}-${i}`,
    factory_id: factoryId,
    criteria_id: c.id,
    score: Math.min(c.max_score ?? 10, Math.max(1, Math.round((baseScore + (i % 3 - 1)) * 10) / 10)),
    ai_original_score: Math.min(c.max_score ?? 10, Math.max(1, Math.round((baseScore + (i % 2)) * 10) / 10)),
    correction_reason: null,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
};

export const isDevMode = isDevelopmentAccessMode;
