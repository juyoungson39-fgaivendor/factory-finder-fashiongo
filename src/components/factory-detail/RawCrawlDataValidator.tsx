import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * UI가 RawCrawlDataCard에서 읽는 필드 목록.
 * crawl-factory-1688 edge function이 raw_crawl_data에 채워야 하는 키와 동일해야 한다.
 * 누락되면 화면에 경고 배너로 표시된다.
 */
export const EXPECTED_RAW_CRAWL_FIELDS = [
  'fan_count',
  'main_category',
  'ontime_rate',
  'positive_review_rate',
  'established_year',
  'subcategory_count',
  'price_stats',
  'signals',
  'top_sales',
  'contact',
] as const;

const FIELD_LABELS: Record<string, string> = {
  fan_count: '팬 수',
  main_category: '메인카테고리',
  ontime_rate: '정시발송률',
  positive_review_rate: '긍정평가율',
  established_year: '설립연도',
  subcategory_count: '카테고리 수',
  price_stats: '가격 통계',
  signals: '소량주문 시그널',
  top_sales: '판매 실적',
  contact: '연락처',
};

interface Props {
  rawCrawlData: Record<string, any> | null | undefined;
  aiScoredAt: string | null | undefined;
}

function isMissing(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return true;
  return false;
}

export default function RawCrawlDataValidator({ rawCrawlData, aiScoredAt }: Props) {
  if (!aiScoredAt) return null; // 아직 크롤 전이면 표시 안함
  const data = rawCrawlData ?? {};
  const missing = EXPECTED_RAW_CRAWL_FIELDS.filter((k) => isMissing((data as any)[k]));

  if (missing.length === 0) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        원본 데이터 검증: {EXPECTED_RAW_CRAWL_FIELDS.length}개 필드 모두 정상
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold mb-0.5">
          원본 데이터 누락 {missing.length}/{EXPECTED_RAW_CRAWL_FIELDS.length}개 필드
        </div>
        <div className="flex flex-wrap gap-1">
          {missing.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/40 dark:border-amber-700"
              title={`raw_crawl_data.${k}`}
            >
              {FIELD_LABELS[k] ?? k}
              <code className="text-[10px] opacity-60">{k}</code>
            </span>
          ))}
        </div>
        <div className="mt-1 opacity-75">
          크롤러가 해당 필드를 추출하지 못했습니다. 「재크롤링」 또는 정규식 보정이 필요할 수 있습니다.
        </div>
      </div>
    </div>
  );
}
