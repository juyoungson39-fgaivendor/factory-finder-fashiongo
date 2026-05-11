/**
 * MatchingResultDialog
 * ─────────────────────────────────────────────────────────────────────
 * 대시보드 3단계 카드 클릭 시 노출되는 소싱 매칭 현황 팝업.
 * trend_sourceable_matches 테이블에서 직접 통계와 상위 5건을 fetch 한다.
 *
 * 구 run_id / summary / onRerun 기반 코드는 모두 제거.
 * RunSummary 타입만 legacy export 유지 (AngelAgentPanel 참조용).
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { STATUS_MAP, StatusBadge } from '@/components/matching/SourceableMatchedList';

// ── Legacy type (AngelAgentPanel 의 matchSummary 에서 참조) ──────────
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

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

// ── 점수 컬러 ─────────────────────────────────────────────────────────
function scoreStyle(s: number) {
  if (s >= 0.75) return { text: 'text-green-600', bar: 'bg-green-500' };
  if (s >= 0.55) return { text: 'text-amber-600', bar: 'bg-amber-400' };
  return { text: 'text-red-500', bar: 'bg-red-400' };
}

// ── 상품 썸네일 셀 ────────────────────────────────────────────────────
const ImgCell = ({ src }: { src?: string | null }) => {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return <div className="w-14 h-[72px] bg-muted rounded flex-shrink-0" />;
  }
  return (
    <img
      src={src}
      alt=""
      className="w-14 h-[72px] object-cover rounded flex-shrink-0"
      onError={() => setErr(true)}
    />
  );
};

// ── 상태 탭 순서 ─────────────────────────────────────────────────────
const STATUS_TABS_ORDER = ['candidate', 'pending_confirm', 'approved', 'rejected', 'active'] as const;

// ─────────────────────────────────────────────────────────────────────
export function MatchingResultDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  // ── 통계 fetch ────────────────────────────────────────────────────
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['tsm-dialog-stats'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select('id, match_score, status, trend_analysis_id, sourceable_product_id');
      if (error) throw error;

      const rows = data ?? [];
      const targetSku   = new Set(rows.map((r) => r.trend_analysis_id)).size;
      const sourcingPool = new Set(rows.map((r) => r.sourceable_product_id)).size;
      const matchPairs  = rows.length;
      const avgScore    = rows.length > 0
        ? rows.reduce((sum, r) => sum + (r.match_score ?? 0), 0) / rows.length
        : 0;
      const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});

      return { targetSku, sourcingPool, matchPairs, avgScore, statusCounts };
    },
  });

  // ── 상위 5건 fetch ────────────────────────────────────────────────
  const { data: topMatches = [] } = useQuery({
    queryKey: ['tsm-dialog-top5'],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('trend_sourceable_matches')
        .select(`
          id, match_score, status,
          sourceable_product:sourceable_products(
            id, item_name, item_name_en, image_url, unit_price_usd
          ),
          trend:trend_analyses(
            id, source_data, trend_keywords
          )
        `)
        .order('match_score', { ascending: false })
        .limit(5);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []) as any[];
    },
  });

  // ── 4개 통계 카드 정의 ─────────────────────────────────────────────
  const STAT_CARDS = [
    { label: '트렌드 (타겟 SKU)',  value: stats?.targetSku?.toLocaleString()    ?? '—' },
    { label: '소싱상품 (풀 SKU)',  value: stats?.sourcingPool?.toLocaleString()  ?? '—' },
    { label: '매칭 쌍',           value: stats?.matchPairs?.toLocaleString()    ?? '—' },
    { label: '평균 점수',          value: stats?.avgScore != null ? stats.avgScore.toFixed(3) : '—' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>소싱 매칭 현황</DialogTitle>
        </DialogHeader>

        {/* ── 4개 통계 카드 ──────────────────────────────────────── */}
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="p-3 space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16" />
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {STAT_CARDS.map(({ label, value }) => (
              <Card key={label} className="p-3">
                <div className="text-[10px] text-muted-foreground">{label}</div>
                <div className="text-xl font-bold tabular-nums">{value}</div>
              </Card>
            ))}
          </div>
        )}

        {/* ── 상태별 미니 카운트 ─────────────────────────────────── */}
        {!statsLoading && stats?.statusCounts && (
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_TABS_ORDER.map((sk) => {
              const cnt = stats.statusCounts[sk] ?? 0;
              if (cnt === 0) return null;
              const cfg = STATUS_MAP[sk];
              return (
                <span
                  key={sk}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                    cfg.cls,
                  )}
                >
                  {cfg.label} {cnt.toLocaleString()}
                </span>
              );
            })}
          </div>
        )}

        {/* ── 상위 5건 미리보기 ──────────────────────────────────── */}
        {topMatches.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">상위 매칭 5건</p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {topMatches.map((m: any) => {
              const sd    = (m.trend?.source_data ?? {}) as Record<string, string>;
              const tName = sd.trend_name ?? sd.article_title ?? '—';
              const sp    = m.sourceable_product;
              const spName = sp?.item_name_en ?? sp?.item_name ?? '—';
              const pct    = Math.round(m.match_score * 100);
              const sty    = scoreStyle(m.match_score);

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card"
                >
                  <ImgCell src={sp?.image_url} />
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-[10px] text-muted-foreground truncate">{tName}</p>
                    <p className="text-xs font-medium text-foreground truncate">{spName}</p>
                    {sp?.unit_price_usd != null && (
                      <p className="text-xs font-semibold">${Number(sp.unit_price_usd).toFixed(2)}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={cn('text-xs font-bold', sty.text)}>{pct}%</span>
                      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full', sty.bar)} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              );
            })}
          </div>
        )}

        {/* ── 푸터 ──────────────────────────────────────────────── */}
        <DialogFooter className="pt-2">
          <Button
            size="sm"
            onClick={() => { onOpenChange(false); navigate('/matches'); }}
          >
            전체 매칭 페이지 →
          </Button>
          <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
