import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Props {
  oemScore?: number | null;
  highlight?: boolean;
  verifiedReportData?: any;
  capabilities?: string[] | null;
}

export default function OemSuitabilityCard({ oemScore, highlight, verifiedReportData: vrd, capabilities }: Props) {
  const mainCats = vrd?.main_categories ?? [];
  const production = vrd?.production ?? null;
  const qc = vrd?.quality_control ?? null;
  const rd = vrd?.rd ?? null;
  const basic = vrd?.basic_information ?? null;

  return (
    <Card className={`rounded-xl ${highlight ? 'border-primary/60 ring-1 ring-primary/30' : ''}`}>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          🏭 생산 외주 적합도
        </CardTitle>
        <Badge variant={highlight ? 'default' : 'outline'}>OEM {oemScore ?? '–'}/100</Badge>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {capabilities?.length ? (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">역량</p>
            <div className="flex flex-wrap gap-1">
              {capabilities.map((c, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>
              ))}
            </div>
          </div>
        ) : null}

        {Array.isArray(mainCats) && mainCats.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Main Category</p>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-1 pr-2">카테고리</th>
                    <th className="text-right py-1 px-2">최대 생산</th>
                    <th className="text-right py-1 px-2">샘플 lead</th>
                    <th className="text-right py-1 px-2">평균 lead</th>
                    <th className="text-right py-1 pl-2">보증</th>
                  </tr>
                </thead>
                <tbody>
                  {mainCats.map((c: any, i: number) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1 pr-2">{c.category ?? '–'}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{c.max_capacity ?? '–'}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{c.sample_lead_days ?? '–'}</td>
                      <td className="py-1 px-2 text-right tabular-nums">{c.avg_lead_days ?? '–'}</td>
                      <td className="py-1 pl-2 text-right">{c.warranty ?? '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {production && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">생산 라인</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { k: '라인 수', v: production.lines },
                { k: '관리자', v: production.managers },
                { k: '작업자', v: production.workers },
                { k: 'QC 검사원', v: production.qc_inspectors },
              ].map((r) => (
                <div key={r.k} className="rounded-lg border bg-muted/30 px-2 py-1.5">
                  <p className="text-[10px] text-muted-foreground">{r.k}</p>
                  <p className="font-medium tabular-nums">{r.v ?? '–'}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {qc && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">QC 정보</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">QA/QC 인원</p>
                <p className="font-medium">{qc.qa_qc_count ?? '–'}</p>
              </div>
              {qc.test_methods && (
                <div className="rounded-lg border bg-muted/30 px-2 py-1.5 col-span-2">
                  <p className="text-[10px] text-muted-foreground">검사 방법</p>
                  <p className="font-medium">{Array.isArray(qc.test_methods) ? qc.test_methods.join(', ') : String(qc.test_methods)}</p>
                </div>
              )}
              {qc.test_machines && (
                <div className="rounded-lg border bg-muted/30 px-2 py-1.5 col-span-3">
                  <p className="text-[10px] text-muted-foreground">테스트 기계</p>
                  <p className="font-medium">{Array.isArray(qc.test_machines) ? qc.test_machines.join(', ') : String(qc.test_machines)}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {rd && (
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
              <p className="text-[10px] text-muted-foreground">R&D 인원</p>
              <p className="font-medium">{rd.staff_count ?? '–'}</p>
            </div>
            {rd.design_capabilities && (
              <div className="rounded-lg border bg-muted/30 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">디자인 역량</p>
                <p className="font-medium">{Array.isArray(rd.design_capabilities) ? rd.design_capabilities.join(', ') : String(rd.design_capabilities)}</p>
              </div>
            )}
          </div>
        )}

        {basic && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2 border-t border-border/50">
            {[
              { k: '면적', v: basic.factory_area ?? basic.area },
              { k: '총 직원', v: basic.total_employees ?? basic.employees },
              { k: '등록 자본', v: basic.registered_capital ?? basic.capital },
            ].map((r) => (
              <div key={r.k}>
                <p className="text-[10px] text-muted-foreground">{r.k}</p>
                <p className="font-medium">{r.v ?? '–'}</p>
              </div>
            ))}
          </div>
        )}

        {!vrd && (
          <p className="text-muted-foreground text-center py-6">verified_report_data 없음 — 재크롤 필요</p>
        )}
      </CardContent>
    </Card>
  );
}
