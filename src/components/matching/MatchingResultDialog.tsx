import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { ExternalLink, ArrowRight } from 'lucide-react';

export interface RunSummary {
  targets: number;
  sourcing: number;
  passing_factories: number;
  pairs: number;
  avg_score: number;
  threshold_factory: number;
  threshold_match: number;
  reason: 'ok' | 'no_targets' | 'no_factories' | 'no_sourcing' | 'no_matches';
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  runId: string | null;
  summary: RunSummary | null;
  onRerun?: (scoreThreshold: number) => void;
}

interface Row {
  target: any;
  matches: any[];
}

export function MatchingResultDialog({ open, onOpenChange, runId, summary, onRerun }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [threshold, setThreshold] = useState(summary?.threshold_match ?? 0.6);

  useEffect(() => {
    setThreshold(summary?.threshold_match ?? 0.6);
  }, [summary]);

  useEffect(() => {
    if (!open || !runId || summary?.reason !== 'ok') return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('matches' as any)
        .select('id, score, target_product_id, sourcing_product_id, factory_id')
        .eq('run_id', runId)
        .order('score', { ascending: false });
      const list = (data ?? []) as any[];
      const targetIds = Array.from(new Set(list.map((m) => m.target_product_id).filter(Boolean)));
      const sourcingIds = Array.from(new Set(list.map((m) => m.sourcing_product_id).filter(Boolean)));
      const factoryIds = Array.from(new Set(list.map((m) => m.factory_id).filter(Boolean)));
      const [tRes, sRes, fRes] = await Promise.all([
        targetIds.length ? supabase.from('target_products' as any).select('id, name, reference_image_urls, price_min_usd, price_max_usd').in('id', targetIds) : Promise.resolve({ data: [] }),
        sourcingIds.length ? supabase.from('sourcing_products' as any).select('id, title, image_url, price_usd_est, price_cny, source_platform, external_id, factory_id').in('id', sourcingIds) : Promise.resolve({ data: [] }),
        factoryIds.length ? supabase.from('factories' as any).select('id, name').in('id', factoryIds) : Promise.resolve({ data: [] }),
      ]);
      const tMap = new Map((tRes.data ?? []).map((x: any) => [x.id, x]));
      const sMap = new Map((sRes.data ?? []).map((x: any) => [x.id, x]));
      const fMap = new Map((fRes.data ?? []).map((x: any) => [x.id, x]));
      const grouped = new Map<string, Row>();
      for (const m of list) {
        if (!m.target_product_id) continue;
        if (!grouped.has(m.target_product_id)) {
          grouped.set(m.target_product_id, { target: tMap.get(m.target_product_id), matches: [] });
        }
        const s = sMap.get(m.sourcing_product_id);
        const f = fMap.get(m.factory_id);
        grouped.get(m.target_product_id)!.matches.push({ ...m, sourcing: s, factory: f });
      }
      if (!cancelled) {
        setRows(Array.from(grouped.values()).slice(0, 20));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, runId, summary]);

  const renderEmpty = () => {
    if (!summary) return null;
    if (summary.reason === 'no_targets') {
      return (
        <div className="py-10 text-center space-y-3">
          <p className="text-sm">타겟 상품을 윤 담당자가 채우는 중입니다.</p>
          <Link to="/target-products"><Button size="sm" variant="outline">Stage 2로 이동 →</Button></Link>
        </div>
      );
    }
    if (summary.reason === 'no_factories' || summary.reason === 'no_sourcing') {
      return (
        <div className="py-10 text-center space-y-2">
          <p className="text-sm">Alibaba API 연결 대기 중.</p>
          <p className="text-xs text-muted-foreground">점수 통과 공장: {summary.passing_factories}개 · 소싱 풀 SKU: {summary.sourcing}개</p>
        </div>
      );
    }
    if (summary.reason === 'no_matches') {
      return (
        <div className="py-10 space-y-4">
          <p className="text-sm text-center">임계값 {summary.threshold_match.toFixed(2)} 이상 매칭 없음.</p>
          <div className="max-w-md mx-auto space-y-2">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>매칭 임계값</span>
              <span>{threshold.toFixed(2)}</span>
            </div>
            <Slider value={[threshold]} min={0.3} max={0.8} step={0.05} onValueChange={(v) => setThreshold(v[0])} />
            <Button size="sm" className="w-full mt-2" onClick={() => onRerun?.(threshold)}>
              임계값 적용해 재실행
            </Button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>매칭 결과</DialogTitle>
        </DialogHeader>

        {summary && (
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground">타겟 SKU</div>
              <div className="text-xl font-bold">{summary.targets}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground">소싱 풀 SKU</div>
              <div className="text-xl font-bold">{summary.sourcing}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground">매칭 쌍</div>
              <div className="text-xl font-bold">{summary.pairs}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[10px] text-muted-foreground">평균 점수</div>
              <div className="text-xl font-bold">{summary.avg_score.toFixed(3)}</div>
            </Card>
          </div>
        )}

        {summary?.reason !== 'ok' ? renderEmpty() : (
          <div className="space-y-4">
            {loading && <p className="text-sm text-muted-foreground text-center py-6">로딩 중...</p>}
            {!loading && rows.map((row) => (
              <div key={row.target?.id ?? Math.random()} className="border rounded-lg p-3">
                <div className="flex items-start gap-3 mb-3">
                  {row.target?.reference_image_urls?.[0] && (
                    <img src={row.target.reference_image_urls[0]} alt="" className="w-16 h-20 object-cover rounded" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{row.target?.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      ${row.target?.price_min_usd ?? '—'} ~ ${row.target?.price_max_usd ?? '—'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground mt-2" />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {row.matches.slice(0, 5).map((m: any) => (
                    <div key={m.id} className="flex-shrink-0 w-32 border rounded-lg overflow-hidden">
                      {m.sourcing?.image_url ? (
                        <img src={m.sourcing.image_url} alt="" className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 bg-muted" />
                      )}
                      <div className="p-2 space-y-1">
                        <p className="text-[11px] font-medium truncate">{m.sourcing?.title ?? '—'}</p>
                        <p className="text-[10px]">${(m.sourcing?.price_usd_est ?? (m.sourcing?.price_cny ? m.sourcing.price_cny * 0.14 * 1.5 : 0)).toFixed(2)}</p>
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
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          {runId && (
            <Link to={`/matches/runs/${runId}`}>
              <Button variant="outline" size="sm">전체 매칭 페이지 →</Button>
            </Link>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)}>닫기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
