import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  SourceableMatchedList,
  type MatchedItem,
  STATUS_MAP,
} from '@/components/matching/SourceableMatchedList';

// ─── 상태 탭 (DB enum 4개) ────────────────────────────────────────────
type StatusKey = 'pending_confirm' | 'approved' | 'rejected' | 'active';

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'pending_confirm', label: '컨펌대기' },
  { key: 'approved',        label: '승인'     },
  { key: 'rejected',        label: '거절'     },
  { key: 'active',          label: '활성'     },
];

// ─── 소싱상품 select 절 ───────────────────────────────────────────────
const PRODUCT_SELECT = `
  id,
  item_name,
  item_name_en,
  image_url,
  images,
  unit_price_usd,
  category,
  fg_category,
  vendor_name,
  factory_id,
  factory:factories(id, name, country, city)
`.trim();

const TREND_SELECT = `
  id,
  source_data,
  trend_keywords,
  primary_category,
  lifecycle_stage
`.trim();

// ─── 페이지 컴포넌트 ──────────────────────────────────────────────────
export default function Matches() {
  const qc = useQueryClient();

  // 기본 탭: pending_confirm
  const [status, setStatus] = useState<StatusKey>('pending_confirm');

  const handleTabChange = (key: StatusKey) => setStatus(key);

  // ── 카운트 조회 ────────────────────────────────────────────────────
  const { data: counts = {} as Record<string, number> } = useQuery({
    queryKey: ['tsm-counts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('trend_sourceable_matches')
        .select('status');
      const c: Record<string, number> = {};
      (data ?? []).forEach((r: { status: string }) => {
        c[r.status] = (c[r.status] || 0) + 1;
      });
      return c;
    },
  });

  // ── 목록 조회 ──────────────────────────────────────────────────────
  const { data: items = [], isFetching } = useQuery({
    queryKey: ['tsm-list', status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, status, created_at, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`
        )
        .eq('status', status)
        .order('match_score', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as MatchedItem[];
    },
  });

  // ── 캐시 무효화 ────────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
  }, [qc]);

  // ── 상태 변경 (단건, 통합) ──────────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    const { error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus })
      .eq('id', id);
    if (error) {
      toast.error('상태 변경 실패: ' + error.message);
      return;
    }
    toast.success('상태가 변경됐습니다.');
    refetchAll();
  }, [refetchAll]);

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── 헤더 ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">소싱 매칭 결과</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            트렌드 분석 결과와 소싱 가능 상품 간의 매칭 현황
          </p>
        </div>
      </div>

      {/* ── 상태 탭 ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-0 rounded-lg border border-border bg-card overflow-hidden w-fit">
        {STATUS_TABS.map((tab) => {
          const count    = counts[tab.key] ?? 0;
          const isActive = status === tab.key;
          const cfg      = STATUS_MAP[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-r border-border last:border-r-0',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1',
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : cn(cfg?.cls, 'scale-90'),
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 건수 표시 ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-h-[24px]">
        <span className="text-[11px] text-muted-foreground tabular-nums">
          총 {items.length}건
          {isFetching && <span className="ml-1 opacity-60">새로고침 중...</span>}
        </span>
      </div>

      {/* ── 매칭 리스트 ─────────────────────────────────────────── */}
      <SourceableMatchedList
        items={items}
        loading={isFetching && items.length === 0}
        currentStatus={status}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
}
