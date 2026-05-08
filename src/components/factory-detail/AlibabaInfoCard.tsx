import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Star, Clock, Package, ShieldCheck, RefreshCw, Mail, Phone, MessageSquare } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';

type Props = {
  alibabaSupplierId?: string | null;
  alibabaUrl?: string | null;
  reviewScore?: number | null;
  reviewCount?: number | null;
  productReviewCount?: number | null;
  starDistribution?: Record<string, number> | null;
  responseTimeHours?: number | null;
  onTimeDeliveryRate?: number | null;
  transactionVolumeUsd?: number | null;
  transactionCount?: number | null;
  goldSupplierYears?: number | null;
  exportYears?: number | null;
  supplierIndex?: string | null;
  responseRate?: number | null;
  yearEstablished?: number | null;
  verifiedBy?: string | null;
  tradeAssurance?: boolean | null;
  mainMarkets?: string[] | null;
  capabilities?: string[] | null;
  categoryRanking?: string | null;
  subCategoryCount?: number | null;
  hasNewArrivalsTab?: boolean | null;
  hasPromotionTab?: boolean | null;
  productionTabCount?: number | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactWechat?: string | null;
  contactRaw?: { fixed_phone?: string | null; mobile?: string | null; address?: string | null; fax?: string | null } | null;
  moq?: string | null;
  leadTime?: string | null;
  onRefetch?: () => void;
};

const fmtUsd = (v?: number | null) => {
  if (v == null) return '–';
  if (v >= 1_000_000) return `US $${(v / 1_000_000).toFixed(1)}M+`;
  if (v >= 1_000) return `US $${(v / 1_000).toFixed(1)}K+`;
  return `US $${v}`;
};

const isEmptyVal = (v: any) => v == null || v === '' || v === '-' || v === '–';

const Stat = ({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) => {
  const empty = isEmptyVal(value);
  return (
    <div className={`rounded-xl border p-3 ${accent || 'bg-muted/30'} ${empty ? 'opacity-40' : ''}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <p className="text-lg font-bold tabular-nums mt-1">{empty ? '📭 데이터 없음' : value}</p>
      {sub && !empty && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
};

const Field = ({ label, value, suffix = '' }: { label: string; value: any; suffix?: string }) => {
  const empty = isEmptyVal(value);
  return (
    <div className={empty ? 'opacity-40' : ''}>
      <span className="text-muted-foreground">{label}</span>{' '}
      <span className="font-medium">{empty ? '📭 데이터 없음' : `${value}${suffix}`}</span>
    </div>
  );
};

export default function AlibabaInfoCard(p: Props) {
  const { toast } = useToast();
  const [recrawling, setRecrawling] = useState(false);

  if (!p.alibabaSupplierId) return null;

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const { data, error } = await supabase.functions.invoke('crawl-alibaba-supplier', {
        body: { supplier_id: p.alibabaSupplierId, force_recrawl: true },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'failed');
      toast({ title: '✅ 재크롤 완료', description: `평균 ${data.avg}/10` });
      p.onRefetch?.();
    } catch (err: any) {
      toast({ title: '재크롤 실패', description: String(err.message || err), variant: 'destructive' });
    } finally {
      setRecrawling(false);
    }
  };

  return (
    <Card className="mb-6 border-primary/30">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          📊 Alibaba.com 공급사 정보
          {p.tradeAssurance && <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">Trade Assurance</Badge>}
          {p.goldSupplierYears != null && <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Gold {p.goldSupplierYears}년</Badge>}
        </CardTitle>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={handleRecrawl} disabled={recrawling}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recrawling ? 'animate-spin' : ''}`} /> 재크롤
          </Button>
          {p.alibabaUrl && (
            <Button size="sm" variant="outline" asChild>
              <a href={p.alibabaUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1" /> 열기
              </a>
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat
            icon={<Star className="w-3 h-3" />}
            label="별점"
            value={p.reviewScore != null ? p.reviewScore.toFixed(1) : null}
            sub={`리뷰 ${p.reviewCount ?? 0}건 · 상품평 ${p.productReviewCount ?? 0}건`}
          />
          <Stat icon={<Clock className="w-3 h-3" />} label="응답시간" value={p.responseTimeHours != null ? `≤${p.responseTimeHours}h` : null} />
          <Stat icon={<Package className="w-3 h-3" />} label="주문 건수" value={p.transactionCount != null ? p.transactionCount.toLocaleString() : null} />
          <Stat icon={<ShieldCheck className="w-3 h-3" />} label="인증" value={p.verifiedBy || (p.tradeAssurance ? 'Trade Assurance' : null)} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs pt-2 border-t border-border/50">
          <Field label="거래량" value={p.transactionVolumeUsd != null ? fmtUsd(p.transactionVolumeUsd) : null} />
          <Field label="정시납품" value={p.onTimeDeliveryRate} suffix="%" />
          <Field label="설립 연도" value={p.yearEstablished ?? (p.exportYears != null ? `수출 ${p.exportYears}년` : null)} />
          <Field label="Supplier Index" value={p.supplierIndex} />
          <Field label="응답률" value={p.responseRate} suffix="%" />
          {p.subCategoryCount != null && <div><span className="text-muted-foreground">서브카테고리</span> <span className="font-medium">{p.subCategoryCount}개</span></div>}
          {p.productionTabCount != null && <div><span className="text-muted-foreground">생산 콘텐츠</span> <span className="font-medium">{p.productionTabCount}개</span></div>}
          {(p.hasNewArrivalsTab || p.hasPromotionTab) && (
            <div><span className="text-muted-foreground">탭</span>{' '}
              {p.hasNewArrivalsTab && <Badge variant="outline" className="ml-1 text-[10px]">NewArrivals</Badge>}
              {p.hasPromotionTab && <Badge variant="outline" className="ml-1 text-[10px]">Promotion</Badge>}
            </div>
          )}
          {p.categoryRanking && <div className="col-span-2 md:col-span-3"><span className="text-muted-foreground">카테고리 랭킹</span> <span className="font-medium">{p.categoryRanking}</span></div>}
          {p.mainMarkets?.length ? (
            <div className="col-span-2 md:col-span-3">
              <span className="text-muted-foreground">주요 수출국</span>{' '}
              {p.mainMarkets.map((m, i) => <Badge key={i} variant="secondary" className="ml-1 text-[10px]">{m}</Badge>)}
            </div>
          ) : null}
          {p.capabilities?.length ? (
            <div className="col-span-2 md:col-span-3">
              <span className="text-muted-foreground">역량</span>{' '}
              {p.capabilities.map((c, i) => <Badge key={i} variant="outline" className="ml-1 text-[10px]">{c}</Badge>)}
            </div>
          ) : null}
        </div>
        {p.starDistribution && Object.keys(p.starDistribution).length > 0 && (() => {
          const total = Object.values(p.starDistribution).reduce((a, b) => a + Number(b || 0), 0) || 1;
          return (
            <div className="pt-2 border-t border-border/50 space-y-1">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">상품평 별점 분포</p>
              {[5, 4, 3, 2, 1].map((s) => {
                const n = Number(p.starDistribution?.[String(s)] ?? 0);
                const pct = Math.round((n / total) * 100);
                return (
                  <div key={s} className="flex items-center gap-2 text-[11px]">
                    <span className="w-8 text-muted-foreground">{s}★</span>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">{pct}% ({n})</span>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {(() => {
          const cr = p.contactRaw || {};
          const fixed = cr.fixed_phone;
          const mobile = cr.mobile;
          const address = cr.address;
          const fax = cr.fax;
          const hasAny = p.contactName || p.contactEmail || p.contactPhone || p.contactWechat || fixed || mobile || address || fax || p.moq || p.leadTime;
          if (!hasAny) return null;
          return (
            <div className="pt-2 border-t border-border/50 space-y-1.5">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">연락처 · 생산 조건</p>
              {p.contactName && <p className="text-xs font-medium">{p.contactName}</p>}
              {p.contactEmail && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Mail className="w-3 h-3" />{p.contactEmail}</p>}
              {fixed && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /><span className="text-[10px] uppercase mr-1">고정</span>{fixed}</p>}
              {mobile && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /><span className="text-[10px] uppercase mr-1">휴대</span>{mobile}</p>}
              {!fixed && !mobile && p.contactPhone && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" />{p.contactPhone}</p>}
              {fax && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><span className="text-[10px] uppercase">FAX</span>{fax}</p>}
              {p.contactWechat && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><MessageSquare className="w-3 h-3" />{p.contactWechat}</p>}
              {address && <p className="text-xs text-muted-foreground flex items-start gap-1.5 leading-relaxed"><span className="text-[10px] uppercase mt-0.5">주소</span><span>{address}</span></p>}
              {(p.moq || p.leadTime) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                  {p.moq && <span><span className="text-muted-foreground">MOQ:</span> <span className="font-medium">{p.moq}</span></span>}
                  {p.leadTime && <span><span className="text-muted-foreground">리드타임:</span> <span className="font-medium">{p.leadTime}</span></span>}
                </div>
              )}
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}
