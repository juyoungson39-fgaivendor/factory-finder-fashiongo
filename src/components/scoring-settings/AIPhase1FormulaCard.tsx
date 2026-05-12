import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Calculator, Layers, Package, Factory } from 'lucide-react';

type Formula = {
  criteria: string;
  weight: number;
  source: string;
  formula: string;
  example: string;
  badgeColor: string;
};

const FORMULAS: Formula[] = [
  {
    criteria: '국제 거래 신뢰도',
    weight: 2.0,
    source: 'trade_assurance / verified_by / gold_supplier_years / payment_methods / main_markets',
    formula: 'TA +4 · Verified +2 · Gold ≥5년 +1.5 (≥3년 +1) · 결제 ≥4종 +0.5 · 시장 ≥10개 +1 (≥5개 +0.5)',
    example: '모든 조건 만족 → 9.0',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    criteria: '상품 이미지 품질',
    weight: 2.0,
    source: 'Product Quality 별점 (4축 평가 중)',
    formula: '별점 ≥4.8 → 9 / ≥4.5 → 7 / 그 외 → 7 (Vision 미적용 시 기본값)',
    example: '4.9 → 9.0',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  {
    criteria: 'MOQ 유연성',
    weight: 1.5,
    source: 'capabilities / main_categories',
    formula: 'Full Custom +2 · OEM/ODM +2 · Drawing-based +1 · 카테고리 ≥3 +1 (기본 4)',
    example: '4개 시그널 → 10.0',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    criteria: '납기 신뢰도',
    weight: 1.5,
    source: 'on_time_delivery_rate / avg_lead_days / On-time Shipment 별점',
    formula: 'OTD ≥98% → 10 / ≥95% → 8 / ≥90% → 6 / ≥80% → 4 + 별점·avg_lead 가산',
    example: '98.5% → 10.0',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    criteria: '커뮤니케이션',
    weight: 1.0,
    source: 'response_time_hours / Supplier Service 별점 / languages',
    formula: 'resp ≤3h → 10 / ≤6h → 8 / ≤12h → 6 / ≤24h → 4 + Service별점·English 가산',
    example: '1h + Service 4.8 → 10.0',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    criteria: '상품 다양성',
    weight: 1.0,
    source: 'sub_category_count / production_tab_count / has_new_arrivals_tab / has_promotion_tab / R&D 인원',
    formula: '카테고리 ≥10 → 8 + 생산탭 ≥10 +2 + NewArrivals +0.5 + Promotion +0.5 + R&D ≥2명 +1',
    example: '10+12+Promotion → 10.0',
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
  },
  {
    criteria: '거래량',
    weight: 1.0,
    source: 'factories.transaction_count',
    formula: '≥500 → 10 / ≥200 → 8 / ≥100 → 6 / ≥50 → 4 / ≥20 → 2 / <20 → 1 / null → 0 (데이터 없음)',
    example: '1018건 → 10.0',
    badgeColor: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  },
  {
    criteria: '가격 경쟁력',
    weight: 1.5,
    source: 'sourcing_products(price_usd_est, price_cny, title) vs target_products(category 평균가)',
    formula: 'Base(0~7): ratio<0.7→7 / <0.9→6 / <1.1→4 / <1.3→2 / ≥1.3→1 · 가산(0~3): 30pc/10pc 비율 <0.85→+3 / <0.92→+2 / <0.97→+1 / 정보없음→+1.5',
    example: 'Dress 평균 $15 대비 $11 (-26.7%, 7점) + 30pc -8% (+1.5점) = 8.5/10',
    badgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
  },
];

const STOCK_WEIGHTS = [
  ['국제 거래 신뢰도', 3],
  ['상품 이미지 품질', 2],
  ['납기 신뢰도', 2],
  ['커뮤니케이션', 1],
  ['상품 다양성', 1],
  ['MOQ 유연성', 0.5],
] as const;

const OEM_WEIGHTS = [
  ['MOQ 유연성', 3],
  ['납기 신뢰도', 2],
  ['상품 다양성', 2],
  ['커뮤니케이션', 1.5],
  ['상품 이미지 품질', 1],
  ['국제 거래 신뢰도', 0.5],
] as const;

export default function AIPhase1FormulaCard() {
  const totalWeight = FORMULAS.reduce((s, f) => s + f.weight, 0);

  return (
    <>
      {/* Top Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="border-purple-200/60 bg-purple-50/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Bot className="w-3.5 h-3.5 text-purple-600" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-purple-700">Phase 1</p>
            </div>
            <p className="text-sm font-bold">6축 (Alibaba 자동)</p>
            <p className="text-[11px] text-muted-foreground">만점 90점</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200/60 bg-blue-50/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">부가 평가</p>
            </div>
            <p className="text-sm font-bold">12축 (자동 9 + 수기 3)</p>
            <p className="text-[11px] text-muted-foreground">만점 165점</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200/60 bg-emerald-50/30">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-3.5 h-3.5 text-emerald-600" />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">Two-Track</p>
            </div>
            <p className="text-sm font-bold">Stock + OEM</p>
            <p className="text-[11px] text-muted-foreground">0~100 환산</p>
          </CardContent>
        </Card>
      </div>

      {/* Phase 1 Formula */}
      <Card className="mb-4 border-purple-200/60 bg-gradient-to-br from-purple-50/30 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-purple-100 flex items-center justify-center">
                <Bot className="w-4 h-4 text-purple-600" />
              </div>
              <span>AI Phase 1 스코어링 매칭 공식</span>
              <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
                Alibaba 자동 평가
              </Badge>
            </CardTitle>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <Calculator className="w-3 h-3" />
              <span>총 가중합 만점: <strong className="text-foreground">{totalWeight * 10}점</strong></span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            Alibaba.com 공급사 데이터를 6개 평가 항목으로 자동 변환하는 규칙. 공장 상세 페이지의 「🤖 AI Phase 1 스코어 (Alibaba 기준)」 카드 산출 근거.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto -mx-6 px-6">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="text-left py-2 pr-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">평가 항목</th>
                  <th className="text-center py-2 px-2 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground w-16">가중치</th>
                  <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">소스 필드</th>
                  <th className="text-left py-2 px-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">변환 공식</th>
                  <th className="text-left py-2 pl-3 font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">검증 예시</th>
                </tr>
              </thead>
              <tbody>
                {FORMULAS.map((f) => (
                  <tr key={f.criteria} className="border-b border-border/30 last:border-0 hover:bg-muted/20">
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
        </CardContent>
      </Card>

      {/* Two-Track */}
      <Card className="mb-6 border-emerald-200/60 bg-gradient-to-br from-emerald-50/30 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center">
              <Package className="w-4 h-4 text-emerald-700" />
            </div>
            <span>Two-Track 점수 (Stock / OEM)</span>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
            같은 6축 점수를 use case별 가중치로 0~100점 환산. 머천다이저가 재고 구매 vs 생산 외주 중 어느 쪽이 적합한지 판단.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Stock */}
            <div className="rounded-lg border border-blue-200/60 bg-blue-50/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-3.5 h-3.5 text-blue-600" />
                <p className="text-xs font-semibold text-blue-700">Stock Score (재고 구매 적합도)</p>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {STOCK_WEIGHTS.map(([axis, w]) => (
                    <tr key={axis} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5">{axis}</td>
                      <td className="py-1.5 text-right font-mono font-semibold tabular-nums">×{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* OEM */}
            <div className="rounded-lg border border-amber-200/60 bg-amber-50/20 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Factory className="w-3.5 h-3.5 text-amber-700" />
                <p className="text-xs font-semibold text-amber-700">OEM Score (생산 외주 적합도)</p>
              </div>
              <table className="w-full text-xs">
                <tbody>
                  {OEM_WEIGHTS.map(([axis, w]) => (
                    <tr key={axis} className="border-b border-border/30 last:border-0">
                      <td className="py-1.5">{axis}</td>
                      <td className="py-1.5 text-right font-mono font-semibold tabular-nums">×{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-muted/30 p-3 text-[11px] leading-relaxed">
            <p className="font-semibold text-foreground mb-1">📐 판정 규칙 (decideUseCase)</p>
            <ul className="space-y-0.5 text-muted-foreground">
              <li>• Stock ≥70 AND OEM ≥70 → <strong>둘 다 적합</strong></li>
              <li>• Stock − OEM ≥10 → <strong>재고 구매 추천</strong></li>
              <li>• OEM − Stock ≥10 → <strong>생산 외주 추천</strong></li>
              <li>• 그 외 → <strong>둘 다 적합</strong></li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
