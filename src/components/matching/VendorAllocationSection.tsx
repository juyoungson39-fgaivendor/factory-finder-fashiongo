/**
 * VendorAllocationSection
 * ───────────────────────────────────────────────────────────────────
 * 매칭 1건의 벤더 배분 UI (재사용 컴포넌트).
 *
 * 사용처:
 *  - VendorAllocationDialog (Modal B) — 카드별 배분
 *  - Matches.tsx 승인 탭 행 펼치기
 *  - Matches.tsx 활성 탭 행 펼치기 (Q1=B, 활성도 편집 자유)
 *
 * UI 구성:
 *  - 배분된 벤더 칩 (vendor.color 배경, × 버튼)
 *  - "+ 벤더 추가" 드롭다운 (이미 배분된 벤더는 dim, 선택 불가)
 *  - (옵션) 활성화 버튼 — 승인 상태에서만 표시. 클릭 시 콜백으로 상태 전이.
 *  - 빈 배분 + 활성 상태일 때 작은 경고 텍스트
 */

import { useMemo, useState } from 'react';
import { Loader2, X, Plus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';
import {
  useMatchAllocations,
  useAllocateVendor,
} from '@/hooks/useMatchAllocations';

export interface VendorAllocationSectionProps {
  matchId: string;
  /**
   * 매칭의 현재 status. 'approved' 일 때만 [✓ 활성화] 버튼 노출.
   * 'active' 는 활성탭 — 편집은 자유 (Q1=B), 활성화 버튼은 노출 안 함.
   */
  matchStatus?: 'pending_confirm' | 'approved' | 'rejected' | 'active';
  /**
   * [✓ 활성화] 버튼 클릭 핸들러. 부모가 status 전이 (approved → active) 책임.
   * undefined 면 활성화 버튼 자체 숨김.
   */
  onActivate?: () => void;
  /** 컴팩트 모드 — 모달 안에서 사용 시 글자/패딩 줄임 */
  compact?: boolean;
}

export function VendorAllocationSection({
  matchId,
  matchStatus = 'approved',
  onActivate,
  compact = false,
}: VendorAllocationSectionProps) {
  const { active: vendors, isLoading: vendorsLoading } = useResolvedVendors();
  const { data: allocations = [], isLoading: allocsLoading } = useMatchAllocations(matchId);
  const { allocate, unallocate } = useAllocateVendor();

  // Popover open 상태 직접 제어 — 항목 클릭 시 명시적 close 로 안정성 확보
  const [popoverOpen, setPopoverOpen] = useState(false);

  // 이미 배분된 벤더 ID set (드롭다운에서 dim 처리용)
  const allocatedIds = useMemo(
    () => new Set(allocations.map((a) => a.vendor_id)),
    [allocations],
  );

  const handleAdd = async (
    e: React.MouseEvent,
    vendorId: string,
    vendorName: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (allocatedIds.has(vendorId)) return;
    setPopoverOpen(false);
    try {
      await allocate.mutateAsync({ matchId, vendorId, vendorName });
    } catch (err) {
      // onError 핸들러에서 토스트 처리됨
      console.error('[VendorAllocationSection] allocate failed', err);
    }
  };

  const handleRemove = async (e: React.MouseEvent, vendorId: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await unallocate.mutateAsync({ matchId, vendorId });
    } catch (err) {
      console.error('[VendorAllocationSection] unallocate failed', err);
    }
  };

  const isBusy = allocate.isPending || unallocate.isPending;
  const showActivate = matchStatus === 'approved' && typeof onActivate === 'function';
  const showInactiveWarning = matchStatus === 'active' && allocations.length === 0 && !allocsLoading;

  return (
    <div className={cn('space-y-2', compact ? 'text-xs' : 'text-sm')}>
      {/* 라벨 */}
      <div className="flex items-center justify-between gap-2">
        <div className={cn('flex items-center gap-1.5 text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          🏷 배분된 벤더
          {allocations.length > 0 && (
            <span className="font-medium text-foreground">({allocations.length})</span>
          )}
        </div>
        {showActivate && (
          <Button
            size="sm"
            variant="default"
            className={cn('gap-1', compact ? 'h-7 text-xs px-2.5' : 'h-8 text-xs px-3')}
            disabled={isBusy}
            onClick={onActivate}
            title={allocations.length === 0 ? '벤더 미배분 — FG 변환 단계에서 사용 불가능합니다' : undefined}
          >
            <CheckCircle2 className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
            활성화
          </Button>
        )}
      </div>

      {/* 배분된 벤더 칩 + 추가 버튼 */}
      <div className="flex flex-wrap items-center gap-1.5">
        {allocsLoading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        ) : (
          <>
            {allocations.map((a) => {
              const v = vendors.find((vv) => vv.id === a.vendor_id);
              const bg = v?.color ?? '#94a3b8';
              return (
                <span
                  key={a.vendor_id}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full text-white font-medium',
                    compact ? 'text-[10px] pl-2 pr-1 py-0.5' : 'text-[11px] pl-2.5 pr-1 py-1',
                  )}
                  style={{ backgroundColor: bg }}
                >
                  {a.vendor_name ?? v?.name ?? a.vendor_id}
                  <button
                    type="button"
                    onClick={(e) => handleRemove(e, a.vendor_id)}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50"
                    aria-label={`${a.vendor_name ?? a.vendor_id} 배분 취소`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}

            {/* + 벤더 추가 */}
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    'gap-1 border-dashed',
                    compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-2.5',
                  )}
                  disabled={isBusy || vendorsLoading || vendors.length === 0}
                >
                  <Plus className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
                  벤더 추가
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-1" align="start">
                <div className="text-[10px] text-muted-foreground px-2 py-1.5 border-b">
                  배분할 벤더 선택
                </div>
                <div className="max-h-60 overflow-y-auto py-1">
                  {vendors.length === 0 ? (
                    <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                      활성 벤더가 없습니다.<br />
                      <span className="text-[10px]">/settings/pricing 에서 활성화</span>
                    </div>
                  ) : (
                    vendors.map((v) => {
                      const already = allocatedIds.has(v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          disabled={already || isBusy}
                          onClick={(e) => handleAdd(e, v.id, v.name)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition-colors',
                            already && 'opacity-40 cursor-not-allowed hover:bg-transparent',
                          )}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: v.color }}
                          />
                          <span className="flex-1 text-left truncate">{v.name}</span>
                          {already && <span className="text-[9px] text-muted-foreground">배분됨</span>}
                        </button>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {/* 활성인데 벤더 없음 경고 (Q1=B 자유 편집 정책상 강제 차단은 안 함, 표시만) */}
      {showInactiveWarning && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          벤더 미배분 — FG 변환 단계에서 사용 불가
        </div>
      )}
    </div>
  );
}
