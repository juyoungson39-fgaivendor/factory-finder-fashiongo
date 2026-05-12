import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Calculator } from 'lucide-react';

type Formula = {
  order: number;
  criteria: string;
  weight: number;
  source: string;
  formula: string;
  example: string;
  badgeColor: string;
};

const FORMULAS: Formula[] = [
  {
    order: 1,
    criteria: '커뮤니케이션 응답력',
    weight: 2.0,
    source: 'response_time_hours / response_rate',
    formula: 'resp ≤2h → 8 / ≤4h → 6 / ≤8h → 4 / >8h → 2 · response_rate ≥99% 가산 +1',
    example: '응답 1.5h + 99.5% → 9.0',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    order: 2,
    criteria: '상품 다양성',
    weight: 1.5,
    source: 'sub_category_count / has_promotion_tab',
    formula: '카테고리 ≥20 → 9 / ≥15 → 8 / ≥10 → 7 / ≥8 → 6 / ≥5 → 4 / <5 → 2 · Promotion탭 +0.5',
    example: '카테고리 12 + Promotion → 7.5',
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  {
    order: 3,
    criteria: '납기·배송 신뢰도',
    weight: 2.0,
    source: 'trade_assurance / on_time_delivery_rate',
    formula: 'TA + OTD ≥98% → 10 / TA + OTD ≥95% → 8 / TA만(OTD없음) → 6 / TA없음 → 3',
    example: 'TA + OTD 98.5% → 10.0',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    order: 4,
    criteria: '제조·커스텀 역량',
    weight: 1.5,
    source: 'capabilities / production_tab_count',
    formula: 'Full Customization → 9 / OEM+ODM → 7 / 하나만 → 5 / 정보없음 → null · Production탭 ≥5 가산 +1',
    example: 'Full Custom + 6탭 → 10.0',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    order: 5,
    criteria: '거래 실적',
    weight: 2.0,
    source: 'transaction_volume_usd',
    formula: '≥$500K → 10 / ≥$100K → 8 / ≥$10K → 6 / ≥$1K → 4 / <$1K → 2 / null → null',
    example: '$240K → 8.0',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  {
    order: 6,
    criteria: '사업 안정성',
    weight: 1.5,
    source: 'year_established (업력 = 2026 - year)',
    formula: '≥10년 → 9 / ≥5년 → 7 / ≥3년 → 5 / <3년 → 3 / null → null',
    example: '2014 설립 (12년) → 9.0',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    order: 7,
    criteria: '바이어 평판',
    weight: 2.0,
    source: 'review_score / review_count',
    formula: '≥4.8 + ≥100건 → 10 / ≥4.8 → 8 / ≥4.5 + ≥10건 → 6 / <4.5 → 3 / null → null',
    example: '4.9 (150건) → 10.0',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
  },
  {
    order: 8,
    criteria: '플랫폼 활동성',
    weight: 1.0,
    source: 'has_promotion_tab / has_new_arrivals_tab / production_tab_count',
    formula: 'Promo + NewArrivals + Production탭 → 9 / Promo + 1개 → 7 / Promo만 → 5 / 없음 → 3',
    example: 'Promo + NewArr + 3탭 → 9.0',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
  },
];

export default function AIPhase1FormulaCard() {
  const totalWeight = FORMULAS.reduce((s, f) => s + f.weight, 0);

  return (
    <Card className="mb-6 border-purple-200/60 bg-gradient-to-br from-purple-50/30 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center">
              <Bot className="w-4 h-4 text-purple-600" />
            </div>
            <span>AI 스코어링 매칭 공식</span>
            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
              8축 · Alibaba 자동 평가
            </Badge>
          </CardTitle>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Calculator className="w-3 h-3" />
            <span>총 가중합 만점: <strong className="text-foreground">{(totalWeight * 10).toFixed(0)}점</strong></span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          Alibaba 공급사 데이터를 8개 평가 항목으로 자동 변환하는 규칙. 데이터 미확보 항목은 5점이 아닌 <code className="px-1 py-0.5 rounded bg-muted text-[10px]">null</code>로 반환됩니다 (notes에 "데이터 미확보" 표시).
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60">
                <th className="text-center py-2 pr-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-8">#</th>
                <th className="text-left py-2 pr-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">평가 항목</th>
                <th className="text-center py-2 px-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-16">가중치</th>
                <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">소스 필드</th>
                <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">변환 공식</th>
                <th className="text-left py-2 pl-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">예시</th>
              </tr>
            </thead>
            <tbody>
              {FORMULAS.map((f) => (
                <tr key={f.order} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
                  <td className="py-2.5 pr-2 text-center text-muted-foreground tabular-nums">{f.order}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium text-foreground">{f.criteria}</span>
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="inline-flex items-center justify-center min-w-[36px] h-5 rounded text-[10px] font-bold tabular-nums bg-muted">
                      ×{f.weight.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <code className="text-[10px] bg-muted/60 px-1.5 py-0.5 rounded text-muted-foreground leading-relaxed">
                      {f.source}
                    </code>
                  </td>
                  <td className="py-2.5 px-3 text-foreground/80 leading-relaxed">{f.formula}</td>
                  <td className="py-2.5 pl-3">
                    <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-medium leading-relaxed ${f.badgeColor}`}>
                      {f.example}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 rounded-lg bg-muted/30 p-3 text-[11px] leading-relaxed">
          <p className="font-semibold text-foreground mb-1">📐 산출 규칙</p>
          <ul className="space-y-0.5 text-muted-foreground">
            <li>• 각 항목 점수 × 가중치 = 가중점수, 합계가 종합 점수 (만점 {(totalWeight * 10).toFixed(0)}점)</li>
            <li>• AI는 p1_reference_scores를 앵커로 사용 (±2점 이내)</li>
            <li>• 사람이 교정한 점수는 보존되며, 재스코어링 시 ai_original_score만 갱신</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
