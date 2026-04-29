import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────
// Session ID — 페이지 생존 동안 유지
// ─────────────────────────────────────────────────────────────
const SESSION_ID =
  typeof crypto !== 'undefined'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

async function resolveUserId(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export interface BuyerSignalTracker {
  /** 검색 키워드 추적 (debounce 500ms) */
  trackSearch: (keyword: string) => void;
  /** 카드 뷰 추적 시작 — 3초 체류 시 기록 */
  trackView: (trendId: string) => void;
  /** 3초 미만으로 이탈 시 타이머 취소 */
  cancelView: (trendId: string) => void;
  /** 매칭 상품 클릭 추적 */
  trackMatchClick: (trendId: string, matchId?: string) => void;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
export function useBuyerSignalTracker(): BuyerSignalTracker {
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewTimersRef  = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // 공통 INSERT 헬퍼
  const insertSignal = useCallback(async (payload: Record<string, unknown>) => {
    const userId = await resolveUserId();
    if (!userId) return;
    try {
      await supabase.from('fg_buyer_signals').insert({
        user_id:     userId,
        signal_date: new Date().toISOString().split('T')[0],
        session_id:  SESSION_ID,
        source_data: { page: 'trend' },
        ...payload,
      });
    } catch {
      // non-critical — silent fail
    }
  }, []);

  // ── 검색 추적 (debounce 500ms) ────────────────────────────
  const trackSearch = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (!keyword.trim()) return;
      insertSignal({
        signal_type:  'search',
        search_query: keyword.trim(),
        keyword:      keyword.trim(),
      });
    }, 500);
  }, [insertSignal]);

  // ── 뷰 추적 (3초 체류 시 기록) ───────────────────────────
  const trackView = useCallback((trendId: string) => {
    if (viewTimersRef.current[trendId]) return; // 이미 추적 중
    viewTimersRef.current[trendId] = setTimeout(() => {
      insertSignal({ signal_type: 'view', trend_id: trendId });
      delete viewTimersRef.current[trendId];
    }, 3_000);
  }, [insertSignal]);

  // ── 뷰 타이머 취소 ────────────────────────────────────────
  const cancelView = useCallback((trendId: string) => {
    if (viewTimersRef.current[trendId]) {
      clearTimeout(viewTimersRef.current[trendId]);
      delete viewTimersRef.current[trendId];
    }
  }, []);

  // ── 매칭 상품 클릭 추적 ───────────────────────────────────
  const trackMatchClick = useCallback((trendId: string, matchId?: string) => {
    insertSignal({
      signal_type: 'click_match',
      trend_id:    trendId,
      source_data: { page: 'trend', match_id: matchId },
    });
  }, [insertSignal]);

  // ── Cleanup ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      Object.values(viewTimersRef.current).forEach(clearTimeout);
    };
  }, []);

  return { trackSearch, trackView, cancelView, trackMatchClick };
}
