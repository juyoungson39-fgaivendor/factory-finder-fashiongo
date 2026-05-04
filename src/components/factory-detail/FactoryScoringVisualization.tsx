import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip as RTooltip,
} from 'recharts';
import { CheckCircle2, AlertTriangle, XCircle, Star } from 'lucide-react';

type Factory = Record<string, any>;

const toPct = (v: number | null | undefined, max = 10) =>
  v == null ? null : Math.max(0, Math.min(100, (Number(v) / max) * 100));

const chipColor = (v: number | null | undefined) => {
  if (v == null) return 'bg-muted text-muted-foreground border-border';
  const n = Number(v);
  if (n >= 7) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (n >= 4) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-rose-50 text-rose-700 border-rose-200';
};

const chipIcon = (v: number | null | undefined) => {
  if (v == null) return <XCircle className="w-3.5 h-3.5" />;
  const n = Number(v);
  if (n >= 7) return <CheckCircle2 className="w-3.5 h-3.5" />;
  if (n >= 4) return <AlertTriangle className="w-3.5 h-3.5" />;
  return <XCircle className="w-3.5 h-3.5" />;
};

const barColor = (pct: number) => {
  if (pct >= 70) return 'bg-emerald-500';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-muted-foreground/40';
};

interface Props {
  factory: Factory;
}

export default function FactoryScoringVisualization({ factory }: Props) {
  const aiOrig = (factory.ai_original_data ?? {}) as Record<string, any>;
  const [visitOpen, setVisitOpen] = useState(false);

  // [1] Status chips
  const chips = [
    { key: 'inventory', label: '재고 보유 여부', value: factory.p0_inventory_score, desc: '자체 보유 재고 수준' },
    { key: 'self_shipping', label: '자체 발송 능력', value: factory.p1_self_shipping_score, desc: 'Alibaba.com 등록 / 자체 출고 가능 여부' },
    { key: 'other_platforms', label: '타 플랫폼 운영', value: factory.p3_other_platforms_score, desc: '타 글로벌 플랫폼 운영 경험' },
    { key: 'compliance', label: '인증·컴플라이언스', value: factory.p2_compliance_score, desc: '인증서·컴플라이언스 보유 정도' },
  ];

  // [2] Radar 6 (AI vs Human)
  const radarAxes = [
    { key: 'price', label: '가격 경쟁력', col: 'p1_price_score' },
    { key: 'moq', label: 'MOQ 유연성', col: 'p1_moq_score' },
    { key: 'lead', label: '납기 신뢰도', col: 'p1_lead_time_score' },
    { key: 'variety', label: '상품 다양성', col: 'p1_variety_score' },
    { key: 'comm', label: '커뮤니케이션', col: 'p1_communication_score' },
    { key: 'repurchase', label: '재구매율', col: 'repurchase_rate', max: 100 },
  ];

  const radarData = radarAxes.map((ax) => {
    const max = ax.max ?? 10;
    const cur = factory[ax.col];
    const ai = aiOrig[ax.col];
    return {
      axis: ax.label,
      human: toPct(cur, max) ?? 0,
      ai: toPct(ai ?? cur, max) ?? 0,
      humanRaw: cur,
      aiRaw: ai ?? cur,
      max,
    };
  });
  const hasRadarData = radarData.some((d) => d.human > 0 || d.ai > 0);

  // [3] Horizontal bars
  const bars = [
    { label: '북미 타겟 적합', value: toPct(factory.p0_us_target_score) },
    { label: '상품 이미지 품질', value: toPct(factory.p1_image_quality_score) },
    { label: '결제 조건', value: toPct(factory.p2_payment_score) },
    { label: '반품·교환 정책', value: factory.raw_return_rate != null ? Math.max(0, 100 - Number(factory.raw_return_rate)) : null },
    { label: '패키징·브랜딩', value: toPct(factory.p2_packaging_score) },
  ]
    .filter((b) => b.value != null)
    .sort((a, b) => (b.value as number) - (a.value as number));

  // [4] Visit notes
  const visitNotes = (factory.visit_notes ?? null) as Record<string, any> | null;
  const showVisit = factory.visited_in_person === true && visitNotes;

  return (
    <div className="space-y-4">
      {/* [1] Status chips */}
      <TooltipProvider delayDuration={150}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {chips.map((c) => (
            <Tooltip key={c.key}>
              <TooltipTrigger asChild>
                <div
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 cursor-help ${chipColor(c.value)}`}
                >
                  {chipIcon(c.value)}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium truncate">{c.label}</p>
                    <p className="text-[10px] opacity-80">
                      {c.value != null ? `${Number(c.value).toFixed(1)} / 10` : '데이터 없음'}
                    </p>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                {c.desc}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* [2] + [3] */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              핵심 6 — AI vs 사람 평가
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hasRadarData ? (
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickCount={5} />
                  <Radar name="V1.0 AI" dataKey="ai" stroke="hsl(217, 70%, 55%)" fill="hsl(217, 70%, 55%)" fillOpacity={0.12} strokeWidth={1.5} strokeDasharray="4 4" />
                  <Radar name="사람 평가" dataKey="human" stroke="hsl(152, 60%, 45%)" fill="hsl(152, 60%, 45%)" fillOpacity={0.2} strokeWidth={2.5} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <RTooltip
                    content={({ payload }) => {
                      if (!payload?.length) return null;
                      const d: any = payload[0].payload;
                      return (
                        <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-md">
                          <p className="text-xs font-medium">{d.axis}</p>
                          <p className="text-xs text-blue-500">AI: {d.aiRaw != null ? Number(d.aiRaw).toFixed(1) : '—'} / {d.max}</p>
                          <p className="text-xs text-green-600">사람: {d.humanRaw != null ? Number(d.humanRaw).toFixed(1) : '—'} / {d.max}</p>
                        </div>
                      );
                    }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-muted-foreground py-12 text-center">아직 점수 데이터가 없습니다</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              부가 평가
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bars.length > 0 ? (
              <div className="space-y-3">
                {bars.map((b) => {
                  const pct = b.value as number;
                  return (
                    <div key={b.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{b.label}</span>
                        <span className="tabular-nums text-muted-foreground">{pct.toFixed(0)}</span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor(pct)}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-12 text-center">부가 평가 데이터가 없습니다</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* [4] Visit notes */}
      {showVisit && (
        <>
          <Card
            className="cursor-pointer transition-colors hover:bg-muted/40"
            onClick={() => setVisitOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setVisitOpen(true); } }}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
                📝 출장 노트
                {visitNotes!.met_at && (
                  <span className="text-[10px] text-muted-foreground">방문일: {visitNotes!.met_at}</span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground normal-case tracking-normal">자세히 보기 →</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-3 text-xs">
                {visitNotes!.sample_quality != null && (
                  <span className="inline-flex items-center gap-1">
                    샘플 품질:
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`w-3 h-3 ${i < Number(visitNotes!.sample_quality) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </span>
                )}
                {visitNotes!.moq_negotiated && (
                  <span className="px-2 py-1 rounded-full bg-muted">MOQ 협상: <strong>{visitNotes!.moq_negotiated}</strong></span>
                )}
                {visitNotes!.responsiveness && (
                  <span className="px-2 py-1 rounded-full bg-muted">응대: <strong>{visitNotes!.responsiveness}</strong></span>
                )}
                {visitNotes!.payment_terms && (
                  <span className="px-2 py-1 rounded-full bg-muted">결제: <strong>{visitNotes!.payment_terms}</strong></span>
                )}
                {visitNotes!.contact_name && (
                  <span className="px-2 py-1 rounded-full bg-muted">담당: <strong>{visitNotes!.contact_name}</strong></span>
                )}
              </div>
            </CardContent>
          </Card>

          <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base">📝 출장 노트 상세</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                <div>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">추출 항목</p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { k: '샘플 품질', v: visitNotes!.sample_quality != null ? `${visitNotes!.sample_quality} / 5` : null },
                      { k: 'MOQ 협상', v: visitNotes!.moq_negotiated },
                      { k: '응대', v: visitNotes!.responsiveness },
                      { k: '결제 조건', v: visitNotes!.payment_terms },
                      { k: '담당자', v: visitNotes!.contact_name },
                      { k: '방문일 (met_at)', v: visitNotes!.met_at },
                    ].map((row) => (
                      <div key={row.k} className="flex flex-col rounded-lg border bg-muted/30 px-3 py-2">
                        <span className="text-[10px] text-muted-foreground">{row.k}</span>
                        <span className="font-medium">{row.v ?? <span className="text-muted-foreground">—</span>}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">JSONB 원문 (visit_notes)</p>
                  <pre className="text-[11px] bg-muted/50 border rounded-lg p-3 overflow-x-auto leading-relaxed">
{JSON.stringify(visitNotes, null, 2)}
                  </pre>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
