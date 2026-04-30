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

export interface RisingKeywordPoint {
  keyword: string;
  thisWeek: number;      // 이번 주(최근 7일) 등장 횟수
  lastWeek: number;      // 지난 주(7~14일 전) 등장 횟수
  growthRate: number | null; // null = 신규 (지난 주 0건)
}

/** 상승/하강 워드 클라우드용 */
export interface KeywordChangePoint {
  keyword: string;
  thisWeek: number;
  lastWeek: number;
  /** 변화율(%) — null = 신규(지난 주 0건), -100 = 소멸 */
  changeRate: number | null;
  /** 이번 주 0건 && 지난 주 > 0 */
  isGone: boolean;
}

export interface CategoryRankPoint {
  rank: number;
  category: string;     // style tag 이름 | '미분류' | '기타'
  count: number;        // 이번 기간 트렌드 수
  lastCount: number;    // 지난 기간 트렌드 수
  share: number;        // 이번 기간 비중(%) — 소수점 1자리
  changeRate: number | null; // null = 신규 카테고리, 단위 % (소수점 2자리)
}

export interface TimeSeriesPoint {
  date: string;    // 'YYYY-MM-DD'
  total: number;
}

/** recharts-compatible multi-series point (dynamic platform/lifecycle keys) */
export type TimeSeriesMultiPoint = { date: string } & Record<string, number | string>;

export interface TimeSeriesData {
  daily: TimeSeriesPoint[];
  byPlatform: TimeSeriesMultiPoint[];
  byLifecycle: TimeSeriesMultiPoint[];
  /** sorted unique platform names found in the period */
  platforms: string[];
  /** lifecycle stage keys found in the period (ordered by LIFECYCLE_META) */
  lifecycles: string[];
}

export interface ReportStats {
  totalActive: number;
  newThisPeriod: number;
  prevNewThisPeriod: number;
}

export interface TrendReportData {
  stats: ReportStats;
  platformData: PlatformPoint[];
  lifecycleData: LifecyclePoint[];
  styleData: StylePoint[];
  hotKeywords: KeywordPoint[];
  risingKeywords: RisingKeywordPoint[];
  /** 상승 워드 클라우드 (changeRate > 0 or null) — 최대 20개 */
  risingCloud: KeywordChangePoint[];
  /** 하강 워드 클라우드 (changeRate < 0 or isGone) — 최대 20개 */
  fallingCloud: KeywordChangePoint[];
  /** 카테고리별 트렌드 랭킹 (Top 10 + 기타) */
  categoryRanking: CategoryRankPoint[];
  /** 시계열 수집 추이 */
  timeSeries: TimeSeriesData;
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
      const oneWeekAgo    = new Date(now - 7 * 864e5).toISOString();
      // Always fetch at least 30 days so the time-series chart has full data
      const fetchSinceAgo = new Date(now - Math.max(periodDays, 30) * 864e5).toISOString();

      // ── 병렬 쿼리 ─────────────────────────────────────────
      const [
        totalRes,
        newThisRes,
        prevRes,
        recentRes,
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
        // 최근 30일 rows — 플랫폼 차트·라이프사이클·스타일·키워드·시계열 집계
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('created_at, source_data, trend_keywords, lifecycle_stage, style_tags')
            .eq('status', 'analyzed')
            .gte('created_at', fetchSinceAgo)
            .limit(5000)
        ),
        // 스타일 색상 매핑 (style_taxonomy 테이블)
        safeQuery(() =>
          (supabase as any)
            .from('style_taxonomy')
            .select('style_tag, color_hex')
            .limit(200)
        ),
      ]);

      const rows: any[] = (recentRes as any)?.data ?? [];
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
        ((taxonomyRes as any)?.data ?? [])
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

      // ── Hot Keywords (이번 주 trend_keywords 빈도 집계) ────
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

      // ── Rising Keywords (이번 주 vs 지난 주 성장률 기준) ───
      const lastKwMap = new Map<string, number>();
      for (const r of lastWeekRows) {
        for (const kw of (r.trend_keywords as string[] ?? [])) {
          const k = kw?.trim().toLowerCase();
          if (k) lastKwMap.set(k, (lastKwMap.get(k) ?? 0) + 1);
        }
      }
      const risingKeywords: RisingKeywordPoint[] = [...kwMap.entries()]
        .filter(([, thisCount]) => thisCount >= 1)
        .map(([keyword, thisCount]) => {
          const lastCount = lastKwMap.get(keyword) ?? 0;
          const growthRate =
            lastCount === 0
              ? null // 신규 등장
              : Math.round(((thisCount - lastCount) / lastCount) * 100);
          return { keyword, thisWeek: thisCount, lastWeek: lastCount, growthRate };
        })
        // 신규(null) 먼저, 나머지는 성장률 내림차순 → 동률이면 이번 주 횟수 내림차순
        .sort((a, b) => {
          if (a.growthRate === null && b.growthRate === null) return b.thisWeek - a.thisWeek;
          if (a.growthRate === null) return -1;
          if (b.growthRate === null) return 1;
          return b.growthRate !== a.growthRate
            ? b.growthRate - a.growthRate
            : b.thisWeek - a.thisWeek;
        })
        .slice(0, 10);

      // ── 상승/하강 워드 클라우드 ───────────────────────────
      const allKwKeys = new Set([...kwMap.keys(), ...lastKwMap.keys()]);
      const risingCloud: KeywordChangePoint[] = [];
      const fallingCloud: KeywordChangePoint[] = [];

      for (const keyword of allKwKeys) {
        const thisCount = kwMap.get(keyword) ?? 0;
        const lastCount = lastKwMap.get(keyword) ?? 0;
        if (thisCount === 0 && lastCount === 0) continue;

        const isGone = thisCount === 0 && lastCount > 0;
        const changeRate: number | null =
          lastCount === 0
            ? null  // 신규
            : Math.round(((thisCount - lastCount) / lastCount) * 100);

        const point: KeywordChangePoint = { keyword, thisWeek: thisCount, lastWeek: lastCount, changeRate, isGone };

        if (isGone || (changeRate !== null && changeRate < 0)) {
          fallingCloud.push(point);
        } else if (changeRate === null || changeRate > 0) {
          risingCloud.push(point);
        }
        // changeRate === 0 (변화 없음) → 제외
      }

      // 상승: 신규(null) 먼저 → 변화율 내림차순 → 횟수 내림차순
      risingCloud.sort((a, b) => {
        if (a.changeRate === null && b.changeRate === null) return b.thisWeek - a.thisWeek;
        if (a.changeRate === null) return -1;
        if (b.changeRate === null) return 1;
        return b.changeRate !== a.changeRate
          ? b.changeRate - a.changeRate
          : b.thisWeek - a.thisWeek;
      });

      // 하강: 소멸(isGone) 먼저 → 절대 변화율 내림차순 → 횟수 내림차순
      fallingCloud.sort((a, b) => {
        if (a.isGone && !b.isGone) return -1;
        if (!a.isGone && b.isGone) return 1;
        const absA = Math.abs(a.changeRate ?? -100);
        const absB = Math.abs(b.changeRate ?? -100);
        return absB !== absA ? absB - absA : b.lastWeek - a.lastWeek;
      });

      risingCloud.splice(20);
      fallingCloud.splice(20);

      // ── 카테고리별 랭킹 ────────────────────────────────────
      const catThisMap = new Map<string, number>();
      const catLastMap = new Map<string, number>();

      for (const r of thisWeekRows) {
        const tags: string[] = (r.style_tags ?? r.source_data?.style_tags ?? []).filter(Boolean);
        if (tags.length === 0) {
          catThisMap.set('미분류', (catThisMap.get('미분류') ?? 0) + 1);
        } else {
          for (const tag of tags) {
            catThisMap.set(tag, (catThisMap.get(tag) ?? 0) + 1);
          }
        }
      }
      for (const r of lastWeekRows) {
        const tags: string[] = (r.style_tags ?? r.source_data?.style_tags ?? []).filter(Boolean);
        if (tags.length === 0) {
          catLastMap.set('미분류', (catLastMap.get('미분류') ?? 0) + 1);
        } else {
          for (const tag of tags) {
            catLastMap.set(tag, (catLastMap.get(tag) ?? 0) + 1);
          }
        }
      }

      const totalThisCat = [...catThisMap.values()].reduce((s, v) => s + v, 0) || 1;
      const sortedCats = [...catThisMap.entries()].sort((a, b) => b[1] - a[1]);
      const top10Cats  = sortedCats.slice(0, 10);
      const restCats   = sortedCats.slice(10);

      const categoryRanking: CategoryRankPoint[] = top10Cats.map(([cat, count], idx) => {
        const lastCount  = catLastMap.get(cat) ?? 0;
        const changeRate = lastCount === 0
          ? null
          : parseFloat(((count - lastCount) / lastCount * 100).toFixed(2));
        return {
          rank:       idx + 1,
          category:   cat,
          count,
          lastCount,
          share:      parseFloat((count / totalThisCat * 100).toFixed(1)),
          changeRate,
        };
      });

      const othersThisCount = restCats.reduce((s, [, v]) => s + v, 0);
      const othersLastCount = restCats.reduce((s, [k]) => s + (catLastMap.get(k) ?? 0), 0);
      if (othersThisCount > 0 || othersLastCount > 0) {
        const changeRate = othersLastCount === 0
          ? null
          : parseFloat(((othersThisCount - othersLastCount) / othersLastCount * 100).toFixed(2));
        categoryRanking.push({
          rank:       11,
          category:   '기타',
          count:      othersThisCount,
          lastCount:  othersLastCount,
          share:      parseFloat((othersThisCount / totalThisCat * 100).toFixed(1)),
          changeRate,
        });
      }

      // ── 시계열 수집 추이 ────────────────────────────────────
      // Build ordered date array for the selected period
      const allDates: string[] = [];
      for (let i = periodDays - 1; i >= 0; i--) {
        allDates.push(new Date(now - i * 864e5).toISOString().slice(0, 10));
      }

      // Filter rows to exactly the selected period window
      const periodStartDate = new Date(onePeriodAgo);
      const periodRows = rows.filter((r: any) => new Date(r.created_at) >= periodStartDate);

      // Daily totals
      const dailyCountMap = new Map<string, number>(allDates.map(d => [d, 0]));
      for (const r of periodRows) {
        const d = (r.created_at as string).slice(0, 10);
        if (dailyCountMap.has(d)) dailyCountMap.set(d, dailyCountMap.get(d)! + 1);
      }
      const timeSeriesDaily: TimeSeriesPoint[] = allDates.map(date => ({
        date,
        total: dailyCountMap.get(date) ?? 0,
      }));

      // By platform
      const platDayMap = new Map<string, Map<string, number>>();
      for (const r of periodRows) {
        const d = (r.created_at as string).slice(0, 10);
        const p = getPlatform(r);
        if (!platDayMap.has(d)) platDayMap.set(d, new Map());
        const dm = platDayMap.get(d)!;
        dm.set(p, (dm.get(p) ?? 0) + 1);
      }
      const uniquePlatforms = [...new Set(periodRows.map(getPlatform))].sort();
      const timeSeriesByPlatform: TimeSeriesMultiPoint[] = allDates.map(date => {
        const dm = platDayMap.get(date);
        const point: TimeSeriesMultiPoint = { date };
        for (const p of uniquePlatforms) point[p] = dm?.get(p) ?? 0;
        return point;
      });

      // By lifecycle stage (preserve LIFECYCLE_META order)
      const lcDayMap = new Map<string, Map<string, number>>();
      for (const r of periodRows) {
        const d = (r.created_at as string).slice(0, 10);
        const stage = (r.lifecycle_stage ?? r.source_data?.lifecycle_stage) as string | undefined;
        if (!stage || !LIFECYCLE_META[stage]) continue;
        if (!lcDayMap.has(d)) lcDayMap.set(d, new Map());
        const dm = lcDayMap.get(d)!;
        dm.set(stage, (dm.get(stage) ?? 0) + 1);
      }
      const uniqueLifecycles = Object.keys(LIFECYCLE_META).filter(lc =>
        periodRows.some((r: any) =>
          (r.lifecycle_stage ?? r.source_data?.lifecycle_stage) === lc,
        ),
      );
      const timeSeriesByLifecycle: TimeSeriesMultiPoint[] = allDates.map(date => {
        const dm = lcDayMap.get(date);
        const point: TimeSeriesMultiPoint = { date };
        for (const lc of uniqueLifecycles) point[lc] = dm?.get(lc) ?? 0;
        return point;
      });

      const timeSeries: TimeSeriesData = {
        daily:        timeSeriesDaily,
        byPlatform:   timeSeriesByPlatform,
        byLifecycle:  timeSeriesByLifecycle,
        platforms:    uniquePlatforms,
        lifecycles:   uniqueLifecycles,
      };

      setData({
        stats: {
          totalActive:       (totalRes as any)?.count  ?? 0,
          newThisPeriod:     (newThisRes as any)?.count ?? 0,
          prevNewThisPeriod: (prevRes as any)?.count    ?? 0,
        },
        platformData,
        lifecycleData,
        styleData,
        hotKeywords,
        risingKeywords,
        risingCloud,
        fallingCloud,
        categoryRanking,
        timeSeries,
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
