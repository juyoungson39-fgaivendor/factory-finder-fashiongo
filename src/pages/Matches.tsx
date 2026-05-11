import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  SourceableMatchedList,
  type MatchedItem,
  STATUS_MAP,
} from '@/components/matching/SourceableMatchedList';

// ─── 상태 탭 ──────────────────────────────────────────────────────────
type StatusKey = 'candidate' | 'pending_confirm' | 'approved' | 'rejected' | 'active';

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'candidate',       label: '후보'     },
  { key: 'pending_confirm', label: '컨펌대기' },
  { key: 'approved',        label: '승인'     },
  { key: 'rejected',        label: '거절'     },
  { key: 'active',          label: '활성'     },
];

// ─── 소싱상품 select 절 (Supabase nested) ────────────────────────────
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

  const [status,      setStatus]      = useState<StatusKey>('candidate');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy,    setBulkBusy]    = useState(false);

  // 탭 변경 시 선택 초기화
  const handleTabChange = (key: StatusKey) => {
    setStatus(key);
    setSelectedIds(new Set());
  };

  // ── 카운트 조회 (전체 status 한 번에) ──────────────────────────────
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

  // ── 매칭 목록 조회 ────────────────────────────────────────────────
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

  // ── 캐시 무효화 헬퍼 ──────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
  }, [qc]);

  // ── 단건: candidate → pending_confirm ────────────────────────────
  const handleMoveToPending = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'pending_confirm' })
      .eq('id', id);
    if (error) { toast.error('처리 실패: ' + error.message); return; }
    toast.success('컨펌 큐에 추가됐습니다.');
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    refetchAll();
  }, [refetchAll]);

  // ── 단건: pending_confirm → approved ─────────────────────────────
  const handleApprove = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'approved' })
      .eq('id', id);
    if (error) { toast.error('승인 실패: ' + error.message); return; }
    toast.success('승인 처리됐습니다.');
    refetchAll();
  }, [refetchAll]);

  // ── 단건: pending_confirm → rejected ─────────────────────────────
  const handleReject = useCallback(async (id: string, reason?: string) => {
    const { error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'rejected', ...(reason ? { rejection_reason: reason } : {}) })
      .eq('id', id);
    if (error) { toast.error('거절 실패: ' + error.message); return; }
    toast.success('거절 처리됐습니다.');
    refetchAll();
  }, [refetchAll]);

  // ── 단건: rejected → candidate ───────────────────────────────────
  const handleRecandidate = useCallback(async (id: string) => {
    const { error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'candidate' })
      .eq('id', id);
    if (error) { toast.error('처리 실패: ' + error.message); return; }
    toast.success('후보로 재등록됐습니다.');
    refetchAll();
  }, [refetchAll]);

  // ── 벌크: candidate → pending_confirm ────────────────────────────
  const handleBulkMoveToPending = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from('trend_sourceable_matches')
        .update({ status: 'pending_confirm' })
        .in('id', [...selectedIds]);
      if (error) throw error;
      toast.success(`${selectedIds.size}건을 컨펌 큐로 이동했습니다.`);
      setSelectedIds(new Set());
      refetchAll();
    } catch (e: unknown) {
      toast.error('일괄 처리 실패: ' + (e instanceof Error ? e.message : '알 수 없는 오류'));
    } finally {
      setBulkBusy(false);
    }
  };

  // ── 선택 토글 ─────────────────────────────────────────────────────
  const handleToggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const handleToggleAll = (ids: string[]) =>
    setSelectedIds(ids.length === 0 ? new Set() : new Set(ids));

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
          const count = counts[tab.key] ?? 0;
          const active = status === tab.key;
          const cfg    = STATUS_MAP[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => handleTabChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-r border-border last:border-r-0',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className={cn(
                    'inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1',
                    active
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

      {/* ── 벌크 액션 바 (candidate 탭에서만) ──────────────────── */}
      {status === 'candidate' && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-xs text-foreground font-medium">
            {selectedIds.size}건 선택됨
          </span>
          <Button
            size="sm"
            disabled={bulkBusy}
            className="text-xs h-7"
            onClick={handleBulkMoveToPending}
          >
            {bulkBusy ? '처리 중...' : '컨펌 큐로'}
          </Button>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors ml-auto"
            onClick={() => setSelectedIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}

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
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onToggleAll={handleToggleAll}
        onMoveToPending={handleMoveToPending}
        onApprove={handleApprove}
        onReject={handleReject}
        onRecandidate={handleRecandidate}
      />
    </div>
  );
}
