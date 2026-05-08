import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';

interface Props {
  stockScore?: number | null;
  highlight?: boolean;
  reviewScore?: number | null;
  reviewCount?: number | null;
  starDistribution?: Record<string, number> | null;
  tradeAssurance?: boolean | null;
  verifiedBy?: string | null;
  onTimeDeliveryRate?: number | null;
  responseTimeHours?: number | null;
  paymentMethods?: string[] | null;
  mainMarkets?: Record<string, number> | string[] | null;
  categoryRanking?: string | null;
}

export default function StockSuitabilityCard(p: Props) {
  const total = p.starDistribution
    ? Object.values(p.starDistribution).reduce((a, b) => a + Number(b || 0), 0) || 1
    : 1;

  const marketsObj: Record<string, number> | null = Array.isArray(p.mainMarkets)
    ? null
    : (p.mainMarkets ?? null);
  const marketsArr: string[] | null = Array.isArray(p.mainMarkets) ? p.mainMarkets : null;

  return (
    <Card className={`rounded-xl ${p.highlight ? 'border-primary/60 ring-1 ring-primary/30' : ''}`}>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          📦 재고 구매 적합도
        </CardTitle>
        <Badge variant={p.highlight ? 'default' : 'outline'}>Stock {p.stockScore ?? '–'}/100</Badge>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {/* Star + distribution */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
            <span className="font-mono font-semibold">{p.reviewScore?.toFixed(1) ?? '–'}</span>
            <span className="text-muted-foreground">({p.reviewCount ?? 0})</span>
          </div>
        </div>
        {p.starDistribution && (
          <div className="space-y-1">
            {[5, 4, 3, 2, 1].map((s) => {
              const n = Number(p.starDistribution?.[String(s)] ?? 0);
              const pct = Math.round((n / total) * 100);
              return (
                <div key={s} className="flex items-center gap-2 text-[11px]">
                  <span className="w-6 text-muted-foreground">{s}★</span>
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-amber-400" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{pct}%</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-border/50">
          <div><span className="text-muted-foreground">Trade Assurance</span> <span className="font-medium">{p.tradeAssurance ? '✅' : '❌'}</span></div>
          <div><span className="text-muted-foreground">Verified by</span> <span className="font-medium">{p.verifiedBy ?? '–'}</span></div>
          <div><span className="text-muted-foreground">정시납품</span> <span className="font-medium">{p.onTimeDeliveryRate != null ? `${p.onTimeDeliveryRate}%` : '–'}</span></div>
          <div><span className="text-muted-foreground">응답시간</span> <span className="font-medium">{p.responseTimeHours != null ? `≤${p.responseTimeHours}h` : '–'}</span></div>
        </div>

        {p.paymentMethods?.length ? (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">결제 수단</p>
            <div className="flex flex-wrap gap-1">
              {p.paymentMethods.map((m, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{m}</Badge>
              ))}
            </div>
          </div>
        ) : null}

        {(marketsObj || marketsArr) && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">시장 분포</p>
            <div className="flex flex-wrap gap-1">
              {marketsObj
                ? Object.entries(marketsObj).map(([k, v]) => (
                    <Badge
                      key={k}
                      variant={k === 'North America' ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {k} {v}%
                    </Badge>
                  ))
                : marketsArr!.map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
                  ))}
            </div>
          </div>
        )}

        {p.categoryRanking && (
          <div className="pt-2 border-t border-border/50">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">카테고리 랭킹</p>
            <p className="font-medium">{p.categoryRanking}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
