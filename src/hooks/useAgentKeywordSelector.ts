import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface AgentKeyword {
  keyword: string;
  /** 선별 출처 */
  source: 'rising' | 'hot' | 'category';
  /** 연관 라이프사이클 (출처 파악용) */
  lifecycle?: string;
}

export interface AgentKeywordResult {
  keywords: AgentKeyword[];
  /** DB에 분석 데이터가 전혀 없는 경우 */
  noData: boolean;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useAgentKeywordSelector() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 트렌드 리포트 데이터 기반 키워드 자동 선별
   *
   * 1순위: 급상승(신규, 이번 주 처음 등장) + lifecycle Emerging/Rising → 최대 3개
   * 2순위: 인기 Top10 중 count ≥ 10 + lifecycle Peak → 최대 3개
   * 3순위: 카테고리(style_tags) 전주 대비 성장률 ≥ 100% → 최대 2개
   * 폴백:  3개 미만이면 이번 주 인기 키워드 상위로 채움
   * 최종:  3~8개
   */
  const select = useCallback(async (): Promise<AgentKeywordResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const now         = Date.now();
      const oneWeekAgo  = new Date(now - 7  * 864e5).toISOString();
      const twoWeeksAgo = new Date(now - 14 * 864e5).toISOString();

      // 최근 14일치 rows 조회 (lifecycle_stage + trend_keywords + style_tags)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rows, error: fetchErr } = await (supabase as any)
        .from('trend_analyses')
        .select('trend_keywords, lifecycle_stage, style_tags, source_data, created_at')
        .eq('status', 'analyzed')
        .gte('created_at', twoWeeksAgo)
        .order('created_at', { ascending: false })
        .limit(5000);

      if (fetchErr) throw fetchErr;

      if (!rows || rows.length === 0) {
        return { keywords: [], noData: true };
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thisWeekRows = (rows as any[]).filter(r => r.created_at >= oneWeekAgo);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastWeekRows = (rows as any[]).filter(r => r.created_at <  oneWeekAgo);

      if (thisWeekRows.length === 0) {
        return { keywords: [], noData: true };
      }

      // ── 키워드별 통계 집계 ──────────────────────────────────
      // keyword → { thisWeek: number, lifecycleCounts: Map<string, number> }
      const kwThisWeek  = new Map<string, number>();
      const kwLastWeek  = new Map<string, number>();
      // keyword → lifecycle → count (이번 주)
      const kwLifecycle = new Map<string, Map<string, number>>();

      for (const r of thisWeekRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lc: string = ((r.lifecycle_stage ?? (r.source_data as any)?.lifecycle_stage) as string ?? '').toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const rawKw of ((r.trend_keywords as any[]) ?? [])) {
          const kw = typeof rawKw === 'string' ? rawKw.trim().toLowerCase() : '';
          if (!kw) continue;
          kwThisWeek.set(kw, (kwThisWeek.get(kw) ?? 0) + 1);
          if (lc) {
            if (!kwLifecycle.has(kw)) kwLifecycle.set(kw, new Map());
            const lmap = kwLifecycle.get(kw)!;
            lmap.set(lc, (lmap.get(lc) ?? 0) + 1);
          }
        }
      }
      for (const r of lastWeekRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const rawKw of ((r.trend_keywords as any[]) ?? [])) {
          const kw = typeof rawKw === 'string' ? rawKw.trim().toLowerCase() : '';
          if (kw) kwLastWeek.set(kw, (kwLastWeek.get(kw) ?? 0) + 1);
        }
      }

      /** 해당 키워드의 지배적 라이프사이클 반환 */
      const getDominantLifecycle = (kw: string): string => {
        const lmap = kwLifecycle.get(kw);
        if (!lmap || lmap.size === 0) return '';
        return [...lmap.entries()].sort((a, b) => b[1] - a[1])[0][0];
      };

      const selected = new Set<string>();

      // ── 1순위: 신규 등장 + Emerging/Rising ─────────────────
      const priority1: AgentKeyword[] = [...kwThisWeek.entries()]
        .filter(([kw]) => (kwLastWeek.get(kw) ?? 0) === 0)               // 신규
        .filter(([kw]) => ['emerging', 'rising'].includes(getDominantLifecycle(kw)))
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([kw]) => {
          selected.add(kw);
          return { keyword: kw, source: 'rising' as const, lifecycle: getDominantLifecycle(kw) };
        });

      // ── 2순위: 인기 Top10 + count ≥ 10 + Peak ─────────────
      const priority2: AgentKeyword[] = [...kwThisWeek.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .filter(([kw, count]) => count >= 10 && getDominantLifecycle(kw) === 'peak' && !selected.has(kw))
        .slice(0, 3)
        .map(([kw]) => {
          selected.add(kw);
          return { keyword: kw, source: 'hot' as const, lifecycle: 'peak' };
        });

      // ── 3순위: 카테고리 성장률 ≥ 100% ─────────────────────
      const catThis = new Map<string, number>();
      const catLast = new Map<string, number>();
      for (const r of thisWeekRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tags: string[] = (r.style_tags ?? (r.source_data as any)?.style_tags ?? []).filter(Boolean);
        for (const t of tags) catThis.set(t, (catThis.get(t) ?? 0) + 1);
      }
      for (const r of lastWeekRows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tags: string[] = (r.style_tags ?? (r.source_data as any)?.style_tags ?? []).filter(Boolean);
        for (const t of tags) catLast.set(t, (catLast.get(t) ?? 0) + 1);
      }
      const priority3: AgentKeyword[] = [...catThis.entries()]
        .map(([cat, thisCount]) => {
          const lastCount  = catLast.get(cat) ?? 0;
          const changeRate = lastCount === 0
            ? (thisCount > 0 ? 100 : 0)
            : Math.round(((thisCount - lastCount) / lastCount) * 100);
          return { cat, changeRate };
        })
        .filter(({ cat, changeRate }) => changeRate >= 100 && !selected.has(cat.toLowerCase()))
        .sort((a, b) => b.changeRate - a.changeRate)
        .slice(0, 2)
        .map(({ cat }) => {
          selected.add(cat.toLowerCase());
          return { keyword: cat, source: 'category' as const };
        });

      let allKeywords: AgentKeyword[] = [...priority1, ...priority2, ...priority3];

      // ── 폴백: 3개 미만이면 이번 주 인기 키워드로 채움 ──────
      if (allKeywords.length < 3) {
        const fallback: AgentKeyword[] = [...kwThisWeek.entries()]
          .sort(([, a], [, b]) => b - a)
          .filter(([kw]) => !selected.has(kw))
          .slice(0, 3 - allKeywords.length)
          .map(([kw]) => ({ keyword: kw, source: 'hot' as const, lifecycle: getDominantLifecycle(kw) }));
        allKeywords = [...allKeywords, ...fallback];
      }

      // 데이터는 있지만 기준을 아무것도 충족 못 하는 경우도 noData = false
      // (폴백이 있으므로 키워드가 0개인 경우만 noData)
      const noData = allKeywords.length === 0;
      return { keywords: allKeywords.slice(0, 8), noData };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '키워드 선별 실패';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, select };
}
