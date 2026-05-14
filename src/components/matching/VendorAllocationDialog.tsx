/**
 * VendorAllocationDialog (Modal B — 벤더 배분 작업창)
 * ─────────────────────────────────────────────────────────────────────
 * Modal A 의 [벤더 배분으로 →] 또는 [다음 단계로 →] 버튼 클릭 시 자동 오픈.
 *
 * v3 (사용자 피드백 반영):
 *  - 카드 그리드 → SourceableMatchedList 테이블 (Modal A·/matches 와 동일 패턴)
 *  - 한 행에 한 상품, 컴팩트 (사용자 요청: "stage4 처럼")
 *  - 행 ▶ 클릭 시 펼침 → VendorAllocationSection (벤더 칩 + 추가 + 활성화)
 *  - 상단 카드 = 현재 DB 상태 (배분대기 / 활성 / 보류) — 세션 카운터 제거
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
import { ArrowLeft, Boxes, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import {
  SourceableMatchedList,
  type MatchedItem,
} from '@/components/matching/SourceableMatchedList';
import { VendorAllocationSection } from '@/components/matching/VendorAllocationSection';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';
import { useAllocateVendor } from '@/hooks/useMatchAllocations';

// ── 소싱상품 / 트렌드 select 절 (Modal A 와 동일 구조) ─────────────
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

type MatchStatus = 'pending_confirm' | 'approved' | 'rejected' | 'active';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * 옵션: [← 매칭 컨펌으로] 버튼 클릭 시 호출되는 콜백.
   * 부모(AngelAgentPanel)가 Modal B 닫고 Modal A 오픈 책임.
   */
  onBackToConfirm?: () => void;
}

// ─────────────────────────────────────────────────────────────────────
export function VendorAllocationDialog({ open, onOpenChange, onBackToConfirm }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();

  // 페이지네이션
  const [page, setPage] = useState(0);
  const pageSize = 10;

  // 모달 안 다중 선택 (체크박스에서 콜백으로 동기화) — 상단 벤더 픽 일괄 배분용
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 벤더 카탈로그
  const { active: vendorList, isLoading: vendorsLoading } = useResolvedVendors();
  const { bulkAllocate } = useAllocateVendor();

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setPage(0);
      setSelectedIds([]);
    }
  }, [open]);

  // 일괄 벤더 배분 — 선택된 매칭들에게 클릭한 벤더를 배분
  const handleBulkVendorAssign = useCallback(async (vendorId: string, vendorName: string) => {
    if (selectedIds.length === 0) {
      toast.warning('먼저 매칭을 선택해주세요 (체크박스).');
      return;
    }
    try {
      const cnt = await bulkAllocate.mutateAsync({
        matchIds: selectedIds,
        vendorId,
        vendorName,
      });
      toast.success(`${cnt.toLocaleString()}건에 "${vendorName}" 일괄 배분되었습니다.`);
    } catch {
      // onError 토스트에서 처리
    }
  }, [selectedIds, bulkAllocate]);

  // ── 상태별 카운트 (DB 누적) ───────────────────────────────────────
  const { data: approvedCount = 0 } = useQuery({
    queryKey: ['modal-b-approved-count'],
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

  const { data: activeCount = 0 } = useQuery({
    queryKey: ['modal-b-active-count'],
    enabled: open,
    refetchInterval: open ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    },
  });

  const { data: rejectedCount = 0 } = useQuery({
    queryKey: ['modal-b-rejected-count'],
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

  // ── 페이지 단위 매칭 (approved status 만) ────────────────────────
  const { data: matches = [], isFetching } = useQuery<MatchedItem[]>({
    queryKey: ['modal-b-list', page, pageSize],
    enabled: open,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, status, created_at, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`,
        )
        .eq('status', 'approved')
        .order('match_score', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as MatchedItem[];
    },
  });

  const totalPages = Math.max(1, Math.ceil(approvedCount / pageSize));
  const rangeStart = approvedCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, approvedCount);

  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  // ── 캐시 무효화 ──────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modal-b-list'] });
    qc.invalidateQueries({ queryKey: ['modal-b-approved-count'] });
    qc.invalidateQueries({ queryKey: ['modal-b-active-count'] });
    qc.invalidateQueries({ queryKey: ['modal-b-rejected-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-pending-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-approved-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-rejected-count'] });
    qc.invalidateQueries({ queryKey: ['modal-a-processed'] });
    qc.invalidateQueries({ queryKey: ['modal-a-processed-count'] });
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
    qc.invalidateQueries({ queryKey: ['stage5-approved-count'] });
  }, [qc]);

  // ── optimistic 카운트 보정 ───────────────────────────────────────
  const adjustCounts = useCallback((deltas: Partial<Record<'approved'|'active'|'rejected', number>>) => {
    if (deltas.approved !== undefined) qc.setQueryData<number>(['modal-b-approved-count'], (old = 0) => Math.max(0, old + (deltas.approved ?? 0)));
    if (deltas.active   !== undefined) qc.setQueryData<number>(['modal-b-active-count'],   (old = 0) => Math.max(0, old + (deltas.active   ?? 0)));
    if (deltas.rejected !== undefined) qc.setQueryData<number>(['modal-b-rejected-count'], (old = 0) => Math.max(0, old + (deltas.rejected ?? 0)));
  }, [qc]);

  // ── 상태 변경 핸들러 — SourceableMatchedList 의 ActionCell 이 호출 ──
  // approved → active (활성화) / approved → rejected (보류로)
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    const prevItems = qc.getQueryData<MatchedItem[]>(['modal-b-list', page, pageSize]);
    const prevStatus = prevItems?.find((it) => it.id === id)?.status ?? 'approved';

    // optimistic 리스트 제거 (현재 탭은 approved 만 표시하므로)
    qc.setQueryData<MatchedItem[]>(['modal-b-list', page, pageSize], (old = []) =>
      old.filter((it) => it.id !== id),
    );
    // optimistic 카운트 보정
    adjustCounts({
      ...(prevStatus === 'approved' && { approved: -1 }),
      ...(prevStatus === 'active'   && { active:   -1 }),
      ...(prevStatus === 'rejected' && { rejected: -1 }),
      ...(newStatus === 'approved' && { approved: +1 }),
      ...(newStatus === 'active'   && { active:   +1 }),
      ...(newStatus === 'rejected' && { rejected: +1 }),
    });

    const { data, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .eq('id', id)
      .select('id');

    if (error || (data?.length ?? 0) === 0) {
      // rollback
      if (prevItems) qc.setQueryData(['modal-b-list', page, pageSize], prevItems);
      adjustCounts({
        ...(prevStatus === 'approved' && { approved: +1 }),
        ...(prevStatus === 'active'   && { active:   +1 }),
        ...(prevStatus === 'rejected' && { rejected: +1 }),
        ...(newStatus === 'approved' && { approved: -1 }),
        ...(newStatus === 'active'   && { active:   -1 }),
        ...(newStatus === 'rejected' && { rejected: -1 }),
      });
      toast.error(error ? `변경 실패: ${error.message}` : '권한이 없어 변경되지 않았습니다.');
      return;
    }

    refetchAll();
  }, [qc, page, pageSize, refetchAll, adjustCounts]);

  const allDone = !isFetching && approvedCount === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="text-base flex items-center gap-2">
            <Boxes className="w-4 h-4 text-primary" />
            벤더 배분
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            컨펌된 매칭을 벤더에게 배분하고 활성화하세요. 활성화된 매칭이 FG 변환·등록 단계의 입력이 됩니다.
            행 ▶ 클릭으로 펼쳐서 벤더를 추가할 수 있습니다. 한 매칭은 여러 벤더에 동시 배분 가능합니다.
          </p>
        </DialogHeader>

        {/* ── 벤더 픽 줄 (상단) — 선택된 매칭에 일괄 배분 ─────────── */}
        <div className="px-6 pt-4">
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2.5 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {selectedIds.length > 0
                ? <><strong className="text-foreground">{selectedIds.length}건</strong> 선택됨 — 벤더 클릭으로 일괄 배분</>
                : '체크박스로 매칭 선택 후 아래 벤더 클릭 시 일괄 배분'}
            </span>
            <div className="flex flex-wrap items-center gap-1.5 ml-auto">
              {vendorsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              ) : vendorList.length === 0 ? (
                <span className="text-[10px] text-muted-foreground">
                  활성 벤더 없음 — /settings/pricing 에서 활성화
                </span>
              ) : (
                vendorList.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    disabled={bulkAllocate.isPending || selectedIds.length === 0}
                    onClick={() => handleBulkVendorAssign(v.id, v.name)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full text-white text-[11px] font-medium px-3 py-1 transition-all',
                      'hover:scale-105 active:scale-95',
                      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100',
                    )}
                    style={{ backgroundColor: v.color }}
                    title={selectedIds.length === 0 ? '먼저 매칭을 선택하세요' : `${selectedIds.length}건에 ${v.name} 배분`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-white/80"></span>
                    {v.name}
                  </button>
                ))
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-1"
                >
                  선택 해제
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── 상단 통계 3카드 (DB 누적 상태) ─────────────────────── */}
        <div className="grid grid-cols-3 gap-3 px-6 pt-3">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">배분 대기 (승인)</div>
            <div className="text-2xl font-bold tabular-nums">
              {approvedCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-green-50/50 border-green-100">
            <div className="text-[10px] text-green-700">✓ 활성화 (배분 완료)</div>
            <div className="text-2xl font-bold tabular-nums text-green-700">
              {activeCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-slate-50 border-slate-200">
            <div className="text-[10px] text-slate-600">✕ 보류</div>
            <div className="text-2xl font-bold tabular-nums text-slate-700">
              {rejectedCount.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* ── 본문 — SourceableMatchedList 테이블 + 행 펼치기 ───────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {allDone ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <h3 className="text-base font-semibold">모든 배분 완료 ✓</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                배분 대기 중인 매칭이 없습니다.
                활성화된 매칭은 다음 FG 변환 단계에서 사용됩니다.
              </p>
              <Button onClick={() => onOpenChange(false)} size="sm" variant="outline" className="mt-2">
                닫기
              </Button>
            </div>
          ) : (
            <>
              <h4 className="text-xs font-semibold text-muted-foreground">
                배분 대기 ({approvedCount.toLocaleString()}건) — 행 ▶ 클릭으로 벤더 추가 + [활성화]
              </h4>
              <SourceableMatchedList
                items={matches}
                loading={isFetching}
                currentStatus="approved"
                isAdmin={isAdmin}
                onStatusChange={handleStatusChange}
                onSelectedIdsChange={setSelectedIds}
                inlineCellHeader="배분된 벤더 / + 추가"
                renderInlineCell={(item) => (
                  <VendorAllocationSection
                    matchId={item.id}
                    matchStatus="approved"
                    hideActivateButton
                    compact
                  />
                )}
              />
              {/* 페이지네이션 */}
              {approvedCount > pageSize && (
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {approvedCount.toLocaleString()}건
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
            </>
          )}
        </div>

        {/* ── 푸터 ───────────────────────────────────────────────── */}
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 sm:gap-2 flex-row items-center">
          {onBackToConfirm && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onBackToConfirm}
              className="gap-1.5 mr-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              매칭 컨펌으로
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => { onOpenChange(false); navigate('/matches?tab=approved'); }}
            className={onBackToConfirm ? undefined : 'ml-auto'}
          >
            전체 매칭 페이지 →
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
