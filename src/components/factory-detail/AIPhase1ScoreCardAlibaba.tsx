import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  aiScoredAt?: string | null;
  selfShipping?: number | null;
  imageQuality?: number | null;
  moqFlex?: number | null;
  leadTime?: number | null;
  communication?: number | null;
  variety?: number | null;
  // Alibaba raw signals (for "근거" text)
  tradeAssurance?: boolean | null;
  responseTimeHours?: number | null;
  onTimeDeliveryRate?: number | null;
  reviewScore?: number | null;
  reviewCount?: number | null;
  productReviewCount?: number | null;
  capabilities?: string[] | null;
  categoryRanking?: string | null;
  mainMarkets?: string[] | null;
  subCategoryCount?: number | null;
  hasNewArrivalsTab?: boolean | null;
  hasPromotionTab?: boolean | null;
  productionTabCount?: number | null;
}

const clip = (n: number) => Math.max(0, Math.min(10, n));

function computeAlibabaScores(p: Props) {
  const ta = p.tradeAssurance ? 1 : 0;
  const resp = p.responseTimeHours ?? 24;
  const otd = p.onTimeDeliveryRate ?? 0;
  const caps = p.capabilities ?? [];
  const hasFull = caps.some((c) => /full\s*custom/i.test(c));
  const hasOemOdm = caps.some((c) => /OEM|ODM/i.test(c));
  const hasRank = !!p.categoryRanking;
  const totalReviews = (p.productReviewCount ?? 0) + (p.reviewCount ?? 0);
  const markets = (p.mainMarkets ?? []).length;

  return {
    self_shipping: clip(ta * 8 + (resp <= 6 ? 2 : 0)),
    image_quality: 7.0,
    moq: clip((hasFull ? 5 : 0) + (hasOemOdm ? 3 : 0) + (hasRank ? 2 : 0)),
    lead_time:
      otd >= 98 ? 10 : otd >= 95 ? 8 : otd >= 90 ? 6 : otd >= 80 ? 4 : 2,
    communication:
      resp <= 3 ? 10 : resp <= 6 ? 8 : resp <= 12 ? 6 : resp <= 24 ? 4 : 2,
    variety: clip(
      (totalReviews >= 100 ? 10 : totalReviews >= 50 ? 7 : totalReviews >= 20 ? 4 : 2) +
        Math.min(markets / 5, 2),
    ),
  };
}

function reasonsFor(p: Props) {
  const resp = p.responseTimeHours ?? null;
  const otd = p.onTimeDeliveryRate ?? null;
  const caps = (p.capabilities ?? []).join(', ');
  return {
    self_shipping: `Trade Assurance ${p.tradeAssurance ? '✅' : '❌'}${resp != null ? ` · 응답 ${resp <= 6 ? '≤' : '>'}6h` : ''}`,
    image_quality: 'Vision 분석 전(기본 7.0)',
    moq: caps ? `Capabilities: ${caps}${p.categoryRanking ? ` · ${p.categoryRanking}` : ''}` : (p.categoryRanking ?? '데이터 부족'),
    lead_time: otd != null ? `정시납품 ${otd}%` : '데이터 부족',
    communication: resp != null ? `응답시간 ${resp}h` : '데이터 부족',
    variety:
      `상품평 ${p.productReviewCount ?? 0}건 + 리뷰 ${p.reviewCount ?? 0}건 = ${(p.productReviewCount ?? 0) + (p.reviewCount ?? 0)}건` +
      ((p.mainMarkets ?? []).length ? ` · 시장 ${(p.mainMarkets ?? []).length}개` : ''),
  };
}

const LABELS: Record<string, string> = {
  self_shipping: '자체 발송 능력',
  image_quality: '상품 이미지 품질',
  moq: 'MOQ 유연성',
  lead_time: '납기 신뢰도',
  communication: '커뮤니케이션',
  variety: '상품 다양성',
};

export default function AIPhase1ScoreCardAlibaba(props: Props) {
  // Prefer stored DB scores if present, else compute from signals
  const stored = {
    self_shipping: props.selfShipping,
    image_quality: props.imageQuality,
    moq: props.moqFlex,
    lead_time: props.leadTime,
    communication: props.communication,
    variety: props.variety,
  };
  const computed = computeAlibabaScores(props);
  const scores = Object.fromEntries(
    Object.entries(stored).map(([k, v]) => [k, v != null ? Number(v) : (computed as any)[k]]),
  ) as Record<string, number>;
  const reasons = reasonsFor(props);
  const avg = +(Object.values(scores).reduce((a, b) => a + b, 0) / 6).toFixed(1);

  return (
    <Card className="rounded-xl">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          🤖 AI Phase 1 스코어 (Alibaba 기준)
        </CardTitle>
        <Badge variant="outline" className="text-[11px]">
          평균 {avg}/10
        </Badge>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {Object.entries(scores).map(([k, v]) => (
          <div key={k} className="flex items-start gap-3 text-xs py-1.5 border-b last:border-0">
            <div className="w-28 shrink-0 text-muted-foreground">{LABELS[k]}</div>
            <div className="w-12 shrink-0 font-mono font-semibold">{Number(v).toFixed(1)}</div>
            <div className="flex-1 text-muted-foreground text-[11px]">{(reasons as any)[k]}</div>
          </div>
        ))}
        {props.aiScoredAt && (
          <p className="text-[10px] text-muted-foreground pt-1">
            마지막 스코어링: {new Date(props.aiScoredAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
