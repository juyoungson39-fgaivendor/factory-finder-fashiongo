import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, ExternalLink, ArrowLeft } from 'lucide-react';

export default function MatchingRunDetail() {
  const { run_id } = useParams<{ run_id: string }>();
  const [run, setRun] = useState<any | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!run_id) return;
    (async () => {
      setLoading(true);
      const { data: runRow } = await supabase
        .from('e2e_stage_runs' as any)
        .select('*')
        .eq('run_id', run_id)
        .maybeSingle();
      setRun(runRow);

      const { data: matches } = await supabase
        .from('matches' as any)
        .select('id, score, target_product_id, sourcing_product_id, factory_id')
        .eq('run_id', run_id)
        .order('score', { ascending: false });
      const list = (matches ?? []) as any[];
      const targetIds = Array.from(new Set(list.map((m) => m.target_product_id).filter(Boolean)));
      const sourcingIds = Array.from(new Set(list.map((m) => m.sourcing_product_id).filter(Boolean)));
      const factoryIds = Array.from(new Set(list.map((m) => m.factory_id).filter(Boolean)));
      const [tRes, sRes, fRes] = await Promise.all([
        targetIds.length ? supabase.from('target_products' as any).select('id, name, reference_image_urls, price_min_usd, price_max_usd, category').in('id', targetIds) : Promise.resolve({ data: [] }),
        sourcingIds.length ? supabase.from('sourcing_products' as any).select('id, title, image_url, price_usd_est, price_cny, source_platform, external_id, factory_id').in('id', sourcingIds) : Promise.resolve({ data: [] }),
        factoryIds.length ? supabase.from('factories' as any).select('id, name').in('id', factoryIds) : Promise.resolve({ data: [] }),
      ]);
      const tMap = new Map((tRes.data ?? []).map((x: any) => [x.id, x]));
      const sMap = new Map((sRes.data ?? []).map((x: any) => [x.id, x]));
      const fMap = new Map((fRes.data ?? []).map((x: any) => [x.id, x]));
      const grouped = new Map<string, any>();
      for (const m of list) {
        if (!m.target_product_id) continue;
        if (!grouped.has(m.target_product_id)) {
          grouped.set(m.target_product_id, { target: tMap.get(m.target_product_id), matches: [] });
        }
        grouped.get(m.target_product_id).matches.push({
          ...m,
          sourcing: sMap.get(m.sourcing_product_id),
          factory: fMap.get(m.factory_id),
        });
      }
      setRows(Array.from(grouped.values()));
      setLoading(false);
    })();
  }, [run_id]);

  const summary = (run?.summary as any) ?? {};

  return (
    <div className="container max-w-6xl py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link to="/"><Button size="sm" variant="ghost"><ArrowLeft className="w-4 h-4 mr-1" />대시보드</Button></Link>
        <h1 className="text-xl font-bold">매칭 실행 결과</h1>
        {run && (
          <Badge variant={run.status === 'completed' ? 'secondary' : 'default'} className="ml-2">
            {run.status}
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Run ID: {run_id}</p>

      {run && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">타겟 SKU</div>
            <div className="text-xl font-bold">{summary.targets ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">소싱 풀 SKU</div>
            <div className="text-xl font-bold">{summary.sourcing ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">매칭 쌍</div>
            <div className="text-xl font-bold">{summary.pairs ?? 0}</div>
          </Card>
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">평균 점수</div>
            <div className="text-xl font-bold">{(summary.avg_score ?? 0).toFixed(3)}</div>
          </Card>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">로딩 중...</p>}

      {!loading && rows.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          이 실행에 매칭 결과가 없습니다. {summary.reason && <span>(사유: {summary.reason})</span>}
        </Card>
      )}

      <div className="space-y-3">
        {rows.map((row, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3 mb-3">
              {row.target?.reference_image_urls?.[0] && (
                <img src={row.target.reference_image_urls[0]} alt="" className="w-20 h-24 object-cover rounded" />
              )}
              <div className="flex-1">
                <p className="font-medium">{row.target?.name ?? '—'}</p>
                <p className="text-xs text-muted-foreground">
                  {row.target?.category} · ${row.target?.price_min_usd ?? '—'} ~ ${row.target?.price_max_usd ?? '—'}
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground mt-2" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {row.matches.slice(0, 5).map((m: any) => (
                <div key={m.id} className="flex-shrink-0 w-36 border rounded-lg overflow-hidden">
                  {m.sourcing?.image_url ? (
                    <img src={m.sourcing.image_url} alt="" className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 bg-muted" />
                  )}
                  <div className="p-2 space-y-1">
                    <p className="text-[11px] font-medium truncate">{m.sourcing?.title ?? '—'}</p>
                    <p className="text-[10px]">
                      ${(m.sourcing?.price_usd_est ?? (m.sourcing?.price_cny ? m.sourcing.price_cny * 0.14 * 1.5 : 0)).toFixed(2)}
                    </p>
                    <Badge variant="secondary" className="text-[9px]">{m.factory?.name ?? '—'}</Badge>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-primary">{Number(m.score).toFixed(2)}</span>
                      {m.sourcing?.external_id && (
                        <a href={`https://detail.1688.com/offer/${m.sourcing.external_id}.html`} target="_blank" rel="noreferrer">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
