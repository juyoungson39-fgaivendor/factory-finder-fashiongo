/**
 * useMatchAllocations
 * ───────────────────────────────────────────────────────────────────
 * trend_match_vendor_allocations 테이블 read/write 훅.
 *
 * 사용처:
 *  - VendorAllocationSection (재사용 컴포넌트)
 *  - VendorAllocationDialog (Modal B)
 *  - Matches.tsx 의 승인/활성 탭 행 펼치기
 *
 * 정책:
 *  - vendor_id 는 vendor-config.ts slug. vendor_name 은 스냅샷 (이력 보존).
 *  - 한 매칭에 한 벤더 중복 배분 방지 (UNIQUE 제약).
 *  - 활성 매칭도 편집 자유 (Q1=B).
 *  - 보류 시 자동 삭제 없음 (Q2=A).
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface VendorAllocation {
  id: string;
  match_id: string;
  vendor_id: string;
  vendor_name: string | null;
  allocated_at: string;
  allocated_by: string | null;
  notes: string | null;
}

const KEY_BY_MATCH = (matchId: string) => ['match-allocations', matchId];
const KEY_BY_MATCH_IDS = (matchIds: string[]) => ['match-allocations-batch', matchIds.sort().join(',')];

/**
 * 단일 매칭의 배분 리스트 조회 (행 펼치기에서 사용).
 */
export function useMatchAllocations(matchId: string | null | undefined) {
  return useQuery<VendorAllocation[]>({
    queryKey: matchId ? KEY_BY_MATCH(matchId) : ['match-allocations', 'noop'],
    enabled: !!matchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_match_vendor_allocations' as any)
        .select('*')
        .eq('match_id', matchId!)
        .order('allocated_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as VendorAllocation[];
    },
  });
}

/**
 * 여러 매칭의 배분을 일괄 조회 → match_id → VendorAllocation[] 맵.
 * Modal B 의 카드 리스트나 대시보드 카운트용.
 */
export function useMatchAllocationsBatch(matchIds: string[]) {
  return useQuery<Map<string, VendorAllocation[]>>({
    queryKey: matchIds.length ? KEY_BY_MATCH_IDS(matchIds) : ['match-allocations-batch', 'empty'],
    enabled: matchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_match_vendor_allocations' as any)
        .select('*')
        .in('match_id', matchIds);
      if (error) throw error;
      const map = new Map<string, VendorAllocation[]>();
      for (const r of (data ?? []) as unknown as VendorAllocation[]) {
        const arr = map.get(r.match_id) ?? [];
        arr.push(r);
        map.set(r.match_id, arr);
      }
      return map;
    },
  });
}

/**
 * 배분 추가/제거 mutation 훅.
 * 사용자가 "+ 벤더 추가" 또는 "× 벤더 칩 제거" 클릭 시 호출.
 */
export function useAllocateVendor() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['match-allocations'] });
    qc.invalidateQueries({ queryKey: ['match-allocations-batch'] });
    // Stage 5 대시보드 카운트 (Stage 5 카드용 향후 쿼리)
    qc.invalidateQueries({ queryKey: ['stage5-approved-count'] });
  }, [qc]);

  const allocate = useMutation({
    mutationFn: async (params: { matchId: string; vendorId: string; vendorName: string }) => {
      const { matchId, vendorId, vendorName } = params;
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('trend_match_vendor_allocations' as any)
        .insert({
          match_id: matchId,
          vendor_id: vendorId,
          vendor_name: vendorName,
          allocated_by: user?.id ?? null,
        } as any);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => {
      const msg = e?.message ?? String(e);
      // UNIQUE constraint violation = 이미 배분된 벤더
      if (msg.includes('duplicate key') || msg.includes('unique')) {
        toast.warning('이미 배분된 벤더입니다.');
      } else {
        toast.error(`벤더 배분 실패: ${msg}`);
      }
    },
  });

  const unallocate = useMutation({
    mutationFn: async (params: { matchId: string; vendorId: string }) => {
      const { matchId, vendorId } = params;
      const { error } = await supabase
        .from('trend_match_vendor_allocations' as any)
        .delete()
        .eq('match_id', matchId)
        .eq('vendor_id', vendorId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(`벤더 배분 취소 실패: ${e?.message ?? String(e)}`),
  });

  return { allocate, unallocate };
}
