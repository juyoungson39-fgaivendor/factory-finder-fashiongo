import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface TrendSourceProfile {
  id: string;
  platform: string;
  account_name: string;
  account_url: string | null;
  followers: number | null;
  total_trends_found: number | null;
  avg_engagement_rate: number | null;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useTopTrendSources(limit = 5) {
  const [sources, setSources] = useState<TrendSourceProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error: dbError } = await supabase
          .from('trend_source_profiles')
          .select(
            'id, platform, account_name, account_url, followers, total_trends_found, avg_engagement_rate',
          )
          .order('total_trends_found', { ascending: false, nullsFirst: false })
          .limit(limit);

        if (dbError) throw dbError;
        setSources((data ?? []) as TrendSourceProfile[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '소스 프로필 조회 실패';
        console.warn('useTopTrendSources:', msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [limit]);

  return { sources, loading, error };
}
