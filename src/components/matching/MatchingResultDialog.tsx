/**
 * MatchingResultDialog (Modal A — 매칭 컨펌 작업창)
 * ─────────────────────────────────────────────────────────────────────
 * Angel Agent Stage 3 완료 직후 자동 오픈되는 컨펌 작업창.
 * - 컨펌대기(pending_confirm) 매칭 목록을 페이지네이션으로 표시
 * - 단건/일괄 ✓승인 / ✕보류 액션
 * - 이번 세션 누적 카운터 (승인 N건 · 보류 N건)
 * - 컨펌대기 = 0 이 되면 "모든 컨펌 완료" 안내 + "벤더 배분으로 →" 버튼
 * - 푸터: [전체 매칭 페이지 →] [닫기]
 *
 * Legacy RunSummary 타입은 AngelAgentPanel.matchSummary 참조 호환을 위해
 * 그대로 export 유지.
 */

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CheckCircle2, ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { cn } from '@/lib/utils';
import {
  SourceableMatchedList,
  type MatchedItem,
  STATUS_MAP,
} from '@/components/matching/SourceableMatchedList';

// ── Legacy 타입 (AngelAgentPanel.matchSummary 참조 호환) ──────────────
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

// ── 소싱상품 / 트렌드 select 절 (Matches.tsx 와 동일 구조 유지) ───────
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

// ── Props ─────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type MatchStatus = 'pending_confirm' | 'approved' | 'rejected' | 'active';

// ─────────────────────────────────────────────────────────────────────
export function MatchingResultDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  // 세션 카운터 (모달 열릴 때마다 0 으로 초기화)
  const [sessionApproved, setSessionApproved] = useState(0);
  const [sessionHeld,     setSessionHeld]     = useState(0);

  // 페이지네이션
  const [page,     setPage]     = useState(0);
  const pageSize = 10;

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (open) {
      setSessionApproved(0);
      setSessionHeld(0);
      setPage(0);
    }
  }, [open]);

  // ── 컨펌대기 카운트 (전체) ───────────────────────────────────────
  const { data: pendingCount = 0 } = useQuery({
    queryKey: ['modal-a-pending-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_confirm');
      return count ?? 0;
    },
  });

  // ── 페이지 단위 목록 ─────────────────────────────────────────────
  const { data: items = [], isFetching } = useQuery({
    queryKey: ['modal-a-list', page, pageSize],
    enabled: open,
    queryFn: async () => {
      const from = page * pageSize;
      const to   = from + pageSize - 1;
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, status, created_at, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`,
        )
        .eq('status', 'pending_confirm')
        .order('match_score', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as MatchedItem[];
    },
  });

  const totalPages = Math.max(1, Math.ceil(pendingCount / pageSize));
  const rangeStart = pendingCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd   = Math.min((page + 1) * pageSize, pendingCount);

  // 페이지가 총 페이지 수보다 크면 자동 보정 (마지막 일괄 처리 후 빈 페이지 방지)
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  // ── 캐시 무효화 (모달 + Matches 페이지 양쪽) ─────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modal-a-list'] });
    qc.invalidateQueries({ queryKey: ['modal-a-pending-count'] });
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
    qc.invalidateQueries({ queryKey: ['matches-pending-confirm-count'] });
  }, [qc]);

  // ── 단건 상태 변경 (optimistic) ───────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    const prevItems = qc.getQueryData<MatchedItem[]>(['modal-a-list', page, pageSize]);
    qc.setQueryData<MatchedItem[]>(['modal-a-list', page, pageSize], (old = []) =>
      old.filter((it) => it.id !== id),
    );
    qc.setQueryData<number>(['modal-a-pending-count'], (old = 0) => Math.max(0, old - 1));

    const { data: updated, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .eq('id', id)
      .select('id');

    if (error || (updated?.length ?? 0) === 0) {
      // rollback
      if (prevItems) qc.setQueryData(['modal-a-list', page, pageSize], prevItems);
      qc.setQueryData<number>(['modal-a-pending-count'], (old = 0) => old + 1);
      toast.error(error ? `변경 실패: ${error.message}` : '권한이 없어 변경되지 않았습니다.');
      return;
    }

    if (newStatus === 'approved') setSessionApproved((n) => n + 1);
    else if (newStatus === 'rejected') setSessionHeld((n) => n + 1);

    refetchAll();
  }, [qc, page, pageSize, refetchAll]);

  // ── 일괄 상태 변경 (optimistic) ───────────────────────────────────
  const handleBulkStatusChange = useCallback(async (ids: string[], newStatus: string) => {
    const prevItems = qc.getQueryData<MatchedItem[]>(['modal-a-list', page, pageSize]);
    qc.setQueryData<MatchedItem[]>(['modal-a-list', page, pageSize], (old = []) =>
      old.filter((it) => !ids.includes(it.id)),
    );
    qc.setQueryData<number>(['modal-a-pending-count'], (old = 0) => Math.max(0, old - ids.length));

    const { data: updated, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .in('id', ids)
      .select('id');

    const updatedCount = updated?.length ?? 0;

    if (error || updatedCount === 0) {
      if (prevItems) qc.setQueryData(['modal-a-list', page, pageSize], prevItems);
      qc.setQueryData<number>(['modal-a-pending-count'], (old = 0) => old + ids.length);
      toast.error(error ? `일괄 변경 실패: ${error.message}` : '권한이 없어 변경되지 않았습니다.');
      return;
    }

    if (newStatus === 'approved') setSessionApproved((n) => n + updatedCount);
    else if (newStatus === 'rejected') setSessionHeld((n) => n + updatedCount);

    if (updatedCount < ids.length) {
      const targetLabel = STATUS_MAP[newStatus]?.label ?? newStatus;
      toast.warning(`${ids.length}건 중 ${updatedCount}건만 '${targetLabel}'로 변경되었습니다.`);
    }
    refetchAll();
  }, [qc, page, pageSize, refetchAll]);

  // ── 모든 컨펌 완료 상태 (페이지 + 카운트 둘 다 0) ────────────────
  const allDone = !isFetching && pendingCount === 0;

  // ── 진행 중 상태 ─────────────────────────────────────────────────
  const [proceedBusy, setProceedBusy] = useState(false);

  // ── 다음 단계로 이동 (빈 상태 CTA: 자동 보류 없음, 단순 이동) ────
  const goVendorAllocation = () => {
    onOpenChange(false);
    // PR-B 머지 후 모달 B 오픈으로 교체 예정. 현재는 페이지 이동.
    navigate('/matches?tab=approved');
  };

  // ── 푸터 [다음 단계로 →] (남은 컨펌대기 자동 보류 후 이동) ───────
  const handleProceedNext = useCallback(async () => {
    setProceedBusy(true);
    try {
      if (pendingCount > 0) {
        // 미처리 pending_confirm 전체를 일괄 'rejected' (보류) 로 전환.
        // RLS: matches_update_status_authenticated 가 authenticated 에게 UPDATE 허용.
        const { data: updated, error } = await supabase
          .from('trend_sourceable_matches')
          .update({ status: 'rejected' as MatchStatus })
          .eq('status', 'pending_confirm')
          .select('id');
        if (error) {
          toast.error(`자동 보류 실패: ${error.message}`);
          return;
        }
        const cnt = updated?.length ?? 0;
        if (cnt > 0) {
          toast.info(`${cnt.toLocaleString()}건이 자동 보류 처리되었습니다.`);
          setSessionHeld((n) => n + cnt);
        }
        refetchAll();
      }
      onOpenChange(false);
      // PR-B 머지 후 모달 B 오픈으로 교체 예정.
      navigate('/matches?tab=approved');
    } finally {
      setProceedBusy(false);
    }
  }, [pendingCount, refetchAll, onOpenChange, navigate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            매칭 컨펌
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            소싱가능 상품과 매칭된 결과를 검토하고 승인/보류 하세요.
            모달을 닫지 않고 끝까지 처리한 다음 벤더 배분 단계로 이어집니다.
          </p>
        </DialogHeader>

        {/* ── 상단 통계: 컨펌대기 / 이번 세션 승인 / 이번 세션 보류 ─ */}
        <div className="grid grid-cols-3 gap-3 px-6 pt-4">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">컨펌대기 (남은)</div>
            <div className="text-2xl font-bold tabular-nums">
              {pendingCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-blue-50/50 border-blue-100">
            <div className="text-[10px] text-blue-700">이번 세션 ✓ 승인</div>
            <div className="text-2xl font-bold tabular-nums text-blue-700">
              {sessionApproved.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-slate-50 border-slate-200">
            <div className="text-[10px] text-slate-600">이번 세션 ✕ 보류</div>
            <div className="text-2xl font-bold tabular-nums text-slate-700">
              {sessionHeld.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* ── 본문 영역 ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {allDone ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <h3 className="text-base font-semibold">모든 컨펌 완료 ✓</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                이번 세션에 <strong>{sessionApproved.toLocaleString()}건 승인</strong>,{' '}
                <strong>{sessionHeld.toLocaleString()}건 보류</strong> 처리했습니다.
                <br />
                다음은 승인된 매칭을 벤더에게 배분하는 단계입니다.
              </p>
              <Button onClick={goVendorAllocation} size="sm" className="gap-1.5 mt-2">
                벤더 배분으로 <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <SourceableMatchedList
              items={items}
              loading={isFetching}
              currentStatus="pending_confirm"
              isAdmin={isAdmin}
              onStatusChange={handleStatusChange}
              onBulkStatusChange={isAdmin ? handleBulkStatusChange : undefined}
            />
          )}

          {/* 페이지네이션 (allDone 이 아닐 때만) */}
          {!allDone && pendingCount > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <div className="text-xs text-muted-foreground tabular-nums">
                {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {pendingCount.toLocaleString()}건
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ◀ 이전
                </Button>
                <span className="text-xs tabular-nums px-2">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={page >= totalPages - 1 || isFetching}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  다음 ▶
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 sm:gap-2 flex-row justify-end items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={proceedBusy}
            onClick={() => { onOpenChange(false); navigate('/matches?tab=pending_confirm'); }}
          >
            전체 매칭 페이지 →
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={proceedBusy}
            onClick={() => onOpenChange(false)}
          >
            닫기
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={proceedBusy}
            onClick={handleProceedNext}
            className="gap-1.5"
            title={pendingCount > 0 ? `남은 ${pendingCount.toLocaleString()}건은 자동 보류됩니다` : undefined}
          >
            {proceedBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                다음 단계로 <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
