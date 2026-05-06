import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2, ExternalLink, MessageCircle, Map } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type Signals = {
  mixed_batch?: boolean;
  dropshipping?: boolean;
  custom_accepted?: boolean;
};
type PriceStats = {
  min?: number; max?: number; avg?: number; median?: number; sample_count?: number;
};
type Header = {
  main_category?: string | null;
  fan_count?: string | number | null;
  established_year?: number | null;
  established_month?: number | null;
  ranking?: string | null;
  badges?: string[] | null;
};
type Axes = {
  consultation?: number | null;
  logistics?: number | null;
  after_sales?: number | null;
  product_exp?: number | null;
};
type Business = {
  business_model?: string | null;
  factory_area?: string | null;
  equipment_count?: number | null;
  employee_count?: number | null;
  production_lines?: number | null;
  annual_revenue?: string | null;
  new_per_year?: string | null;
  rd_staff?: number | null;
  oem_mode?: string | null;
  self_sampling?: string | null;
  distribution_channels?: number | null;
};
type Trade30d = {
  paid_orders_30d?: number | null;
  pickup_48h_rate?: number | null;
  fulfillment_48h_rate?: number | null;
  response_3min_rate?: number | null;
  quality_return_rate?: number | null;
  dispute_rate?: number | null;
};
type Cert = { image: string; caption: string };
type Contact = {
  person?: string | null;
  role?: string | null;
  fixed_phone?: string | null;
  mobile?: string | null;
  fax?: string | null;
  address?: string | null;
  postcode?: string | null;
  wangwang?: string | null;
  wechat?: string | null;
};

type RawCrawlData = {
  // legacy keys
  ontime_rate?: number;
  positive_review_rate?: number;
  fan_count?: string | number;
  established_year?: number;
  established_month?: number;
  main_category?: string;
  subcategory_count?: number;
  price_stats?: PriceStats;
  signals?: Signals;
  top_sales?: string[];
  contact?: Contact;
  // new
  header?: Header;
  axes?: Axes;
  business?: Business;
  trade_30d?: Trade30d;
  certifications?: Cert[];
  platform_ai_summary?: string | null;
};

interface Props {
  factoryId: string;
  scoreStatus: string | null;
  aiScoredAt: string | null;
  p1CrawledAt: string | null;
  rawServiceScore: number | null;
  rawReturnRate: number | null;
  rawProductCount: number | null;
  rawYearsInBusiness: number | null;
  rawCrawlData: RawCrawlData | null;
  shopId?: string | null;
}

const formatKoreanTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

const Row = ({ icon, label, value }: { icon?: string; label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1 border-b border-border/40 last:border-0">
    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
      {icon && <span>{icon}</span>}
      {label}
    </span>
    <span className="text-[11px] font-semibold tabular-nums text-right max-w-[60%] truncate">
      {value ?? '—'}
    </span>
  </div>
);

const Section = ({
  icon, title, children,
}: { icon: string; title: string; children: React.ReactNode }) => (
  <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
      <span>{icon}</span>
      <span>{title}</span>
    </div>
    {children}
  </div>
);

const Bar = ({ label, value, max = 5 }: { label: string; value: number | null | undefined; max?: number }) => {
  const v = value ?? 0;
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className="flex items-center gap-2 text-[11px] py-0.5">
      <span className="w-12 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums font-semibold">{value != null ? v.toFixed(1) : '—'}</span>
    </div>
  );
};

const KpiCard = ({ label, value, accent }: { label: string; value: React.ReactNode; accent?: 'good' | 'warn' | 'bad' }) => {
  const colorMap = {
    good: 'text-emerald-600 dark:text-emerald-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-600 dark:text-red-400',
  } as const;
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5 bg-muted/30">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${accent ? colorMap[accent] : ''}`}>{value}</div>
    </div>
  );
};

const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${Number(n).toFixed(n >= 10 ? 0 : 1)}%`);

export default function RawCrawlDataCard({
  factoryId, scoreStatus, aiScoredAt, p1CrawledAt,
  rawServiceScore, rawReturnRate, rawProductCount, rawYearsInBusiness,
  rawCrawlData, shopId,
}: Props) {
  const [recrawling, setRecrawling] = useState(false);
  const queryClient = useQueryClient();

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const { error } = await supabase
        .from('factories')
        .update({ score_status: 'p1_crawling' })
        .eq('id', factoryId);
      if (error) throw error;
      sonnerToast.success('크롤링 요청됨', { description: '크롤러가 곧 처리합니다.' });
      queryClient.invalidateQueries({ queryKey: ['factory', factoryId] });
    } catch (err: any) {
      sonnerToast.error('요청 실패: ' + err.message);
    } finally {
      setRecrawling(false);
    }
  };

  if (!aiScoredAt) {
    return (
      <Card className="mb-4 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
            📊 1688 원본 데이터
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <p className="text-xs text-muted-foreground">크롤링 대기 중</p>
          <Button size="sm" variant="outline" disabled={recrawling} onClick={handleRecrawl}>
            {recrawling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            지금 크롤링
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = rawCrawlData ?? {};
  const header: Header = d.header ?? {
    main_category: d.main_category,
    fan_count: d.fan_count,
    established_year: d.established_year,
    established_month: d.established_month,
  };
  const axes: Axes = d.axes ?? {};
  const business: Business = d.business ?? {};
  const trade: Trade30d = d.trade_30d ?? {};
  const certs: Cert[] = d.certifications ?? [];
  const contact: Contact = d.contact ?? {};
  const summary = d.platform_ai_summary;

  const offerlistUrl = shopId ? `https://${shopId}.1688.com/page/offerlist.htm` : null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          📊 1688 원본 데이터
          {scoreStatus === 'scored' && (
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
              검증완료
            </Badge>
          )}
          {offerlistUrl && (
            <a
              href={offerlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="w-3 h-3" /> 원본
            </a>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* 1. Header */}
          <Section icon="🏷" title="헤더 정보">
            <Row label="메인카테고리" value={header.main_category ?? '—'} />
            <Row label="입주년수" value={rawYearsInBusiness != null ? `${rawYearsInBusiness}년` : '—'} />
            <Row label="설립" value={header.established_year ? `${header.established_year}.${String(header.established_month ?? 1).padStart(2, '0')}` : '—'} />
            <Row label="服务分" value={rawServiceScore != null ? `${Number(rawServiceScore).toFixed(1)} / 5.0` : '—'} />
            <Row label="回头率" value={rawReturnRate != null ? `${Number(rawReturnRate).toFixed(0)}%` : '—'} />
            <Row label="팬 수" value={header.fan_count ?? '—'} />
            <Row label="랭킹" value={header.ranking ?? '—'} />
            {(header.badges?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1 pt-1.5">
                {header.badges!.map((b) => (
                  <span key={b} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </Section>

          {/* 2. 4-axis */}
          <Section icon="⭐" title="4축 평가">
            <Bar label="咨询" value={axes.consultation} />
            <Bar label="物流" value={axes.logistics} />
            <Bar label="售后" value={axes.after_sales} />
            <Bar label="商品" value={axes.product_exp} />
          </Section>

          {/* 3. Business ops */}
          <Section icon="🏭" title="사업 운영">
            <Row label="사업형태" value={business.business_model ?? '—'} />
            <Row label="직원수" value={business.employee_count != null ? `${business.employee_count.toLocaleString()}명` : '—'} />
            <Row label="공장면적" value={business.factory_area ?? '—'} />
            <Row label="설비총수" value={business.equipment_count != null ? `${business.equipment_count.toLocaleString()}대` : '—'} />
            <Row label="생산라인" value={business.production_lines != null ? `${business.production_lines}개` : '—'} />
            <Row label="연거래액" value={business.annual_revenue ?? '—'} />
            <Row label="연신상" value={business.new_per_year ?? '—'} />
            <Row label="R&D인력" value={business.rd_staff != null ? `${business.rd_staff}명` : '—'} />
            <Row label="OEM모드" value={business.oem_mode ?? '—'} />
            <Row label="자체샘플" value={business.self_sampling ?? '—'} />
            <Row label="유통채널" value={business.distribution_channels != null ? `${business.distribution_channels}개` : '—'} />
          </Section>

          {/* 4. 30-day KPI */}
          <Section icon="📈" title="최근 30일 활성도">
            <div className="grid grid-cols-2 gap-1.5">
              <KpiCard label="결제주문" value={trade.paid_orders_30d?.toLocaleString() ?? '—'} />
              <KpiCard label="48H 발송" value={fmtPct(trade.pickup_48h_rate)}
                       accent={(trade.pickup_48h_rate ?? 0) >= 90 ? 'good' : 'warn'} />
              <KpiCard label="48H 이행" value={fmtPct(trade.fulfillment_48h_rate)}
                       accent={(trade.fulfillment_48h_rate ?? 0) >= 95 ? 'good' : 'warn'} />
              <KpiCard label="3분 응답" value={fmtPct(trade.response_3min_rate)}
                       accent={(trade.response_3min_rate ?? 0) >= 80 ? 'good' : 'warn'} />
              <KpiCard label="품질반품" value={fmtPct(trade.quality_return_rate)}
                       accent={(trade.quality_return_rate ?? 0) <= 1 ? 'good' : 'bad'} />
              <KpiCard label="분쟁률" value={fmtPct(trade.dispute_rate)}
                       accent={(trade.dispute_rate ?? 0) <= 0.5 ? 'good' : 'bad'} />
            </div>
          </Section>
        </div>

        {/* 5. Certifications */}
        {certs.length > 0 && (
          <Section icon="📜" title={`인증 자격 (${certs.length})`}>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {certs.map((c, i) => (
                <a
                  key={i}
                  href={c.image}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 flex flex-col items-center gap-1 w-20"
                  title={c.caption}
                >
                  <img src={c.image} alt={c.caption} className="w-20 h-20 object-cover rounded border border-border" />
                  <span className="text-[9px] text-center text-muted-foreground line-clamp-2">{c.caption}</span>
                </a>
              ))}
            </div>
          </Section>
        )}

        {/* 6. Contact */}
        <Section icon="📞" title="연락처">
          <div className="text-[12px] space-y-1">
            <div>
              담당자{' '}
              <span className="font-semibold">{contact.person ?? '—'}</span>
              {contact.role && <span className="text-muted-foreground"> ({contact.role})</span>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
              {contact.fixed_phone && <span>☎ {contact.fixed_phone}</span>}
              {contact.mobile && <span>📱 {contact.mobile}</span>}
              {contact.fax && <span>📠 {contact.fax}</span>}
            </div>
            {contact.address && <div className="text-[11px]">📍 {contact.address}</div>}
            <div className="flex gap-1.5 pt-1">
              {contact.wangwang && (
                <a
                  href={`https://amos.alicdn.com/getcid.aw?v=2&groupid=0&s=1&charset=utf-8&uid=${contact.wangwang}&site=cnalichn`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted"
                >
                  <MessageCircle className="w-3 h-3" /> 旺旺
                </a>
              )}
              {contact.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(contact.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted"
                >
                  <Map className="w-3 h-3" /> 지도
                </a>
              )}
            </div>
          </div>
        </Section>

        {/* 7. AI summary */}
        {summary && (
          <Section icon="🤖" title="1688 AI 평가">
            <p className="text-[11px] leading-relaxed text-foreground whitespace-pre-line">{summary}</p>
          </Section>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground">
            최근 크롤: <span className="tabular-nums">{formatKoreanTime(p1CrawledAt)}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={recrawling}
            onClick={handleRecrawl}
          >
            {recrawling ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1.5" />
            )}
            재크롤링 요청
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
