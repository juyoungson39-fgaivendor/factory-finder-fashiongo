import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, Calculator } from 'lucide-react';

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
    criteria: '자체 발송 능력',
    weight: 2.5,
    source: 'alibaba_detected (boolean)',
    formula: 'true → 7.0 / false → 3.0',
    example: 'Alibaba.com 미등록 → 3.0',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    criteria: '상품 이미지 품질',
    weight: 1.0,
    source: '(기본값 / Claude Vision 평가 시 갱신)',
    formula: 'Grade A=9 / B=7 / C=5 (현재 기본값 7.0)',
    example: 'Vision 스킵 시 Grade B = 7.0',
    badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
  },
  {
    criteria: 'MOQ 유연성',
    weight: 1.5,
    source: 'raw_crawl_data.signals (混批·一件代发·OEM/ODM)',
    formula: 'true 시그널 1개당 +2.0 (기본 4.0, 최대 10)',
    example: '3개 시그널 → 4 + 6 = 10.0 (혹은 7.0)',
    badgeColor: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  {
    criteria: '납기 신뢰도',
    weight: 1.5,
    source: 'raw_years_in_business + raw_return_rate',
    formula: '연수 × 0.5 + 재구매율(%) × 0.05 (최대 10)',
    example: '12년 × 0.5 + 62% × 0.05 = 9.1',
    badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  {
    criteria: '커뮤니케이션',
    weight: 1.0,
    source: 'raw_service_score (1688 服务分, 0~5)',
    formula: '≥3.0 → 10.0 / 2.0~3.0 → 7.0 / <2.0 → 4.0',
    example: '服务分 3.5 → 10.0',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    criteria: '상품 다양성',
    weight: 1.5,
    source: 'raw_product_count (등록 상품 건수)',
    formula: '≥500 → 10.0 / 100~499 → 7.0 / <100 → 4.0',
    example: '1,058건 → 10.0',
    badgeColor: 'bg-pink-50 text-pink-700 border-pink-200',
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
            <span>AI Phase 1 스코어링 매칭 공식</span>
            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200">
              1688 자동 평가
            </Badge>
          </CardTitle>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Calculator className="w-3 h-3" />
            <span>총 가중합 만점: <strong className="text-foreground">{totalWeight * 10}점</strong></span>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          1688 크롤링 원본 데이터(<code className="text-[10px] bg-muted px-1 py-0.5 rounded">raw_crawl_data</code>)를 6개 평가 항목으로 자동 변환하는 규칙입니다.
          공장 상세 페이지 「🤖 AI Phase 1 스코어」 카드의 "근거" 텍스트가 이 공식으로 산출됩니다.
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

        <div className="mt-4 pt-3 border-t border-border/40 grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="font-semibold text-foreground mb-1">📐 Phase 1 평균</p>
            <p className="text-muted-foreground leading-relaxed">
              6개 항목 점수의 단순 평균 (가중치 미적용)
            </p>
          </div>
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="font-semibold text-foreground mb-1">⚖️ Phase 1 가중합</p>
            <p className="text-muted-foreground leading-relaxed">
              <code className="text-[10px] bg-background px-1 py-0.5 rounded">Σ(점수 × 가중치)</code> · 만점 {totalWeight * 10}점
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
