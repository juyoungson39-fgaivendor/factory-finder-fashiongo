import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { matchKeywords, type KeywordCategory } from '@/lib/fashion-keywords';

export type { KeywordCategory };

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

function toDateStr(iso: string): string {
  return iso.slice(0, 10);
}

function calcGrowth(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}

function dateOf(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function useTrendKeywordStats() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (options?: { rebuild?: boolean; platform?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) throw new Error('로그인이 필요합니다.');

      // trend_analyses 직접 조회 (Edge Function 없이)
      let query = supabase
        .from('trend_analyses')
        .select('id, trend_keywords, source_data, created_at')
        .eq('user_id', userId)
        .eq('status', 'analyzed')
        .order('created_at', { ascending: true });

      const { data: analyses, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;
      if (!analyses || analyses.length === 0) {
        const empty = { keywords: [], total_analyses: 0 };
        setData(empty);
        return empty;
      }

      // 플랫폼 필터 (클라이언트 사이드)
      const platform = options?.platform ?? 'all';
      const filtered = platform === 'all'
        ? analyses
        : analyses.filter(r => {
            const sd = r.source_data as Record<string, unknown> | null;
            return sd?.platform === platform;
          });

      // 키워드별 날짜별 카운트
      const countsMap = new Map<string, Map<string, number>>();
      const categoryMap = new Map<string, KeywordCategory>();

      for (const row of filtered) {
        const sd = row.source_data as Record<string, unknown> | null;
        const texts: (string | undefined)[] = [
          ...(row.trend_keywords ?? []),
          ...((sd?.search_hashtags as string[]) ?? []),
          ...((sd?.trend_keywords as string[]) ?? []),
          sd?.caption as string | undefined,
          sd?.trend_name as string | undefined,
          sd?.summary_ko as string | undefined,
        ];

        const matched = matchKeywords(texts);
        const dateStr = toDateStr(row.created_at);

        for (const kw of matched) {
          categoryMap.set(kw.keyword, kw.category);
          if (!countsMap.has(kw.keyword)) countsMap.set(kw.keyword, new Map());
          const dayMap = countsMap.get(kw.keyword)!;
          dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + 1);
        }
      }

      // 기간별 증감률 계산
      const cur7Start  = dateOf(6);
      const prev7Start = dateOf(13);
      const cur30Start = dateOf(29);
      const prev30Start = dateOf(59);
      const todayStr   = dateOf(0);

      const results: KeywordStat[] = [];

      for (const [keyword, dayMap] of countsMap) {
        const daily: DailyStat[] = Array.from(dayMap.entries())
          .map(([date, count]) => ({ date, count }))
          .sort((a, b) => a.date.localeCompare(b.date));

        let total_7d = 0, prev7 = 0, total_30d = 0, prev30 = 0;
        for (const { date, count } of daily) {
          if (date >= cur7Start  && date <= todayStr) total_7d  += count;
          if (date >= prev7Start && date < cur7Start) prev7     += count;
          if (date >= cur30Start && date <= todayStr) total_30d += count;
          if (date >= prev30Start && date < cur30Start) prev30  += count;
        }

        results.push({
          keyword,
          category: categoryMap.get(keyword)!,
          daily,
          total_7d,
          total_30d,
          growth_7d:  calcGrowth(total_7d,  prev7),
          growth_30d: calcGrowth(total_30d, prev30),
        });
      }

      results.sort((a, b) => b.total_7d - a.total_7d);
      const res = { keywords: results, total_analyses: filtered.length };
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

  const byCategory = useCallback(
    (category: KeywordCategory) => data?.keywords.filter(k => k.category === category) ?? [],
    [data]
  );

  const topKeywords = useCallback(
    (n = 10) => (data?.keywords ?? []).slice(0, n),
    [data]
  );

  const risingKeywords = useCallback(
    (n = 10) =>
      (data?.keywords ?? [])
        .filter(k => (k.growth_7d ?? 0) > 0)
        .sort((a, b) => (b.growth_7d ?? 0) - (a.growth_7d ?? 0))
        .slice(0, n),
    [data]
  );

  return { data, loading, error, fetch, byCategory, topKeywords, risingKeywords };
}
