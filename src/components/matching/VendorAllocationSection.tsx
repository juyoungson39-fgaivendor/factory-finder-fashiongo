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
 *  - 벤더 추가 Select 드롭다운 (Popover → Select 로 교체, Dialog 내부 호환성 ↑)
 *  - (옵션) 활성화 버튼 — 승인 상태에서만 표시. 부모가 hideActivateButton=true 면 숨김.
 *  - 빈 배분 + 활성 상태일 때 경고 텍스트
 */

import { useMemo } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';
import {
  useMatchAllocations,
  useAllocateVendor,
} from '@/hooks/useMatchAllocations';

export interface VendorAllocationSectionProps {
  matchId: string;
  /**
   * 매칭의 현재 status. 'approved' 일 때만 [활성화] 버튼 노출.
   * 'active' 는 활성탭 — 편집은 자유 (Q1=B), 활성화 버튼은 노출 안 함.
   */
  matchStatus?: 'pending_confirm' | 'approved' | 'rejected' | 'active';
  /**
   * [활성화] 버튼 클릭 핸들러. 부모가 status 전이 (approved → active) 책임.
   * undefined 면 활성화 버튼 자체 숨김.
   */
  onActivate?: () => void;
  /**
   * true 면 활성화 버튼을 섹션 내부에 렌더하지 않음.
   * 부모(카드)가 별도 위치에 렌더하고 싶을 때 사용 (Modal B).
   */
  hideActivateButton?: boolean;
  /** 컴팩트 모드 — 모달 안에서 사용 시 글자/패딩 줄임 */
  compact?: boolean;
}

export function VendorAllocationSection({
  matchId,
  matchStatus = 'approved',
  onActivate,
  hideActivateButton = false,
  compact = false,
}: VendorAllocationSectionProps) {
  const { active: vendors, isLoading: vendorsLoading } = useResolvedVendors();
  const { data: allocations = [], isLoading: allocsLoading } = useMatchAllocations(matchId);
  const { allocate, unallocate } = useAllocateVendor();

  // 이미 배분된 벤더 ID set
  const allocatedIds = useMemo(
    () => new Set(allocations.map((a) => a.vendor_id)),
    [allocations],
  );

  // 드롭다운에 노출할 후보 = 활성 벤더 중 아직 배분 안 된 것
  const availableVendors = useMemo(
    () => vendors.filter((v) => !allocatedIds.has(v.id)),
    [vendors, allocatedIds],
  );

  const handleAdd = async (vendorId: string) => {
    if (!vendorId) return;
    const v = vendors.find((vv) => vv.id === vendorId);
    if (!v) return;
    if (allocatedIds.has(vendorId)) return;
    try {
      await allocate.mutateAsync({ matchId, vendorId, vendorName: v.name });
    } catch (err) {
      // onError 핸들러에서 토스트 표시됨
      console.error('[VendorAllocationSection] allocate failed', err);
    }
  };

  const handleRemove = async (vendorId: string) => {
    try {
      await unallocate.mutateAsync({ matchId, vendorId });
    } catch (err) {
      console.error('[VendorAllocationSection] unallocate failed', err);
    }
  };

  const isBusy = allocate.isPending || unallocate.isPending;
  const showActivate = !hideActivateButton && matchStatus === 'approved' && typeof onActivate === 'function';
  const showInactiveWarning = matchStatus === 'active' && allocations.length === 0 && !allocsLoading;

  return (
    <div className={cn('space-y-1.5', compact ? 'text-xs' : 'text-sm')}>
      {/* 칩 + 드롭다운 + 활성화 — 한 줄 flex-wrap */}
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
                    onClick={() => handleRemove(a.vendor_id)}
                    disabled={isBusy}
                    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50"
                    aria-label={`${a.vendor_name ?? a.vendor_id} 배분 취소`}
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              );
            })}

            {/* 벤더 추가 Select — Popover 교체 (Dialog 내부 호환성 ↑) */}
            <Select
              value=""
              onValueChange={handleAdd}
              disabled={isBusy || vendorsLoading || availableVendors.length === 0}
            >
              <SelectTrigger
                className={cn(
                  'gap-1 border-dashed w-auto inline-flex',
                  compact ? 'h-6 text-[10px] px-2' : 'h-7 text-xs px-2.5',
                )}
              >
                <SelectValue
                  placeholder={
                    availableVendors.length === 0
                      ? (allocations.length > 0 ? '모든 벤더 배분됨' : '활성 벤더 없음')
                      : '+ 벤더 추가'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableVendors.length === 0 ? (
                  <div className="text-xs text-muted-foreground px-2 py-3 text-center">
                    {vendors.length === 0
                      ? '활성 벤더가 없습니다. /settings/pricing 에서 활성화'
                      : '모든 활성 벤더가 이미 배분됨'}
                  </div>
                ) : (
                  availableVendors.map((v) => (
                    <SelectItem key={v.id} value={v.id} className="text-xs">
                      <span className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: v.color }}
                        />
                        {v.name}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* 활성화 버튼 — 같은 라인 끝쪽 (hideActivateButton 면 부모가 렌더) */}
            {showActivate && (
              <Button
                size="sm"
                variant="default"
                className={cn(
                  'ml-auto',
                  compact ? 'h-6 text-xs px-2.5' : 'h-7 text-xs px-3',
                )}
                disabled={isBusy}
                onClick={onActivate}
                title={allocations.length === 0 ? '벤더 미배분 — FG 변환 단계에서 사용 불가' : undefined}
              >
                활성화
              </Button>
            )}
          </>
        )}
      </div>

      {/* 활성인데 벤더 없음 경고 */}
      {showInactiveWarning && (
        <div className="flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          벤더 미배분 — FG 변환 단계에서 사용 불가
        </div>
      )}
    </div>
  );
}
