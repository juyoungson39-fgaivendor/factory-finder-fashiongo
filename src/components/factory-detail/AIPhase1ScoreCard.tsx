import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

type Signals = {
  mixed_batch?: boolean;
  dropshipping?: boolean;
  custom_accepted?: boolean;
};

type RawCrawlData = {
  ontime_rate?: number;
  positive_review_rate?: number;
  fan_count?: string | number;
  established_year?: number;
  established_month?: number;
  main_category?: string;
  subcategory_count?: number;
  signals?: Signals;
};

interface Props {
  aiScoredAt: string | null;
  scoreStatus: string | null;
  alibabaDetected: boolean | null;
  selfShipping: number | null;
  imageQuality: number | null;
  moqFlex: number | null;
  leadTime: number | null;
  communication: number | null;
  variety: number | null;
  rawServiceScore: number | null;
  rawReturnRate: number | null;
  rawProductCount: number | null;
  rawYearsInBusiness: number | null;
  rawCrawlData: RawCrawlData | null;
  scoringReasons?: Record<string, string> | null;
}

// 가중치 (자체발송 25, 이미지 10, MOQ 15, 납기 15, 소통 10, 다양성 15 → 총 90)
const WEIGHTS = {
  selfShipping: 2.5,
  imageQuality: 1.0,
  moqFlex: 1.5,
  leadTime: 1.5,
  communication: 1.0,
  variety: 1.5,
};

const ScoreRow = ({
  label,
  score,
  reason,
}: {
  label: string;
  score: number | null;
  reason: string;
}) => {
  const value = score != null ? Number(score) : 0;
  const pct = (value / 10) * 100;
  return (
    <div className="space-y-1.5 py-2 border-b border-border/40 last:border-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-xs font-bold tabular-nums whitespace-nowrap">
          {score != null ? value.toFixed(1) : '—'} / 10
        </span>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-[11px] text-muted-foreground leading-snug">근거: {reason}</p>
    </div>
  );
};

export default function AIPhase1ScoreCard({
  aiScoredAt,
  scoreStatus,
  alibabaDetected,
  selfShipping,
  imageQuality,
  moqFlex,
  leadTime,
  communication,
  variety,
  rawServiceScore,
  rawReturnRate,
  rawProductCount,
  rawYearsInBusiness,
  rawCrawlData,
}: Props) {
  // ai_scored_at IS NULL → 카드 숨김
  if (!aiScoredAt) return null;

  const sig = rawCrawlData?.signals ?? {};

  // 근거 자동 계산
  const selfShippingReason = alibabaDetected
    ? 'Alibaba.com 등록 확인'
    : 'Alibaba.com 미등록';

  const imageQualityReason = 'Grade B (기본값 · Claude Vision 스킵)';

  const moqSignals: string[] = [];
  if (sig.mixed_batch) moqSignals.push('混批');
  if (sig.dropshipping) moqSignals.push('一件代发');
  if (sig.custom_accepted) moqSignals.push('OEM/ODM');
  const moqReason = moqSignals.length
    ? `${moqSignals.join(' + ')} 지원 (숫자 MOQ 없음)`
    : '소량주문 시그널 없음';

  const yrs = rawYearsInBusiness ?? 0;
  const rr = rawReturnRate != null ? Number(rawReturnRate) : 0;
  const leadTimeCalc = (yrs * 0.5 + rr * 0.05).toFixed(2);
  const leadTimeReason = `${yrs}년 × 0.5 + ${rr}% × 0.05 = ${leadTimeCalc}`;

  const svc = rawServiceScore != null ? Number(rawServiceScore) : 0;
  const communicationReason = `服务分 ${svc.toFixed(1)} (${svc >= 3.0 ? '≥3.0' : '<3.0'})`;

  const pc = rawProductCount ?? 0;
  const varietyReason = `${pc.toLocaleString()}건 (${pc >= 500 ? '≥500' : '<500'})`;

  // 평균 / 가중합 계산
  const scores = [selfShipping, imageQuality, moqFlex, leadTime, communication, variety]
    .map((s) => (s != null ? Number(s) : 0));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  const weightedSum =
    (Number(selfShipping ?? 0) * WEIGHTS.selfShipping) +
    (Number(imageQuality ?? 0) * WEIGHTS.imageQuality) +
    (Number(moqFlex ?? 0) * WEIGHTS.moqFlex) +
    (Number(leadTime ?? 0) * WEIGHTS.leadTime) +
    (Number(communication ?? 0) * WEIGHTS.communication) +
    (Number(variety ?? 0) * WEIGHTS.variety);
  const maxWeighted = 90;
  const weightedPct = (weightedSum / maxWeighted) * 100;

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          🤖 AI Phase 1 스코어
          {scoreStatus === 'ai_scored' && (
            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
              AI 자동평가
            </Badge>
          )}
          {scoreStatus === 'scored' && (
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
              검증완료
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <ScoreRow label="자체 발송 능력" score={selfShipping} reason={selfShippingReason} />
          <ScoreRow label="상품 이미지 품질" score={imageQuality} reason={imageQualityReason} />
          <ScoreRow label="MOQ 유연성" score={moqFlex} reason={moqReason} />
          <ScoreRow label="납기 신뢰도" score={leadTime} reason={leadTimeReason} />
          <ScoreRow label="커뮤니케이션" score={communication} reason={communicationReason} />
          <ScoreRow label="상품 다양성" score={variety} reason={varietyReason} />
        </div>

        <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phase 1 평균</p>
            <p className="text-lg font-bold tabular-nums">{avg.toFixed(1)} <span className="text-xs text-muted-foreground font-normal">/ 10</span></p>
          </div>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phase 1 가중합</p>
            <p className="text-lg font-bold tabular-nums">
              {weightedSum.toFixed(2)} <span className="text-xs text-muted-foreground font-normal">/ {maxWeighted}</span>
              <span className="text-xs text-muted-foreground font-normal ml-1">({weightedPct.toFixed(1)}%)</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
