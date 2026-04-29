import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface HotKeyword {
  keyword: string;
  count: number;
  image_url: string | null;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useHotKeywords(limit = 12, dayRange = 7) {
  const [keywords, setKeywords] = useState<HotKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - dayRange);

        const { data, error: dbError } = await supabase
          .from('trend_analyses')
          .select('trend_keywords, source_data')
          .eq('status', 'analyzed')
          .gte('created_at', cutoff.toISOString())
          .order('created_at', { ascending: false })
          .limit(500);

        if (dbError) throw dbError;

        // keyword → { count, image_url }
        // 동일 키워드의 첫 번째 이미지 URL을 대표 이미지로 사용
        const map = new Map<string, { count: number; image_url: string | null }>();

        for (const row of data ?? []) {
          const keywords: string[] = (row as any).trend_keywords ?? [];
          const sd = (row as any).source_data ?? {};
          const imageUrl: string | null =
            typeof sd.image_url === 'string' && sd.image_url.trim()
              ? sd.image_url.trim()
              : null;

          for (const kw of keywords) {
            const normalized = kw.trim().toLowerCase();
            if (!normalized || normalized.length < 2) continue;

            const existing = map.get(normalized);
            if (existing) {
              existing.count += 1;
              // 이미지가 없던 항목에 이미지가 생기면 업데이트
              if (!existing.image_url && imageUrl) {
                existing.image_url = imageUrl;
              }
            } else {
              map.set(normalized, { count: 1, image_url: imageUrl });
            }
          }
        }

        const sorted = [...map.entries()]
          .sort((a, b) => b[1].count - a[1].count)
          .slice(0, limit)
          .map(([keyword, { count, image_url }]) => ({ keyword, count, image_url }));

        setKeywords(sorted);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '키워드 집계 실패';
        console.warn('useHotKeywords:', msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [limit, dayRange]);

  return { keywords, loading, error };
}
