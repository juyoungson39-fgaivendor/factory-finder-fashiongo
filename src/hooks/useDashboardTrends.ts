import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { TrendKeyword } from '@/data/trendMockData';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function dateOf(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

/** 값을 [min, max] 범위로 클램프 */
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

/** 빈도 순위 기반 trend_score 도출 (50~99) */
function scoreFromRank(rank: number, total: number): number {
  if (total <= 1) return 75;
  return clamp(99 - Math.round(((rank - 1) / (total - 1)) * 49), 50, 99);
}

// ─────────────────────────────────────────────────────────────
// Fetcher
// ─────────────────────────────────────────────────────────────
async function fetchDashboardTrends(): Promise<TrendKeyword[]> {
  const oneWeekAgo  = dateOf(7);
  const twoWeeksAgo = dateOf(14);
  const thirtyAgo   = dateOf(30);

  // 최근 30일 rows (history 계산용)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows, error } = await (supabase as any)
    .from('trend_analyses')
    .select('created_at, trend_keywords, style_tags, source_data, lifecycle_stage')
    .eq('status', 'analyzed')
    .gte('created_at', thirtyAgo)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const thisWeekRows  = (rows as any[]).filter((r) => r.created_at >= oneWeekAgo);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastWeekRows  = (rows as any[]).filter((r) => r.created_at >= twoWeeksAgo && r.created_at < oneWeekAgo);

  if (thisWeekRows.length === 0) return [];

  // ── 이번 주 키워드 빈도 ──────────────────────────────────
  const kwThisWeek  = new Map<string, number>();
  const kwLastWeek  = new Map<string, number>();
  // keyword → style_tag 후보 (첫 번째로 발견된 것 사용)
  const kwCategory  = new Map<string, string>();
  // keyword → platform → count (이번 주)
  const kwPlatform  = new Map<string, Map<string, number>>();
  // keyword → dayKey → count (이번 달 30일)
  const kwDaily     = new Map<string, Map<string, number>>();

  const getDayKey = (iso: string) => iso.slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (rows as any[])) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const kws: string[] = (r.trend_keywords as any[]) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tags: string[] = (r.style_tags as any[]) ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sd: Record<string, any> = r.source_data ?? {};
    const platform: string = (sd.platform ?? sd.source ?? 'unknown').toLowerCase();
    const dayKey = getDayKey(r.created_at as string);

    for (const rawKw of kws) {
      const kw = typeof rawKw === 'string' ? rawKw.trim().toLowerCase() : '';
      if (!kw) continue;

      // daily history
      if (!kwDaily.has(kw)) kwDaily.set(kw, new Map());
      const dmap = kwDaily.get(kw)!;
      dmap.set(dayKey, (dmap.get(dayKey) ?? 0) + 1);

      // category (첫 style_tag 우선)
      if (!kwCategory.has(kw) && tags.length > 0) {
        kwCategory.set(kw, tags[0]);
      }

      // this/last week frequency + platform
      if (r.created_at >= oneWeekAgo) {
        kwThisWeek.set(kw, (kwThisWeek.get(kw) ?? 0) + 1);
        if (!kwPlatform.has(kw)) kwPlatform.set(kw, new Map());
        const pmap = kwPlatform.get(kw)!;
        pmap.set(platform, (pmap.get(platform) ?? 0) + 1);
      } else if (r.created_at >= twoWeeksAgo) {
        kwLastWeek.set(kw, (kwLastWeek.get(kw) ?? 0) + 1);
      }
    }
  }

  if (kwThisWeek.size === 0) return [];

  // ── 키워드 선별 ──────────────────────────────────────────
  // 1순위: 신규 등장(지난 주 0건) → 이번 주 빈도 내림차순 → 최대 3개
  const rising = [...kwThisWeek.entries()]
    .filter(([kw]) => (kwLastWeek.get(kw) ?? 0) === 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([kw]) => kw);

  // 2순위: 나머지 인기 키워드 → 최대 (6 - rising.length)개
  const risingSet = new Set(rising);
  const hot = [...kwThisWeek.entries()]
    .filter(([kw]) => !risingSet.has(kw))
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6 - rising.length)
    .map(([kw]) => kw);

  const selectedKws = [...rising, ...hot].slice(0, 6);
  if (selectedKws.length === 0) return [];

  // ── TrendKeyword 구성 ─────────────────────────────────────
  const allCounts = [...kwThisWeek.values()];
  const maxCount  = Math.max(...allCounts, 1);

  // 30일 날짜 목록 생성 (today-29 … today)
  const last30Days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    last30Days.push(d.toISOString().slice(0, 10));
  }

  return selectedKws.map((kw, rankIdx) => {
    const thisCount = kwThisWeek.get(kw) ?? 0;
    const lastCount = kwLastWeek.get(kw) ?? 0;
    const isNew = lastCount === 0;
    const growthPct = isNew
      ? clamp(30 + thisCount * 5, 10, 120)
      : clamp(Math.round(((thisCount - lastCount) / lastCount) * 100), -30, 120);

    // platform 분포
    const pmap = kwPlatform.get(kw) ?? new Map<string, number>();
    const pTotal = [...pmap.values()].reduce((s, v) => s + v, 0) || 1;
    const getP = (...names: string[]) =>
      names.reduce((s, n) => s + (pmap.get(n) ?? 0), 0);

    const googlePct  = getP('google', 'magazine');
    const socialPct  = getP('instagram', 'tiktok', 'pinterest', 'sns');
    const salesPct   = getP('amazon', 'fashiongo', 'shein', 'zara');

    // 채널 점수: 해당 플랫폼 비중 × (50~95) + 기본 55
    const google = clamp(55 + Math.round((googlePct / pTotal) * 40), 50, 98);
    const social = clamp(55 + Math.round((socialPct / pTotal) * 40), 50, 98);
    const sales  = clamp(55 + Math.round((salesPct  / pTotal) * 40), 50, 98);

    // trend_score: 이번 주 빈도 → 50~99 범위
    const trend_score = clamp(
      50 + Math.round((thisCount / maxCount) * 49),
      50,
      99,
    );

    // 30일 히스토리
    const dmap = kwDaily.get(kw) ?? new Map<string, number>();
    const maxDay = Math.max(...[...dmap.values()], 1);
    const history = last30Days.map((day) => {
      const c = dmap.get(day) ?? 0;
      // 0건인 날도 소폭의 기준값(40~55) 표시, 있는 날은 비례
      return c === 0
        ? clamp(40 + Math.round(Math.random() * 15), 38, 58)
        : clamp(55 + Math.round((c / maxDay) * 42), 55, 99);
    });

    // category: style_tag 첫 번째, 없으면 'Fashion'
    const rawCat = kwCategory.get(kw) ?? 'Fashion';
    // style_tag를 영문 카테고리로 정규화 (가능한 경우)
    const catNorm = normalizeCat(rawCat);

    void rankIdx; // suppress unused warning

    return {
      keyword: kw,
      trend_score,
      google,
      social,
      sales,
      change: growthPct,
      category: catNorm,
      history,
    } satisfies TrendKeyword;
  });
}

// ─────────────────────────────────────────────────────────────
// style_tag → CATEGORY_COLORS key 정규화
// ─────────────────────────────────────────────────────────────
const CAT_MAP: Record<string, string> = {
  // 한글 → 영문
  '상의': 'Tops', '하의': 'Bottoms', '아우터': 'Outerwear',
  '신발': 'Shoes', '악세사리': 'Accessories', '드레스': 'Dresses',
  '원피스': 'Dresses', '팬츠': 'Bottoms', '스커트': 'Bottoms',
  '자켓': 'Outerwear', '코트': 'Outerwear',
  // 영문 그대로
  tops: 'Tops', bottoms: 'Bottoms', outerwear: 'Outerwear',
  shoes: 'Shoes', accessories: 'Accessories', dresses: 'Dresses',
  pants: 'Bottoms', skirt: 'Bottoms', jacket: 'Outerwear',
  coat: 'Outerwear', sneakers: 'Shoes', bags: 'Accessories',
};

function normalizeCat(raw: string): string {
  if (!raw) return 'Fashion';
  const lower = raw.toLowerCase().trim();
  return CAT_MAP[lower] ?? CAT_MAP[raw] ?? raw;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useDashboardTrends() {
  const { data, isLoading, error } = useQuery<TrendKeyword[]>({
    queryKey: ['dashboard-trends'],
    queryFn: fetchDashboardTrends,
    staleTime: 5 * 60_000,   // 5분 캐시
    refetchOnWindowFocus: false,
  });

  const trends  = data ?? [];
  const noData  = !isLoading && !error && trends.length === 0;

  return { trends, loading: isLoading, noData, error: error?.message ?? null };
}
