import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface FilterPreset {
  id: string;
  name: string;
  // JSONB 컬럼 — FilterState + checkboxes + sortBy + sortDirection 전체 저장
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters: Record<string, any>;
  created_at: string;
}

const TABLE = 'filter_presets';
export const MAX_PRESETS = 10;

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export const useFilterPresets = (userId: string | null) => {
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!userId) { setPresets([]); return; }
    setLoading(true);
    try {
      // filter_presets 는 신규 테이블이므로 as any 캐스팅
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from(TABLE)
        .select('id, name, filters, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      setPresets(data ?? []);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /** 저장 — 성공 시 null 반환, 실패 시 에러 메시지 반환 */
  const save = useCallback(async (
    name: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filters: Record<string, any>,
  ): Promise<string | null> => {
    if (!userId) return '로그인이 필요합니다.';
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from(TABLE)
        .insert({ user_id: userId, name, filters })
        .select('id, name, filters, created_at')
        .single();
      if (error) return error.message as string;
      setPresets(p => [data as FilterPreset, ...p]);
      return null;
    } catch (e) {
      return String(e);
    }
  }, [userId]);

  /** 삭제 */
  const remove = useCallback(async (id: string): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from(TABLE).delete().eq('id', id);
    setPresets(p => p.filter(pr => pr.id !== id));
  }, []);

  return { presets, loading, save, remove, reload: load };
};
