import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface StyleTaxonomyItem {
  id: string;
  style_tag: string;
  category: string;
  icon_emoji: string | null;
  color_hex: string | null;
  sort_order: number | null;
  description: string | null;
}

export interface StyleTagWithCount extends StyleTaxonomyItem {
  count: number;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useStyleTaxonomy() {
  const [taxonomy, setTaxonomy] = useState<StyleTaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // style_taxonomy 는 types.ts 자동생성 전이므로 as any 캐스팅
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error: dbError } = await (supabase as any)
          .from('style_taxonomy')
          .select('id, style_tag, category, icon_emoji, color_hex, sort_order, description')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('style_tag', { ascending: true });

        if (dbError) throw dbError;
        setTaxonomy((data ?? []) as StyleTaxonomyItem[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '스타일 분류 조회 실패';
        console.warn('useStyleTaxonomy:', msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /** 카테고리별 그룹핑 */
  const grouped = taxonomy.reduce<Record<string, StyleTaxonomyItem[]>>((acc, item) => {
    const cat = item.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return { taxonomy, grouped, loading, error };
}
