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
  /** 7일 일별 등장 횟수 (스파크라인) */
  daily?: { date: string; count: number }[];
  /** 같은 키워드의 buyer signal 누적 수 */
  signalCount?: number;
}

export interface RisingKeywordPoint {
  keyword: string;
  thisWeek: number;      // 이번 주(최근 7일) 등장 횟수
  lastWeek: number;      // 지난 주(7~14일 전) 등장 횟수
  growthRate: number | null; // null = 신규 (지난 주 0건)
  /** 7일 일별 등장 횟수 (스파크라인) */
  daily?: { date: string; count: number }[];
  /** 같은 키워드의 buyer signal 누적 수 */
  signalCount?: number;
}

/** 라이프사이클 × 카테고리 매트릭스 (stacked bar용) */
export interface LifecycleByCategoryPoint {
  category: string;
  emerging: number;
  rising: number;
  peak: number;
  declining: number;
  classic: number;
  total: number;
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
  /** 활성 소싱 상품 수 */
  activeProducts: number;
  activeProductsMomPct: number | null;
  /** 조회 (signal_type='view') */
  views: { current: number; momPct: number | null; distinctCount: number };
  /** 검색 (signal_type='search') */
  searches: { current: number; momPct: number | null; distinctKeywords: number };
  /** 매칭 카드 피드백 */
  feedback: {
    current: number;
    momPct: number | null;
    positive: number;
    negative: number;
    accuracyPct: number | null;
  };
  /** 외부 링크 클릭률 = click_external_link / view × 100 */
  externalClickRate: {
    ratePct: number | null;
    clickCount: number;
    viewCount: number;
    momPct: number | null;
  };
}

export interface TrendReportData {
  stats: ReportStats;
  platformData: PlatformPoint[];
  lifecycleData: LifecyclePoint[];
  /** 카테고리 × 라이프사이클 매트릭스 (2단계 분석) */
  lifecycleByCategory: LifecycleByCategoryPoint[];
  styleData: StylePoint[];
  hotKeywords: KeywordPoint[];
  risingKeywords: RisingKeywordPoint[];
  /** 감소 키워드 (Top 10) — 탭에서 사용 */
  decliningKeywords: RisingKeywordPoint[];
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

      const prev4WeeksAgo = new Date(now - 28 * 864e5).toISOString();
      const periodOverPrev4Avg = (cur: number, prev28: number): number | null => {
        const scaled = (prev28 * periodDays) / 28;
        if (scaled === 0) return cur > 0 ? null : 0;
        return Math.round(((cur - scaled) / scaled) * 100);
      };

      // ── 병렬 쿼리 ─────────────────────────────────────────
      const [
        totalRes,
        newThisRes,
        prevRes,
        recentRes,
        taxonomyRes,
        activeProdRes,
        prevActiveProdRes,
        // signals 키워드용 (스파크라인 보조)
        signalsByKeywordRes,
        // KPI 4종
        viewsCurRowsRes,
        viewsPrev28Res,
        searchesCurRowsRes,
        searchesPrev28Res,
        clicksCurRes,
        clicksPrev28Res,
        feedbackCurRowsRes,
        feedbackPrev28Res,
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
        // 이전 기간 신규 count
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'analyzed')
            .gte('created_at', twoPeriodAgo)
            .lt('created_at', onePeriodAgo)
        ),
        // 최근 30일 rows
        safeQuery(() =>
          (supabase as any)
            .from('trend_analyses')
            .select('created_at, source_data, trend_keywords, lifecycle_stage, style_tags, primary_category')
            .eq('status', 'analyzed')
            .gte('created_at', fetchSinceAgo)
            .limit(5000)
        ),
        // 스타일 색상 매핑
        safeQuery(() =>
          (supabase as any)
            .from('style_taxonomy')
            .select('style_tag, color_hex')
            .limit(200)
        ),
        // 활성 소싱 상품 수
        safeQuery(() =>
          (supabase as any)
            .from('sourceable_products')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
        ),
        // 이전 기간 시점 활성 상품 (추정 — 그 시점 이전 created)
        safeQuery(() =>
          (supabase as any)
            .from('sourceable_products')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'active')
            .lte('created_at', onePeriodAgo)
        ),
        // 키워드별 시그널 (스파크라인용)
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('keyword, search_query')
            .gte('created_at', fetchSinceAgo)
            .limit(5000)
        ),
        // KPI: 조회 — 현재 기간 rows (distinct 계산용)
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('user_id, trend_id, created_at')
            .eq('signal_type', 'view')
            .gte('created_at', onePeriodAgo)
            .limit(10000)
        ),
        // KPI: 조회 — 직전 4주 count
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('id', { count: 'exact', head: true })
            .eq('signal_type', 'view')
            .gte('created_at', prev4WeeksAgo)
            .lt('created_at', onePeriodAgo)
        ),
        // KPI: 검색 — 현재 기간 rows
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('keyword, search_query')
            .eq('signal_type', 'search')
            .gte('created_at', onePeriodAgo)
            .limit(10000)
        ),
        // KPI: 검색 — 직전 4주 count
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('id', { count: 'exact', head: true })
            .eq('signal_type', 'search')
            .gte('created_at', prev4WeeksAgo)
            .lt('created_at', onePeriodAgo)
        ),
        // KPI: 외부링크 클릭 — 현재 기간 count
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('id', { count: 'exact', head: true })
            .eq('signal_type', 'click_external_link')
            .gte('created_at', onePeriodAgo)
        ),
        // KPI: 외부링크 클릭 — 직전 4주 count
        safeQuery(() =>
          (supabase as any)
            .from('fg_buyer_signals')
            .select('id', { count: 'exact', head: true })
            .eq('signal_type', 'click_external_link')
            .gte('created_at', prev4WeeksAgo)
            .lt('created_at', onePeriodAgo)
        ),
        // KPI: 피드백 — 현재 기간 rows (is_relevant)
        safeQuery(() =>
          (supabase as any)
            .from('match_feedback')
            .select('is_relevant')
            .gte('created_at', onePeriodAgo)
            .limit(10000)
        ),
        // KPI: 피드백 — 직전 4주 count
        safeQuery(() =>
          (supabase as any)
            .from('match_feedback')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', prev4WeeksAgo)
            .lt('created_at', onePeriodAgo)
        ),
      ]);

      // 이미지 없는 항목 제외 (프론트 필터링)
      const rows: any[] = ((recentRes as any)?.data ?? []).filter((r: any) => {
        const img = r.source_data?.image_url;
        return img && (img as string).trim() !== '';
      });
      const oneWeekAgoDate = new Date(oneWeekAgo);
      const thisWeekRows = rows.filter((r: any) => new Date(r.created_at) >= oneWeekAgoDate);
      const lastWeekRows = rows.filter((r: any) => new Date(r.created_at) < oneWeekAgoDate);

      // ── 키워드별 시그널 누적 카운트 ───────────────────────
      const signalKwMap = new Map<string, number>();
      for (const s of (((signalsByKeywordRes as any)?.data ?? []) as any[])) {
        const candidates = [s.keyword, s.search_query]
          .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          .map((v) => v.trim().toLowerCase());
        for (const k of candidates) {
          signalKwMap.set(k, (signalKwMap.get(k) ?? 0) + 1);
        }
      }

      // ── 7일 일별 키워드 출현 (스파크라인용) ───────────────
      // 7일치 날짜 배열 (오래된 → 최신)
      const last7Dates: string[] = [];
      for (let i = 6; i >= 0; i--) {
        last7Dates.push(new Date(now - i * 864e5).toISOString().slice(0, 10));
      }
      // keyword → date → count
      const kwDailyMap = new Map<string, Map<string, number>>();
      for (const r of thisWeekRows) {
        const d = (r.created_at as string).slice(0, 10);
        for (const kw of (r.trend_keywords as string[] ?? [])) {
          const k = kw?.trim().toLowerCase();
          if (!k) continue;
          if (!kwDailyMap.has(k)) kwDailyMap.set(k, new Map());
          const dm = kwDailyMap.get(k)!;
          dm.set(d, (dm.get(d) ?? 0) + 1);
        }
      }
      const buildDaily = (k: string) =>
        last7Dates.map((d) => ({ date: d, count: kwDailyMap.get(k)?.get(d) ?? 0 }));

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

      // ── 라이프사이클 × 카테고리 매트릭스 (2단계 분석) ────────
      // 카테고리 = primary_category 우선, 없으면 첫 style_tag, 그래도 없으면 '미분류'
      const getCategory = (r: any): string => {
        const pc = (r.primary_category ?? '').trim();
        if (pc) return pc;
        const tags: string[] = (r.style_tags ?? r.source_data?.style_tags ?? []).filter(Boolean);
        return tags[0] ?? '미분류';
      };
      const lcCatMap = new Map<string, LifecycleByCategoryPoint>();
      for (const r of rows) {
        const stage = (r.lifecycle_stage ?? r.source_data?.lifecycle_stage) as string | undefined;
        if (!stage || !LIFECYCLE_META[stage]) continue;
        const cat = getCategory(r);
        const e = lcCatMap.get(cat) ?? {
          category: cat,
          emerging: 0, rising: 0, peak: 0, declining: 0, classic: 0, total: 0,
        };
        (e as any)[stage] += 1;
        e.total += 1;
        lcCatMap.set(cat, e);
      }
      const lifecycleByCategory: LifecycleByCategoryPoint[] = [...lcCatMap.values()]
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);


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
        .map(([keyword, count]) => ({
          keyword,
          count,
          daily: buildDaily(keyword),
          signalCount: signalKwMap.get(keyword) ?? 0,
        }));

      // ── Rising/Declining Keywords (이번 주 vs 지난 주) ─────
      const lastKwMap = new Map<string, number>();
      for (const r of lastWeekRows) {
        for (const kw of (r.trend_keywords as string[] ?? [])) {
          const k = kw?.trim().toLowerCase();
          if (k) lastKwMap.set(k, (lastKwMap.get(k) ?? 0) + 1);
        }
      }
      const allKeywords = new Set([...kwMap.keys(), ...lastKwMap.keys()]);
      const allKeywordRows: RisingKeywordPoint[] = [...allKeywords].map((keyword) => {
        const thisCount = kwMap.get(keyword) ?? 0;
        const lastCount = lastKwMap.get(keyword) ?? 0;
        const growthRate =
          lastCount === 0
            ? null
            : Math.round(((thisCount - lastCount) / lastCount) * 100);
        return {
          keyword,
          thisWeek: thisCount,
          lastWeek: lastCount,
          growthRate,
          daily: buildDaily(keyword),
          signalCount: signalKwMap.get(keyword) ?? 0,
        };
      });

      const risingKeywords: RisingKeywordPoint[] = allKeywordRows
        .filter((k) => k.thisWeek >= 1 && (k.growthRate === null || k.growthRate > 0))
        .sort((a, b) => {
          if (a.growthRate === null && b.growthRate === null) return b.thisWeek - a.thisWeek;
          if (a.growthRate === null) return -1;
          if (b.growthRate === null) return 1;
          return b.growthRate !== a.growthRate
            ? b.growthRate - a.growthRate
            : b.thisWeek - a.thisWeek;
        })
        .slice(0, 10);

      // 감소 키워드: growthRate < 0 (소멸 포함). 가장 빠르게 식는 순.
      const decliningKeywords: RisingKeywordPoint[] = allKeywordRows
        .filter((k) => k.growthRate !== null && k.growthRate < 0)
        .sort((a, b) => (a.growthRate! - b.growthRate!) || (b.lastWeek - a.lastWeek))
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

      const activeProducts        = (activeProdRes as any)?.count ?? 0;
      const prevActiveProducts    = (prevActiveProdRes as any)?.count ?? 0;

      const pct = (cur: number, prev: number): number | null =>
        prev === 0 ? (cur > 0 ? null : 0) : Math.round(((cur - prev) / prev) * 100);

      // ── KPI: 조회 ───────────────────────────────────────────
      const viewRows: any[] = (viewsCurRowsRes as any)?.data ?? [];
      const viewCurrent = viewRows.length;
      const viewDistinct = new Set(
        viewRows.map((r) => `${r.user_id}|${r.trend_id}|${(r.created_at as string).slice(0, 13)}`),
      ).size;
      const viewsPrev28 = (viewsPrev28Res as any)?.count ?? 0;

      // ── KPI: 검색 ───────────────────────────────────────────
      const searchRows: any[] = (searchesCurRowsRes as any)?.data ?? [];
      const searchCurrent = searchRows.length;
      const searchKws = new Set<string>();
      for (const s of searchRows) {
        const k = (s.keyword || s.search_query || '').trim().toLowerCase();
        if (k) searchKws.add(k);
      }
      const searchesPrev28 = (searchesPrev28Res as any)?.count ?? 0;

      // ── KPI: 외부링크 클릭률 ────────────────────────────────
      const clicksCurrent = (clicksCurRes as any)?.count ?? 0;
      const clicksPrev28  = (clicksPrev28Res as any)?.count ?? 0;
      const externalRatePct =
        viewCurrent === 0 ? null : parseFloat(((clicksCurrent / viewCurrent) * 100).toFixed(1));
      // 직전 4주 평균 클릭률 (scaled views = views * 4 in same period proportion)
      // 단순화: 28일 클릭/28일 뷰 환산 — 28일 뷰는 별도 호출 비용 → 현재 viewCurrent를 28d-scale로 추정
      const externalRateMom = periodOverPrev4Avg(clicksCurrent, clicksPrev28);

      // ── KPI: 피드백 ─────────────────────────────────────────
      const feedbackRows: any[] = (feedbackCurRowsRes as any)?.data ?? [];
      const fbPos = feedbackRows.filter((r) => r.is_relevant === true).length;
      const fbNeg = feedbackRows.filter((r) => r.is_relevant === false).length;
      const feedbackCurrent = feedbackRows.length;
      const accuracyPct =
        feedbackCurrent < 5
          ? null
          : parseFloat(((fbPos / feedbackCurrent) * 100).toFixed(1));
      const feedbackPrev28 = (feedbackPrev28Res as any)?.count ?? 0;

      setData({
        stats: {
          totalActive:           (totalRes as any)?.count  ?? 0,
          newThisPeriod:         (newThisRes as any)?.count ?? 0,
          prevNewThisPeriod:     (prevRes as any)?.count    ?? 0,
          activeProducts,
          activeProductsMomPct:  pct(activeProducts, prevActiveProducts),
          views: {
            current:       viewCurrent,
            momPct:        periodOverPrev4Avg(viewCurrent, viewsPrev28),
            distinctCount: viewDistinct,
          },
          searches: {
            current:          searchCurrent,
            momPct:           periodOverPrev4Avg(searchCurrent, searchesPrev28),
            distinctKeywords: searchKws.size,
          },
          feedback: {
            current:    feedbackCurrent,
            momPct:     periodOverPrev4Avg(feedbackCurrent, feedbackPrev28),
            positive:   fbPos,
            negative:   fbNeg,
            accuracyPct,
          },
          externalClickRate: {
            ratePct:    externalRatePct,
            clickCount: clicksCurrent,
            viewCount:  viewCurrent,
            momPct:     externalRateMom,
          },
        },
        platformData,
        lifecycleData,
        lifecycleByCategory,
        styleData,
        hotKeywords,
        risingKeywords,
        decliningKeywords,
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
