import type { ProductLogEntry } from '@/components/agent/ProductLogTimeline';

let logCounter = 0;

export function createLocalLog(
  eventType: string,
  message: string,
  data: Record<string, any> = {},
  createdBy = 'AI Agent',
): ProductLogEntry {
  logCounter++;
  return {
    id: `local-${Date.now()}-${logCounter}`,
    event_type: eventType,
    event_message: message,
    event_data: data,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
}

export function generateRecommendationLogs(
  products: { id: number; name: string; vendor: string; score: number }[],
): ProductLogEntry[] {
  return products.map((p) =>
    createLocalLog(
      'AI_RECOMMENDED',
      `Angel Agent가 이 상품을 ${p.vendor} 벤더 상품으로 추천했습니다. (스코어: ${p.score})`,
      { vendor: p.vendor, score: p.score, productName: p.name },
    ),
  );
}

export function generateEditLog(
  productId: number,
  field: string,
  oldValue: string,
  newValue: string,
  editor = 'user',
): ProductLogEntry {
  const fieldLabels: Record<string, string> = {
    name: '상품명', price: '판매가', msrp: 'MSRP',
    category: '카테고리', season: '시즌', vendor: '벤더', aiDesc: 'AI Description',
  };
  const label = fieldLabels[field] || field;
  return createLocalLog(
    'PRODUCT_EDITED',
    `${label}이(가) '${oldValue}'에서 '${newValue}'(으)로 수정되었습니다.`,
    { field, oldValue, newValue, editor },
    editor,
  );
}

export function generatePushQueuedLog(batchId: string): ProductLogEntry {
  return createLocalLog('PUSH_QUEUED', 'FashionGo Push 대기열에 추가되었습니다.', { batchId });
}

export function generatePushConfirmedLog(
  index: number,
  total: number,
  executor: string,
  batchId: string,
): ProductLogEntry {
  return createLocalLog(
    'PUSH_CONFIRMED',
    `FashionGo Push가 실행되었습니다. (${total}개 상품 중 ${index}번)`,
    { executor, batchId, total, index },
    executor,
  );
}

export function generatePushCompletedLog(): ProductLogEntry {
  return createLocalLog('PUSH_COMPLETED', 'FashionGo에 성공적으로 등록되었습니다.', {});
}
