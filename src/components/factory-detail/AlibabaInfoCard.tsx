import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Star, Clock, Package, ShieldCheck, RefreshCw } from 'lucide-react';
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
  verifiedBy?: string | null;
  tradeAssurance?: boolean | null;
  mainMarkets?: string[] | null;
  capabilities?: string[] | null;
  categoryRanking?: string | null;
  onRefetch?: () => void;
};

const fmtUsd = (v?: number | null) => {
  if (v == null) return '–';
  if (v >= 1_000_000) return `US $${(v / 1_000_000).toFixed(1)}M+`;
  if (v >= 1_000) return `US $${(v / 1_000).toFixed(1)}K+`;
  return `US $${v}`;
};

const Stat = ({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: string }) => (
  <div className={`rounded-xl border p-3 ${accent || 'bg-muted/30'}`}>
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
      {icon}<span>{label}</span>
    </div>
    <p className="text-lg font-bold tabular-nums mt-1">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

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
          <Stat icon={<Star className="w-3 h-3" />} label="별점" value={`${p.reviewScore?.toFixed(1) ?? '–'}${p.reviewCount ? ` (${p.reviewCount})` : ''}`} />
          <Stat icon={<Clock className="w-3 h-3" />} label="응답시간" value={p.responseTimeHours != null ? `≤${p.responseTimeHours}h` : '–'} />
          <Stat icon={<Package className="w-3 h-3" />} label="주문 건수" value={p.transactionCount?.toLocaleString() ?? '–'} />
          <Stat icon={<ShieldCheck className="w-3 h-3" />} label="인증" value={p.verifiedBy || (p.tradeAssurance ? 'Trade Assurance' : '–')} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs pt-2 border-t border-border/50">
          <div><span className="text-muted-foreground">거래량</span> <span className="font-medium">{fmtUsd(p.transactionVolumeUsd)}</span></div>
          <div><span className="text-muted-foreground">정시납품</span> <span className="font-medium">{p.onTimeDeliveryRate != null ? `${p.onTimeDeliveryRate}%` : '–'}</span></div>
          <div><span className="text-muted-foreground">수출 경력</span> <span className="font-medium">{p.exportYears != null ? `${p.exportYears}년` : '–'}</span></div>
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
      </CardContent>
    </Card>
  );
}
