import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * trend_matches 테이블에서 score >= 0.5 인 행을 읽어
 * trend_analysis_id → 매칭 공장 수(count) 맵을 반환.
 *
 * • 최대 10,000 행(.range(0, 9999))을 한 번에 로드.
 * • 9,000 행 이상이면 콘솔 경고 → RPC 집계 전환 신호.
 * • staleTime 5분 (React Query 캐시).
 */
export function useTrendMatchCounts() {
  const { data, isLoading, error, refetch } = useQuery<Map<string, number>>({
    queryKey: ['trend-match-counts-v1'],
    queryFn: async () => {
      const { data: rows, error: qErr } = await (supabase as any)
        .from('trend_matches')
        .select('trend_analysis_id, match_score')
        .gte('match_score', 0.5)
        .range(0, 9999);

      if (qErr) throw qErr;

      const list: Array<{ trend_analysis_id: string; match_score: number }> = rows ?? [];
      console.log(`[useTrendMatchCounts] received ${list.length} rows`);

      if (list.length >= 9000) {
        console.warn(
          '[useTrendMatchCounts] 행 수가 9000 이상입니다. ' +
          'RPC 기반 집계(count_matches_by_trend)로 전환이 필요할 수 있습니다.',
        );
      }

      const counts = new Map<string, number>();
      for (const row of list) {
        counts.set(
          row.trend_analysis_id,
          (counts.get(row.trend_analysis_id) ?? 0) + 1,
        );
      }
      return counts;
    },
    staleTime: 5 * 60_000,
  });

  return { matchCounts: data, isLoading, error, refetch };
}
