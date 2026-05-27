/**
 * useFgConversion
 * ───────────────────────────────────────────────────────────────────
 * Stage 6 (패션고 변환) — fg_conversion_drafts 테이블 read/write 훅.
 *
 * - 매칭 1건당 FG draft 1개 (UNIQUE match_id, 벤더 공유)
 * - 자동 채움은 컴포넌트에서 active 매칭 데이터로 초기값 구성 후 upsert
 * - status: 'draft' (편집중) | 'confirmed' (확정 → FG 등록 대기)
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface FgConversionDraft {
  id: string;
  match_id: string;
  item_name: string | null;
  style_no: string | null;
  category: string | null;
  unit_price: number | null;
  msrp: number | null;
  color_size: string | null;
  material: string | null;
  weight_kg: number | null;
  made_in: string | null;
  pack: string | null;
  min_qty: number | null;
  description: string | null;
  fg_status: string | null;
  converted_image_url: string | null;
  status: 'draft' | 'confirmed';
  created_at: string;
  updated_at: string;
}

export type FgDraftInput = Partial<Omit<FgConversionDraft, 'id' | 'created_at' | 'updated_at'>> & {
  match_id: string;
};

/** 여러 매칭의 draft 를 일괄 조회 → match_id → draft 맵 */
export function useFgConversionDrafts(matchIds: string[]) {
  return useQuery<Map<string, FgConversionDraft>>({
    queryKey: ['fg-drafts', matchIds.slice().sort().join(',')],
    enabled: matchIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fg_conversion_drafts' as any)
        .select('*')
        .in('match_id', matchIds);
      if (error) throw error;
      const map = new Map<string, FgConversionDraft>();
      for (const r of (data ?? []) as unknown as FgConversionDraft[]) {
        map.set(r.match_id, r);
      }
      return map;
    },
  });
}

/** 변환 완료(confirmed) draft 카운트 */
export function useFgConfirmedCount(enabled: boolean) {
  return useQuery<number>({
    queryKey: ['fg-confirmed-count'],
    enabled,
    refetchInterval: enabled ? 15000 : false,
    queryFn: async () => {
      const { count } = await supabase
        .from('fg_conversion_drafts' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed');
      return count ?? 0;
    },
  });
}

/** draft 저장(upsert) + 확정 mutation */
export function useFgDraftMutations() {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['fg-drafts'] });
    qc.invalidateQueries({ queryKey: ['fg-confirmed-count'] });
  }, [qc]);

  // 저장 (편집 내용 upsert, status='draft' 유지)
  const saveDraft = useMutation({
    mutationFn: async (input: FgDraftInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('fg_conversion_drafts' as any)
        .upsert(
          { ...input, status: input.status ?? 'draft', created_by: user?.id ?? null } as any,
          { onConflict: 'match_id' },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(`변환 데이터 저장 실패: ${e?.message ?? String(e)}`),
  });

  // 확정 (status='confirmed' 로 upsert)
  const confirmDraft = useMutation({
    mutationFn: async (input: FgDraftInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('fg_conversion_drafts' as any)
        .upsert(
          { ...input, status: 'confirmed', created_by: user?.id ?? null } as any,
          { onConflict: 'match_id' },
        );
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(`변환 확정 실패: ${e?.message ?? String(e)}`),
  });

  // 확정 취소 (status='draft' 로 되돌림)
  const unconfirmDraft = useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await supabase
        .from('fg_conversion_drafts' as any)
        .update({ status: 'draft' } as any)
        .eq('match_id', matchId);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(`확정 취소 실패: ${e?.message ?? String(e)}`),
  });

  return { saveDraft, confirmDraft, unconfirmDraft };
}
