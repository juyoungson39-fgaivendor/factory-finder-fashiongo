import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type KeywordCategory = 'silhouette' | 'material' | 'print' | 'color' | 'style' | 'item';

export const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  silhouette: '실루엣',
  material: '소재',
  print: '프린트',
  color: '컬러',
  style: '스타일',
  item: '아이템',
};

export interface DailyStat {
  date: string;   // YYYY-MM-DD
  count: number;
}

export interface KeywordStat {
  keyword: string;
  category: KeywordCategory;
  daily: DailyStat[];
  total_7d: number;
  total_30d: number;
  growth_7d: number | null;
  growth_30d: number | null;
}

interface ApiResponse {
  keywords: KeywordStat[];
  total_analyses: number;
}

export function useTrendKeywordStats() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (options?: { rebuild?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('로그인이 필요합니다.');

      const { data: res, error: fnErr } = await supabase.functions.invoke<ApiResponse>(
        'analyze-trend-keywords',
        { body: { user_id: userId, rebuild: options?.rebuild ?? false } }
      );
      if (fnErr) throw fnErr;
      setData(res);
      return res;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '키워드 통계 조회에 실패했습니다.';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /** 카테고리별 필터링 */
  const byCategory = useCallback(
    (category: KeywordCategory) =>
      data?.keywords.filter(k => k.category === category) ?? [],
    [data]
  );

  /** 7일 기준 상위 N개 키워드 */
  const topKeywords = useCallback(
    (n = 10) => (data?.keywords ?? []).slice(0, n),
    [data]
  );

  /** 7일 기준 급상승 키워드 (growth_7d > 0, 내림차순) */
  const risingKeywords = useCallback(
    (n = 10) =>
      (data?.keywords ?? [])
        .filter(k => (k.growth_7d ?? 0) > 0)
        .sort((a, b) => (b.growth_7d ?? 0) - (a.growth_7d ?? 0))
        .slice(0, n),
    [data]
  );

  return {
    data,
    loading,
    error,
    fetch,
    byCategory,
    topKeywords,
    risingKeywords,
  };
}
