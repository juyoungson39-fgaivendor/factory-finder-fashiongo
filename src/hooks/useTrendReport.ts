import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface PlatformPoint {
  platform: string;
  thisWeek: number;
  lastWeek: number;
}

export interface ClusterPoint {
  name: string;
  growth: number;
}

export interface LifecyclePoint {
  stage: string;
  label: string;
  count: number;
  color: string;
}

export interface StylePoint {
  tag: string;
  count: number;
  color: string;
}

export interface KeywordPoint {
  keyword: string;
  count: number;
}

export interface ReportStats {
  totalActive: number;
  newThisPeriod: number;
  prevNewThisPeriod: number;
  activeClusters: number;
}

export interface TrendReportData {
  stats: ReportStats;
  platformData: PlatformPoint[];
  topClusters: ClusterPoint[];
  lifecycleData: LifecyclePoint[];
  styleData: StylePoint[];
  hotKeywords: KeywordPoint[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
export const LIFECYCLE_META: Record<string, { label: string; color: string }> = {
  emerging:  { label: 'Emerging',  color: '#22c55e' },
  rising:    { label: 'Rising',    color: '#3b82f6' },
  peak:      { label: 'Peak',      color: '#eab308' },
  declining: { label: 'Declining', color: '#9ca3af' },
  classic:   { label: 'Classic',   color: '#a855f7' },
};

// ─────────────────────────────────────────────────────────────
// Helper — safe query wrapper (won't throw on table-not-found)
// ─────────────────────────────────────────────────────────────
async function safeQuery<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useTrendReport(periodDays: number) {
  const [data, setData]     = useState<TrendReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const now          = Date.now();
      const periodMs     = periodDays * 864e5;
      const onePeriodAgo = new Date(now - periodMs).toISOString();
      const twoPeriodAgo = new Date(now - periodMs * 2).toISOString();
      const oneWeekAgo   = new Date(now - 7 * 864e5).toISOString();
      const twoWeeksAgo  = new Date(now - 14 * 864e5).toISOString();

      // ── 병렬 쿼리 ─────────────────────────────────────────
      const [
        totalRes,
        newThisRes,
        prevRes,
        recentRes,
        clusterCountRes,
        topClusterRes,
        taxonomyRes,
      ] = await Promise.all([
        // 총 활성 트렌드 count
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'analyzed')
        ),
        // 이번 기간 신규 count
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'analyzed')
            .gte('created_at', onePeriodAgo)
        ),
        // 이전 기간 신규 count (비교용)
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'analyzed')
            .gte('created_at', twoPeriodAgo)
            .lt('created_at', onePeriodAgo)
        ),
        // 최근 14일 rows — 플랫폼 차트·라이프사이클·스타일·키워드 집계
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('created_at, source_data, trend_keywords, lifecycle_stage, style_tags')
            .eq('status', 'analyzed')
            .gte('created_at', twoWeeksAgo)
            .limit(2000)
        ),
        // 활성 클러스터 count
        safeQuery(() =>
          (supabase as any)
            .from('trend_clusters')
            .select('id', { count: 'exact', head: true })
        ),
        // 급상승 클러스터 Top 5
        safeQuery(() =>
          (supabase as any)
            .from('trend_clusters')
            .select('cluster_name, cluster_name_kr, weekly_growth_rate')
            .order('weekly_growth_rate', { ascending: false, nullsFirst: false })
            .limit(5)
        ),
        // 스타일 색상 매핑 (style_taxonomy 테이블)
        safeQuery(() =>
          (supabase as any)
            .from('style_taxonomy')
            .select('style_tag, color_hex')
            .limit(200)
        ),
      ]);

      const rows: any[] = recentRes?.data ?? [];
      const oneWeekAgoDate = new Date(oneWeekAgo);
      const thisWeekRows = rows.filter((r: any) => new Date(r.created_at) >= oneWeekAgoDate);
      const lastWeekRows = rows.filter((r: any) => new Date(r.created_at) < oneWeekAgoDate);

      // ── 플랫폼 차트 (이번 주 vs 지난 주) ─────────────────
      const pMap = new Map<string, { thisWeek: number; lastWeek: number }>();
      const getPlatform = (r: any): string =>
        ((r.source_data?.platform as string) ?? 'unknown').toLowerCase();

      for (const r of thisWeekRows) {
        const p = getPlatform(r);
        const e = pMap.get(p) ?? { thisWeek: 0, lastWeek: 0 };
        e.thisWeek++;
        pMap.set(p, e);
      }
      for (const r of lastWeekRows) {
        const p = getPlatform(r);
        const e = pMap.get(p) ?? { thisWeek: 0, lastWeek: 0 };
        e.lastWeek++;
        pMap.set(p, e);
      }
      const platformData: PlatformPoint[] = [...pMap.entries()]
        .map(([platform, c]) => ({ platform, thisWeek: c.thisWeek, lastWeek: c.lastWeek }))
        .sort((a, b) => b.thisWeek - a.thisWeek)
        .slice(0, 8);

      // ── 급상승 클러스터 Top 5 ─────────────────────────────
      const topClusters: ClusterPoint[] = (topClusterRes?.data ?? []).map((c: any) => ({
        name:   (c.cluster_name_kr || c.cluster_name || '').slice(0, 14),
        growth: Math.round(c.weekly_growth_rate ?? 0),
      }));

      // ── 라이프사이클 분포 ─────────────────────────────────
      const lcMap = new Map<string, number>();
      for (const r of rows) {
        const stage = (r.lifecycle_stage ?? r.source_data?.lifecycle_stage) as string | undefined;
        if (stage && LIFECYCLE_META[stage]) {
          lcMap.set(stage, (lcMap.get(stage) ?? 0) + 1);
        }
      }
      const lifecycleData: LifecyclePoint[] = Object.entries(LIFECYCLE_META)
        .map(([stage, meta]) => ({
          stage,
          label: meta.label,
          count: lcMap.get(stage) ?? 0,
          color: meta.color,
        }))
        .filter(d => d.count > 0);

      // ── 스타일 태그 분포 ─────────────────────────────────
      const colorMap = new Map<string, string>(
        (taxonomyRes?.data ?? [])
          .filter((t: any) => t.style_tag && t.color_hex)
          .map((t: any) => [t.style_tag as string, t.color_hex as string])
      );
      const styleMap = new Map<string, number>();
      for (const r of rows) {
        const tags: string[] = r.style_tags ?? r.source_data?.style_tags ?? [];
        for (const tag of tags) {
          if (tag) styleMap.set(tag, (styleMap.get(tag) ?? 0) + 1);
        }
      }
      const styleData: StylePoint[] = [...styleMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tag, count]) => ({ tag, count, color: colorMap.get(tag) ?? '#6b7280' }));

      // ── Hot Keywords (이번 주 trend_keywords 집계) ────────
      const kwMap = new Map<string, number>();
      for (const r of thisWeekRows) {
        for (const kw of (r.trend_keywords as string[] ?? [])) {
          const k = kw?.trim().toLowerCase();
          if (k) kwMap.set(k, (kwMap.get(k) ?? 0) + 1);
        }
      }
      const hotKeywords: KeywordPoint[] = [...kwMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([keyword, count]) => ({ keyword, count }));

      setData({
        stats: {
          totalActive:       totalRes?.count       ?? 0,
          newThisPeriod:     newThisRes?.count      ?? 0,
          prevNewThisPeriod: prevRes?.count         ?? 0,
          activeClusters:    clusterCountRes?.count ?? 0,
        },
        platformData,
        topClusters,
        lifecycleData,
        styleData,
        hotKeywords,
      });
    } catch (e: unknown) {
      console.warn('useTrendReport error:', e);
      setError(e instanceof Error ? e.message : '데이터 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => { load(); }, [load]);

  return { data, loading, error, refetch: load };
}
