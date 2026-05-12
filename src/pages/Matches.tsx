import { useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  SourceableMatchedList,
  type MatchedItem,
  STATUS_MAP,
} from '@/components/matching/SourceableMatchedList';
import type { Database } from '@/integrations/supabase/types';
import { useIsAdmin } from '@/hooks/useIsAdmin';

// ─── 타입 ─────────────────────────────────────────────────────────────
type MatchStatus = Database['public']['Enums']['match_status'];

// ─── 상수 ─────────────────────────────────────────────────────────────
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

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

  const { isAdmin } = useIsAdmin();

  const [searchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') ?? 'pending_confirm') as StatusKey;

  const [status,   setStatus]   = useState<StatusKey>(initialTab);
  const [page,     setPage]     = useState(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // 탭 변경 시 페이지 리셋
  const handleTabChange = (key: StatusKey) => {
    setStatus(key);
    setPage(0);
  };

  // pageSize 변경 시 페이지 리셋
  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val));
    setPage(0);
  };

  // 페이지 이동 시 맨 위로 스크롤
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page]);

  // ── 카운트 조회 (status 별 병렬 count 쿼리) ──────────────────────
  // 주의: select('status') 단일 쿼리는 Supabase 기본 1,000행 한도에
  //       걸려 pending_confirm 이 1,000건 이상이면 다른 탭 카운트가 0으로 잘림.
  //       count: 'exact', head: true 를 사용해 실제 전체 건수를 조회한다.
  const { data: counts = {} as Record<string, number> } = useQuery({
    queryKey: ['tsm-counts'],
    queryFn: async () => {
      const statuses: StatusKey[] = ['pending_confirm', 'approved', 'rejected', 'active'];
      const results = await Promise.all(
        statuses.map((s) =>
          supabase
            .from('trend_sourceable_matches')
            .select('*', { count: 'exact', head: true })
            .eq('status', s),
        ),
      );
      const c: Record<string, number> = {};
      statuses.forEach((s, i) => {
        c[s] = results[i].count ?? 0;
      });
      return c;
    },
  });

  // ── 목록 조회 (페이지 단위) ────────────────────────────────────────
  const { data: items = [], isFetching } = useQuery({
    queryKey: ['tsm-list', status, page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to   = from + pageSize - 1;
      const { data, error } = await supabase
        .from('trend_sourceable_matches')
        .select(
          `id, match_score, status, created_at, trend_analysis_id,
           sourceable_product:sourceable_products(${PRODUCT_SELECT}),
           trend:trend_analyses(${TREND_SELECT})`
        )
        .eq('status', status)
        .order('match_score', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as MatchedItem[];
    },
  });

  // ── 페이지네이션 계산 ──────────────────────────────────────────────
  const totalCount = counts[status] ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : page * pageSize + 1;
  const rangeEnd   = Math.min((page + 1) * pageSize, totalCount);

  // ── 캐시 무효화 ────────────────────────────────────────────────────
  const refetchAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tsm-list'] });
    qc.invalidateQueries({ queryKey: ['tsm-counts'] });
  }, [qc]);

  // ── 상태 변경 (단건, optimistic) ────────────────────────────────────
  const handleStatusChange = useCallback(async (id: string, newStatus: string) => {
    // 1) optimistic: 현재 페이지 리스트에서 즉시 제거
    const prevItems = qc.getQueryData<MatchedItem[]>(['tsm-list', status, page, pageSize]);
    qc.setQueryData<MatchedItem[]>(['tsm-list', status, page, pageSize], (old = []) =>
      old.filter((item) => item.id !== id),
    );
    // 2) optimistic: 탭 카운트 즉시 반영
    qc.setQueryData<Record<string, number>>(['tsm-counts'], (old = {}) => ({
      ...old,
      [status]:    Math.max(0, (old[status]    ?? 0) - 1),
      [newStatus]: (old[newStatus] ?? 0) + 1,
    }));

    // .select('id') 추가: 실제 업데이트된 행 수 확인 (RLS 무성 차단 감지)
    const { data: updated, error } = await supabase
      .from('trend_sourceable_matches')
      .update({ status: newStatus as MatchStatus })
      .eq('id', id)
      .select('id');

    const failed = error || !updated || updated.length === 0;

    if (failed) {
      // rollback
      if (prevItems) qc.setQueryData(['tsm-list', status, page, pageSize], prevItems);
      qc.setQueryData<Record<string, number>>(['tsm-counts'], (old = {}) => ({
        ...old,
        [status]:    (old[status]    ?? 0) + 1,
        [newStatus]: Math.max(0, (old[newStatus] ?? 0) - 1),
      }));
      toast.error(
        error?.code === '42501' || error?.message?.includes('permission denied')
          ? '권한이 없습니다. 다시 로그인해주세요.'
          : error
            ? `상태 변경 실패: ${error.message}`
            : '권한이 없어 변경되지 않았습니다.',
      );
      return;
    }

    // 3) 새 status 탭으로 자동 이동 + 페이지 리셋
    const targetLabel = STATUS_MAP[newStatus]?.label ?? newStatus;
    setStatus(newStatus as StatusKey);
    setPage(0);
    toast.success(`'${targetLabel}' 탭으로 이동했습니다.`);
    // 4) 서버 데이터로 최종 동기화
    refetchAll();
  }, [qc, status, page, pageSize, refetchAll]);

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

      {/* ── 상태 탭 (전체 건수 배지) ────────────────────────────── */}
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
              <span
                className={cn(
                  'inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold rounded-full px-1 tabular-nums transition-all',
                  isActive
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : cn(cfg?.cls, 'scale-90'),
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 매칭 리스트 ─────────────────────────────────────────── */}
      <SourceableMatchedList
        items={items}
        loading={isFetching && items.length === 0}
        currentStatus={status}
        isAdmin={isAdmin}
        onStatusChange={handleStatusChange}
      />

      {/* ── 페이지네이션 ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-1">

        {/* 좌: 개수 셀렉터 + 범위 표시 */}
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)} className="text-xs">
                  {n}개씩 보기
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalCount === 0
              ? '데이터 없음'
              : `${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} / ${totalCount.toLocaleString()}개`}
            {isFetching && <span className="ml-1 opacity-60">불러오는 중…</span>}
          </span>
        </div>

        {/* 우: 이전 / 페이지 번호 / 다음 */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={page === 0 || isFetching}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-3.5 h-3.5 mr-0.5" />
            이전
          </Button>

          <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>

          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs"
            disabled={(page + 1) * pageSize >= totalCount || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            다음
            <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
          </Button>
        </div>

      </div>

    </div>
  );
}
