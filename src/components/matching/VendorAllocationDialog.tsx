/**
 * VendorAllocationDialog (Modal B — 벤더 배분 작업창)
 * ─────────────────────────────────────────────────────────────────────
 * Modal A 의 [벤더 배분으로 →] 또는 [다음 단계로 →] 버튼 클릭 시 자동 오픈.
 * - 승인(approved) 매칭 목록을 카드 그리드로 표시
 * - 각 카드: 매칭 정보 + VendorAllocationSection (벤더 칩, 추가, 활성화)
 * - 활성화 클릭 시 status='approved' → 'active' 전이 + 카드 사라짐
 * - 이번 세션 카운터 (활성화 N건 / 보류 N건)
 * - 모두 처리 완료 시 "모든 배분 완료" 빈 상태
 * - 푸터 [전체 매칭 페이지 →] [닫기]
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
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, ArrowLeft, Boxes, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';
import { VendorAllocationSection } from '@/components/matching/VendorAllocationSection';

// ── 매칭 row 타입 (Modal A 의 MatchedItem 과 동일 구조) ────────────
interface ApprovedMatch {
  id: string;
  match_score: number;
  status: string;
  created_at: string;
  trend_analysis_id: string;
  sourceable_product: {
    id: string;
    item_name: string | null;
    item_name_en: string | null;
    image_url: string | null;
    unit_price_usd: number | null;
    category: string | null;
    vendor_name: string | null;
  } | null;
  trend: {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source_data: Record<string, any> | null;
    trend_keywords: string[] | null;
  } | null;
}

const PRODUCT_SELECT = `
  id, item_name, item_name_en, image_url,
  unit_price_usd, category, vendor_name
`.trim();

const TREND_SELECT = `
  id, source_data, trend_keywords
`.trim();

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /**
   * 옵션: [← 매칭 컨펌으로] 버튼 클릭 시 호출되는 콜백.
   * 부모(AngelAgentPanel)가 Modal B 닫고 Modal A 오픈 책임.
   * 미지정 시 버튼 미노출.
   */
  onBackToConfirm?: () => void;
}

// ── 점수 색상 ─────────────────────────────────────────────────────────
function scoreStyle(s: number) {
  if (s >= 0.75) return { text: 'text-green-600', bar: 'bg-green-500' };
  if (s >= 0.55) return { text: 'text-amber-600', bar: 'bg-amber-400' };
  return { text: 'text-red-500', bar: 'bg-red-400' };
}

// ─────────────────────────────────────────────────────────────────────
export function VendorAllocationDialog({ open, onOpenChange, onBackToConfirm }: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [sessionActivated, setSessionActivated] = useState(0);
  const [sessionHeld, setSessionHeld] = useState(0);
  const [page, setPage] = useState(0);
  const pageSize = 12; // 1열 컴팩트 카드 — 한 페이지 12장

  // 모달 열릴 때 초기화
  useEffect(() => {
    if (open) {
      setSessionActivated(0);
      setSessionHeld(0);
      setPage(0);
    }
  }, [open]);

  // ── 승인 매칭 카운트 ─────────────────────────────────────────────
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

  // ── 페이지 단위 매칭 ─────────────────────────────────────────────
  const { data: matches = [], isFetching } = useQuery({
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
      return (data ?? []) as unknown as ApprovedMatch[];
    },
  });

  const totalPages = Math.max(1, Math.ceil(approvedCount / pageSize));
  const rangeStart = approvedCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min((page + 1) * pageSize, approvedCount);

  // 페이지 보정
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(Math.max(0, totalPages - 1));
  }, [page, totalPages]);

  // ── 캐시 무효화 ──────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['modal-b-list'] });
    qc.invalidateQueries({ queryKey: ['modal-b-approved-count'] });
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
    qc.invalidateQueries({ queryKey: ['stage5-approved-count'] });
  }, [qc]);

  // ── 활성화 (approved → active) ────────────────────────────────────
  const handleActivate = useCallback(async (matchId: string) => {
    // optimistic: 리스트에서 즉시 제거
    qc.setQueryData<ApprovedMatch[]>(['modal-b-list', page, pageSize], (old = []) =>
      old.filter((m) => m.id !== matchId),
    );
    qc.setQueryData<number>(['modal-b-approved-count'], (old = 0) => Math.max(0, old - 1));

    const { data, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'active' })
      .eq('id', matchId)
      .select('id');

    if (error || (data?.length ?? 0) === 0) {
      toast.error(error ? `활성화 실패: ${error.message}` : '권한이 없어 활성화되지 않았습니다.');
      refetchAll();
      return;
    }

    setSessionActivated((n) => n + 1);
    refetchAll();
  }, [qc, page, pageSize, refetchAll]);

  // ── 보류 (approved → rejected) ────────────────────────────────────
  const handleHold = useCallback(async (matchId: string) => {
    qc.setQueryData<ApprovedMatch[]>(['modal-b-list', page, pageSize], (old = []) =>
      old.filter((m) => m.id !== matchId),
    );
    qc.setQueryData<number>(['modal-b-approved-count'], (old = 0) => Math.max(0, old - 1));

    const { data, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: 'rejected' })
      .eq('id', matchId)
      .select('id');

    if (error || (data?.length ?? 0) === 0) {
      toast.error(error ? `보류 실패: ${error.message}` : '권한이 없어 보류되지 않았습니다.');
      refetchAll();
      return;
    }

    setSessionHeld((n) => n + 1);
    refetchAll();
  }, [qc, page, pageSize, refetchAll]);

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
            한 매칭은 여러 벤더에 동시 배분 가능합니다.
          </p>
        </DialogHeader>

        {/* ── 상단 통계 3카드 ────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 px-6 pt-4">
          <Card className="p-3">
            <div className="text-[10px] text-muted-foreground">배분 대기 (남은)</div>
            <div className="text-2xl font-bold tabular-nums">
              {approvedCount.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-green-50/50 border-green-100">
            <div className="text-[10px] text-green-700">이번 세션 ✓ 활성화</div>
            <div className="text-2xl font-bold tabular-nums text-green-700">
              {sessionActivated.toLocaleString()}
            </div>
          </Card>
          <Card className="p-3 bg-slate-50 border-slate-200">
            <div className="text-[10px] text-slate-600">이번 세션 ✕ 보류</div>
            <div className="text-2xl font-bold tabular-nums text-slate-700">
              {sessionHeld.toLocaleString()}
            </div>
          </Card>
        </div>

        {/* ── 본문 — 카드 그리드 ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {allDone ? (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-green-500" />
              <h3 className="text-base font-semibold">모든 배분 완료 ✓</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                이번 세션에 <strong>{sessionActivated.toLocaleString()}건 활성화</strong>,{' '}
                <strong>{sessionHeld.toLocaleString()}건 보류</strong> 처리했습니다.
                <br />
                활성화된 매칭은 다음 FG 변환 단계에서 사용됩니다.
              </p>
              <Button onClick={() => onOpenChange(false)} size="sm" variant="outline" className="mt-2">
                닫기
              </Button>
            </div>
          ) : isFetching && matches.length === 0 ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="p-2.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="w-12 h-14 flex-shrink-0" />
                    <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-1/4" /></div>
                    <Skeleton className="h-7 w-24" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {matches.map((m) => {
                const sd = (m.trend?.source_data ?? {}) as Record<string, string>;
                const tName = (sd.trend_name ?? sd.article_title ?? '—') as string;
                const sp = m.sourceable_product;
                const spName = sp?.item_name_en ?? sp?.item_name ?? '—';
                const pct = Math.round((m.match_score ?? 0) * 100);
                const sty = scoreStyle(m.match_score ?? 0);

                return (
                  <Card key={m.id} className="p-2.5">
                    {/* 가로 레이아웃: 이미지 | 정보 | 벤더 배분 | 액션 */}
                    <div className="flex items-center gap-3">
                      {/* 이미지 (작게) */}
                      {sp?.image_url ? (
                        <img
                          src={sp.image_url}
                          alt={spName}
                          className="w-12 h-14 object-cover rounded border border-border flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-14 flex-shrink-0">
                          <NoImagePlaceholder size="sm" />
                        </div>
                      )}

                      {/* 상품/트렌드 정보 (좁게) */}
                      <div className="flex flex-col min-w-0 w-[160px] flex-shrink-0 gap-0.5">
                        <p className="text-[10px] text-muted-foreground truncate">{tName}</p>
                        <p className="text-xs font-semibold text-foreground truncate" title={spName}>{spName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {sp?.unit_price_usd != null && (
                            <span className="text-[11px] font-bold">${Number(sp.unit_price_usd).toFixed(2)}</span>
                          )}
                          <span className={cn('text-[10px] font-bold', sty.text)}>{pct}%</span>
                        </div>
                      </div>

                      {/* 벤더 배분 영역 (남은 공간 차지) */}
                      <div className="flex-1 min-w-0 border-l border-border pl-3">
                        <VendorAllocationSection
                          matchId={m.id}
                          matchStatus="approved"
                          onActivate={() => handleActivate(m.id)}
                          compact
                        />
                      </div>

                      {/* 보류 액션 */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[10px] text-muted-foreground hover:text-foreground flex-shrink-0"
                        onClick={() => handleHold(m.id)}
                      >
                        ✕ 보류로
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 페이지네이션 */}
          {!allDone && approvedCount > pageSize && (
            <div className="flex items-center justify-between mt-4 pt-3 border-t">
              <div className="text-xs text-muted-foreground tabular-nums">
                {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()} / {approvedCount.toLocaleString()}건
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
        <DialogFooter className="px-6 py-3 border-t bg-muted/30 gap-2 sm:gap-2 flex-row items-center">
          {/* 좌측: 뒤로 가기 (콜백 있을 때만) */}
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

          {/* 우측: 페이지/닫기 */}
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
