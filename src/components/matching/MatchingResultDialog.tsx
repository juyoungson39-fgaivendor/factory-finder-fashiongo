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
import { Loader2, CheckCircle2, ArrowRight, Sparkles, RotateCcw } from 'lucide-react';
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
  /**
   * 옵션: "벤더 배분으로 →" / "다음 단계로 →" 클릭 시 호출되는 콜백.
   * 지정 시: 모달 닫기 + 콜백 실행 (보통 Modal B 오픈)
   * 미지정 시: 기본 동작 — /matches?tab=approved 페이지 이동
   */
  onProceedNext?: () => void;
}

type MatchStatus = 'pending_confirm' | 'approved' | 'rejected' | 'active';

// ── localStorage 키 (직전 세션 자동 보류 IDs 보관) ─────────────────
const LS_AUTO_HELD_KEY = 'angelAgent.lastAutoHeldMatchIds';
// 7일 이상 지난 자동 보류는 무시
const AUTO_HELD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

interface AutoHeldRecord {
  ids: string[];
  at: string;
}

function readAutoHeld(): AutoHeldRecord | null {
  try {
    const raw = localStorage.getItem(LS_AUTO_HELD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AutoHeldRecord;
    if (!parsed.ids?.length || !parsed.at) return null;
    if (Date.now() - new Date(parsed.at).getTime() > AUTO_HELD_EXPIRY_MS) {
      localStorage.removeItem(LS_AUTO_HELD_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeAutoHeld(ids: string[]) {
  if (!ids.length) return;
  try {
    const rec: AutoHeldRecord = { ids, at: new Date().toISOString() };
    localStorage.setItem(LS_AUTO_HELD_KEY, JSON.stringify(rec));
  } catch {
    /* localStorage 차단 환경 무시 */
  }
}

function clearAutoHeld() {
  try { localStorage.removeItem(LS_AUTO_HELD_KEY); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────
export function MatchingResultDialog({ open, onOpenChange, onProceedNext }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  // 직전 세션 자동 보류 복원 후보 (Q1: 자동 보류 유지 + 다음 세션에 복원 가능)
  const [recoverableIds, setRecoverableIds] = useState<string[]>([]);
  const [restoring,      setRestoring]      = useState(false);

  // 페이지네이션
  const [page,     setPage]     = useState(0);
  const pageSize = 10;

  // 모달 열릴 때 상태 초기화 + 직전 세션 자동 보류 복원 후보 조회
  useEffect(() => {
    if (!open) return;
    setPage(0);
    setRecoverableIds([]);
    setProcessedPage(0);

    // 직전 세션에 자동 보류된 IDs 가 아직 'rejected' 상태로 살아있는지 확인.
    // 사용자가 해당 모달에서 수동으로 복귀시켰거나 다른 액션이 있었으면 제외.
    const rec = readAutoHeld();
    if (!rec) return;
    (async () => {
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select('id, status')
        .in('id', rec.ids)
        .eq('status', 'rejected');
      if (error) {
        // 조회 실패 → 무시
        return;
      }
      const stillRejected = (data ?? []).map((r) => (r as any).id as string);
      if (stillRejected.length === 0) {
        // 모두 다른 상태로 전이됨 → 기록 정리
        clearAutoHeld();
        return;
      }
      setRecoverableIds(stillRejected);
    })();
  }, [open]);

  // ── 직전 자동 보류 일괄 복원 (rejected → pending_confirm) ─────────
  const handleRestoreAutoHeld = useCallback(async () => {
    if (recoverableIds.length === 0) return;
    setRestoring(true);
    try {
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .update({ status: 'pending_confirm' as MatchStatus })
        .in('id', recoverableIds)
        .eq('status', 'rejected')
        .select('id');
      if (error) {
        toast.error(`복원 실패: ${error.message}`);
        return;
      }
      const restored = data?.length ?? 0;
      if (restored > 0) {
        toast.success(`${restored.toLocaleString()}건 복원되었습니다.`);
      }
      setRecoverableIds([]);
      clearAutoHeld();
      qc.invalidateQueries({ queryKey: ['modal-a-list'] });
      qc.invalidateQueries({ queryKey: ['modal-a-pending-count'] });
      qc.invalidateQueries({ queryKey: ['tsm-list'] });
      qc.invalidateQueries({ queryKey: ['tsm-counts'] });
    } finally {
      setRestoring(false);
    }
  }, [recoverableIds, qc]);

  // ── 상태별 카운트 (DB 누적 상태) ─────────────────────────────────
  // 사용자 의도: 상단 카드는 "이번 세션" 이 아니라 "현재 전체 상태" 노출.
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
  // 승인 카운트 (DB 전체)
  const { data: approvedCount = 0 } = useQuery({
    queryKey: ['modal-a-approved-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');
      return count ?? 0;
    },
  });

  // 보류 카운트 (DB 전체)
  const { data: rejectedCount = 0 } = useQuery({
    queryKey: ['modal-a-rejected-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected');
      return count ?? 0;
    },
  });

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

  // ── 처리됨 목록 (전체 approved + rejected 최근 50건, 수정 가능) ────
  // 사용자 의도: 한 세션이 끝나기 전에도 현재 승인/보류 저장된 항목 리스트가
  // 보여야 함. "이번 세션" 시간 필터를 제거하고 전체 처리된 항목을 노출.
  // 페이지네이션은 처리됨 영역도 별도로 관리.
  const [processedPage, setProcessedPage] = useState(0);
  const processedPageSize = 10;
  const { data: processedItems = [] } = useQuery<MatchedItem[]>({
    queryKey: ['modal-a-processed', processedPage, processedPageSize],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const from = processedPage * processedPageSize;
      const to   = from + processedPageSize - 1;
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, status, created_at, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`,
        )
        .in('status', ['approved', 'rejected'])
        .order('match_score', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as MatchedItem[];
    },
  });

  // 처리됨 총 건수 (페이지네이션용)
  const { data: processedCount = 0 } = useQuery<number>({
    queryKey: ['modal-a-processed-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .in('status', ['approved', 'rejected']);
      return count ?? 0;
    },
  });

  const processedTotalPages = Math.max(1, Math.ceil(processedCount / processedPageSize));

  // ── 캐시 무효화 (모달 + Matches 페이지 양쪽) ─────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modal-a-list'] });
    qc.invalidateQueries({ queryKey: ['modal-a-pending-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-approved-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-rejected-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-processed'] });
    qc.invalidateQueries({ queryKey: ['modal-a-processed-count'] });
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
    qc.invalidateQueries({ queryKey: ['matches-pending-confirm-count'] });
    qc.invalidateQueries({ queryKey: ['stage5-approved-count'] });
  }, [qc]);

  // ── 상태별 카운트 optimistic update 유틸 (캐시키에 변동분 반영) ───
  // 모든 상태 카운트를 동시 보정해서 카드가 즉시 업데이트.
  const adjustCounts = useCallback((deltas: Partial<Record<'pending'|'approved'|'rejected', number>>) => {
    if (deltas.pending  !== undefined) qc.setQueryData<number>(['modal-a-pending-count'],  (old = 0) => Math.max(0, old + (deltas.pending  ?? 0)));
    if (deltas.approved !== undefined) qc.setQueryData<number>(['modal-a-approved-count'], (old = 0) => Math.max(0, old + (deltas.approved ?? 0)));
    if (deltas.rejected !== undefined) qc.setQueryData<number>(['modal-a-rejected-count'], (old = 0) => Math.max(0, old + (deltas.rejected ?? 0)));
  }, [qc]);

  // ── 단건 상태 변경 (optimistic) ───────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    // 이전 상태 알아내기 (모달 안에서는 pending_confirm 리스트에서 온다고 가정)
    const prevItems = qc.getQueryData<MatchedItem[]>(['modal-a-list', page, pageSize]);
    const prevStatus = prevItems?.find((it) => it.id === id)?.status ?? 'pending_confirm';

    qc.setQueryData<MatchedItem[]>(['modal-a-list', page, pageSize], (old = []) =>
      old.filter((it) => it.id !== id),
    );
    // optimistic: prevStatus -1, newStatus +1
    adjustCounts({
      ...(prevStatus === 'pending_confirm' && { pending: -1 }),
      ...(prevStatus === 'approved'        && { approved: -1 }),
      ...(prevStatus === 'rejected'        && { rejected: -1 }),
      ...(newStatus === 'pending_confirm'  && { pending: +1 }),
      ...(newStatus === 'approved'         && { approved: +1 }),
      ...(newStatus === 'rejected'         && { rejected: +1 }),
    });

    const { data: updated, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .eq('id', id)
      .select('id');

    if (error || (updated?.length ?? 0) === 0) {
      // rollback
      if (prevItems) qc.setQueryData(['modal-a-list', page, pageSize], prevItems);
      adjustCounts({
        ...(prevStatus === 'pending_confirm' && { pending: +1 }),
        ...(prevStatus === 'approved'        && { approved: +1 }),
        ...(prevStatus === 'rejected'        && { rejected: +1 }),
        ...(newStatus === 'pending_confirm'  && { pending: -1 }),
        ...(newStatus === 'approved'         && { approved: -1 }),
        ...(newStatus === 'rejected'         && { rejected: -1 }),
      });
      toast.error(error ? `변경 실패: ${error.message}` : '권한이 없어 변경되지 않았습니다.');
      return;
    }

    refetchAll();
  }, [qc, page, pageSize, refetchAll, adjustCounts]);

  // ── 일괄 상태 변경 (optimistic) ───────────────────────────────────
  const handleBulkStatusChange = useCallback(async (ids: string[], newStatus: string) => {
    const prevItems = qc.getQueryData<MatchedItem[]>(['modal-a-list', page, pageSize]);
    qc.setQueryData<MatchedItem[]>(['modal-a-list', page, pageSize], (old = []) =>
      old.filter((it) => !ids.includes(it.id)),
    );
    // 일괄 호출은 컨펌대기 → 다른 상태 가정 (Modal A 페이지 내 일괄은 항상 pending_confirm 에서 출발)
    adjustCounts({
      pending: -ids.length,
      ...(newStatus === 'approved' && { approved: +ids.length }),
      ...(newStatus === 'rejected' && { rejected: +ids.length }),
    });

    const { data: updated, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .in('id', ids)
      .select('id');

    const updatedCount = updated?.length ?? 0;

    if (error || updatedCount === 0) {
      if (prevItems) qc.setQueryData(['modal-a-list', page, pageSize], prevItems);
      adjustCounts({
        pending: +ids.length,
        ...(newStatus === 'approved' && { approved: -ids.length }),
        ...(newStatus === 'rejected' && { rejected: -ids.length }),
      });
      toast.error(error ? `일괄 변경 실패: ${error.message}` : '권한이 없어 변경되지 않았습니다.');
      return;
    }

    if (updatedCount < ids.length) {
      const targetLabel = STATUS_MAP[newStatus]?.label ?? newStatus;
      toast.warning(`${ids.length}건 중 ${updatedCount}건만 '${targetLabel}'로 변경되었습니다.`);
    }
    refetchAll();
  }, [qc, page, pageSize, refetchAll, adjustCounts]);

  // ── 모든 컨펌 완료 상태 (페이지 + 카운트 둘 다 0) ────────────────
  const allDone = !isFetching && pendingCount === 0;

  // ── 진행 중 상태 ─────────────────────────────────────────────────
  const [proceedBusy, setProceedBusy] = useState(false);

  // ── 다음 단계로 이동 (빈 상태 CTA: 자동 보류 없음, 단순 이동) ────
  const goVendorAllocation = () => {
    if (onProceedNext) {
      // Modal B 오픈 (AngelAgentPanel 에서 wiring)
      onProceedNext();
      return;
    }
    // fallback: 페이지 이동
    onOpenChange(false);
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
        const heldIds = (updated ?? []).map((r) => (r as any).id as string);
        if (cnt > 0) {
          toast.info(`${cnt.toLocaleString()}건이 자동 보류 처리되었습니다. 다음 세션에서 복원 가능합니다.`);
          adjustCounts({ pending: -cnt, rejected: +cnt });
          // 다음 모달 오픈 시 "직전 자동 보류 N건 복원" 배너로 띄울 IDs 저장.
          writeAutoHeld(heldIds);
        }
        refetchAll();
      }
      if (onProceedNext) {
        onProceedNext();
      } else {
        onOpenChange(false);
        navigate('/matches?tab=approved');
      }
    } finally {
      setProceedBusy(false);
    }
  }, [pendingCount, refetchAll, onOpenChange, navigate, onProceedNext, adjustCounts]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[92vh] overflow-hidden flex flex-col p-0"
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

        {/* ── 상단 통계: 현재 DB 상태 (컨펌대기 / 승인 / 보류) ─────── */}
        <div className="grid grid-cols-3 gap-3 px-6 pt-4">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">컨펌대기</div>
            <div className="text-2xl font-bold tabular-nums">
              {pendingCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-blue-50/50 border-blue-100">
            <div className="text-[10px] text-blue-700">✓ 승인</div>
            <div className="text-2xl font-bold tabular-nums text-blue-700">
              {approvedCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-slate-50 border-slate-200">
            <div className="text-[10px] text-slate-600">✕ 보류</div>
            <div className="text-2xl font-bold tabular-nums text-slate-700">
              {rejectedCount.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* ── 직전 세션 자동 보류 복원 배너 ───────────────────────── */}
        {recoverableIds.length > 0 && (
          <div className="mx-6 mt-3 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 flex items-center justify-between gap-3">
            <div className="text-xs text-blue-900 flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
              직전 세션에 자동 보류된{' '}
              <strong>{recoverableIds.length.toLocaleString()}건</strong>이 있습니다. 다시 컨펌으로 돌릴까요?
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 flex-shrink-0"
              disabled={restoring}
              onClick={handleRestoreAutoHeld}
            >
              {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              복원 ({recoverableIds.length.toLocaleString()})
            </Button>
          </div>
        )}

        {/* ── 본문 영역 ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* ── 영역 1: 컨펌대기 (또는 모든 컨펌 완료 안내) ─────────── */}
          {allDone ? (
            // 처리됨 항목이 있으면 작게, 없으면 큰 축하 메시지
            processedCount > 0 ? (
              <div className="rounded-md bg-green-50/60 border border-green-100 px-3 py-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                <span className="text-xs text-green-900 flex-1">
                  현재 컨펌대기 없음. 아래 처리됨 내역에서 수정하거나 벤더 배분으로 진행하세요.
                </span>
                <Button onClick={goVendorAllocation} size="sm" variant="default" className="h-7 text-xs gap-1">
                  벤더 배분으로 <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-green-500" />
                <h3 className="text-base font-semibold">모든 컨펌 완료 ✓</h3>
                <p className="text-sm text-muted-foreground">처리할 매칭이 없습니다.</p>
                <Button onClick={goVendorAllocation} size="sm" className="gap-1.5 mt-1">
                  벤더 배분으로 <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )
          ) : (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                컨펌대기 ({pendingCount.toLocaleString()}건)
              </h4>
              <SourceableMatchedList
                items={items}
                loading={isFetching}
                currentStatus="pending_confirm"
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                onBulkStatusChange={isAdmin ? handleBulkStatusChange : undefined}
              />
              {/* 컨펌대기 페이지네이션 */}
              {pendingCount > pageSize && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {pendingCount.toLocaleString()}건
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 0 || isFetching} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                      ◀ 이전
                    </Button>
                    <span className="text-xs tabular-nums px-2">
                      {page + 1} / {totalPages}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages - 1 || isFetching} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>
                      다음 ▶
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 영역 2: 이미 처리된 내역 (수정 가능) ─────────────────── */}
          {processedCount > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h4 className="text-xs font-semibold text-muted-foreground">
                  이미 처리된 내역 ({processedCount.toLocaleString()}건) — 수정 가능
                </h4>
                <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    승인 {approvedCount.toLocaleString()}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                    보류 {rejectedCount.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground/70">· 행 액션으로 상태 변경 가능</span>
                </div>
              </div>
              <SourceableMatchedList
                items={processedItems}
                loading={false}
                currentStatus="processed"
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
              />
              {/* 처리됨 페이지네이션 */}
              {processedCount > processedPageSize && (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {(processedPage * processedPageSize + 1).toLocaleString()}–{Math.min((processedPage + 1) * processedPageSize, processedCount).toLocaleString()} / {processedCount.toLocaleString()}건
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={processedPage === 0} onClick={() => setProcessedPage((p) => Math.max(0, p - 1))}>
                      ◀ 이전
                    </Button>
                    <span className="text-xs tabular-nums px-2">
                      {processedPage + 1} / {processedTotalPages}
                    </span>
                    <Button size="sm" variant="outline" className="h-7 text-xs" disabled={processedPage >= processedTotalPages - 1} onClick={() => setProcessedPage((p) => Math.min(processedTotalPages - 1, p + 1))}>
                      다음 ▶
                    </Button>
                  </div>
                </div>
              )}
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
