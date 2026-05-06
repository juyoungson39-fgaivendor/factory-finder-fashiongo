import { AlertTriangle, CheckCircle2 } from 'lucide-react';

/**
 * Expected fields the crawler should populate in raw_crawl_data.
 * Each entry includes which 1688 page provides it — clicking the chip opens that page.
 */
type FieldDef = {
  key: string;
  label: string;
  page: 'offerlist' | 'creditdetail' | 'contactinfo';
  /** dot-path inside raw_crawl_data; defaults to key */
  path?: string;
};

export const EXPECTED_RAW_CRAWL_FIELDS: FieldDef[] = [
  // Header (offerlist)
  { key: 'main_category',    label: '메인카테고리',  page: 'offerlist', path: 'header.main_category' },
  { key: 'fan_count',        label: '팬 수',        page: 'offerlist', path: 'header.fan_count' },
  { key: 'established_year', label: '설립연도',      page: 'offerlist', path: 'header.established_year' },
  { key: 'ranking',          label: '랭킹',         page: 'offerlist', path: 'header.ranking' },
  { key: 'badges',           label: '자격 배지',     page: 'offerlist', path: 'header.badges' },
  // 4 axes
  { key: 'consultation', label: '상담 평가',  page: 'offerlist', path: 'axes.consultation' },
  { key: 'logistics',    label: '물류 평가',  page: 'offerlist', path: 'axes.logistics' },
  { key: 'after_sales',  label: 'A/S 평가',   page: 'offerlist', path: 'axes.after_sales' },
  { key: 'product_exp',  label: '상품 평가',  page: 'offerlist', path: 'axes.product_exp' },
  // Business ops (creditdetail)
  { key: 'business_model',  label: '경영모드',  page: 'creditdetail', path: 'business.business_model' },
  { key: 'factory_area',    label: '공장면적',  page: 'creditdetail', path: 'business.factory_area' },
  { key: 'equipment_count', label: '설비총수',  page: 'creditdetail', path: 'business.equipment_count' },
  { key: 'employee_count',  label: '직원수',    page: 'creditdetail', path: 'business.employee_count' },
  { key: 'production_lines',label: '생산라인',  page: 'creditdetail', path: 'business.production_lines' },
  { key: 'annual_revenue',  label: '연거래액',  page: 'creditdetail', path: 'business.annual_revenue' },
  { key: 'new_per_year',    label: '연신상',    page: 'creditdetail', path: 'business.new_per_year' },
  { key: 'rd_staff',        label: 'R&D인력',  page: 'creditdetail', path: 'business.rd_staff' },
  { key: 'oem_mode',        label: 'OEM모드',  page: 'creditdetail', path: 'business.oem_mode' },
  { key: 'self_sampling',   label: '자체샘플',  page: 'creditdetail', path: 'business.self_sampling' },
  { key: 'distribution_channels', label: '유통채널', page: 'creditdetail', path: 'business.distribution_channels' },
  // 30-day trade
  { key: 'paid_orders_30d',     label: '30일 결제주문', page: 'creditdetail', path: 'trade_30d.paid_orders_30d' },
  { key: 'pickup_48h_rate',     label: '48H 揽收率',   page: 'creditdetail', path: 'trade_30d.pickup_48h_rate' },
  { key: 'fulfillment_48h_rate',label: '48H 履约率',   page: 'creditdetail', path: 'trade_30d.fulfillment_48h_rate' },
  { key: 'response_3min_rate',  label: '3분 응답률',    page: 'creditdetail', path: 'trade_30d.response_3min_rate' },
  { key: 'quality_return_rate', label: '품질반품률',     page: 'creditdetail', path: 'trade_30d.quality_return_rate' },
  { key: 'dispute_rate',        label: '분쟁률',        page: 'creditdetail', path: 'trade_30d.dispute_rate' },
  // Certifications
  { key: 'certifications', label: '인증서', page: 'creditdetail', path: 'certifications' },
  // Contact
  { key: 'contact_person', label: '담당자',    page: 'contactinfo', path: 'contact.person' },
  { key: 'contact_phone',  label: '전화',     page: 'contactinfo', path: 'contact.fixed_phone' },
  { key: 'contact_mobile', label: '휴대폰',    page: 'contactinfo', path: 'contact.mobile' },
  { key: 'contact_address',label: '주소',     page: 'contactinfo', path: 'contact.address' },
  { key: 'contact_wangwang',label: '旺旺',    page: 'contactinfo', path: 'contact.wangwang' },
  // AI summary
  { key: 'platform_ai_summary', label: '1688 AI 평가', page: 'offerlist', path: 'platform_ai_summary' },
];

interface Props {
  rawCrawlData: Record<string, any> | null | undefined;
  aiScoredAt: string | null | undefined;
  shopId?: string | null;
}

function getPath(obj: any, path: string): unknown {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function isMissing(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return true;
  return false;
}

function pageUrl(shopId: string | null | undefined, page: FieldDef['page']): string | null {
  if (!shopId) return null;
  return `https://${shopId}.1688.com/page/${page}.htm`;
}

export default function RawCrawlDataValidator({ rawCrawlData, aiScoredAt, shopId }: Props) {
  if (!aiScoredAt) return null;
  const data = rawCrawlData ?? {};
  const total = EXPECTED_RAW_CRAWL_FIELDS.length;
  const missing = EXPECTED_RAW_CRAWL_FIELDS.filter((f) =>
    isMissing(getPath(data, f.path ?? f.key))
  );

  if (missing.length === 0) {
    return (
      <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        원본 데이터 검증: {total}개 필드 모두 정상
      </div>
    );
  }

  return (
    <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div className="flex-1">
        <div className="font-semibold mb-1">
          원본 데이터 누락 {missing.length}/{total}개 필드
        </div>
        <div className="flex flex-wrap gap-1">
          {missing.map((f) => {
            const url = pageUrl(shopId, f.page);
            const inner = (
              <>
                {f.label}
                <code className="text-[10px] opacity-60">{f.key}</code>
              </>
            );
            const cls =
              'inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 dark:bg-amber-900/40 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors';
            return url ? (
              <a
                key={f.key}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={cls}
                title={`${f.path ?? f.key} → ${url}`}
              >
                {inner}
              </a>
            ) : (
              <span key={f.key} className={cls} title={f.path ?? f.key}>
                {inner}
              </span>
            );
          })}
        </div>
        <div className="mt-1 opacity-75">
          누락 필드 클릭 시 1688 원본 페이지가 새 탭에 열립니다. 「재크롤링」으로 다시 시도하세요.
        </div>
      </div>
    </div>
  );
}
