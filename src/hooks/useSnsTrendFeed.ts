import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TrendFeedItem {
  id: string;
  platform: string;
  image_url: string;
  permalink: string;
  author: string;
  like_count: number;
  view_count: number;
  trend_name: string;
  trend_score: number;
  summary_ko: string;
  magazine_name?: string;
  article_title?: string;
  trend_keywords: string[];
  trend_categories: string[];
  search_hashtags: string[];
  ai_analyzed: boolean;
  ai_keywords: Array<{ keyword: string; type: string }>;
  created_at: string;
  source_data?: Record<string, any>;
  // FashionGo 전용 바이어 시그널
  fg_view_count?: number;
  fg_click_count?: number;
  fg_wishlist_count?: number;
  fg_search_count?: number;
  signal_strength?: number;
  buyer_segment?: string;
  // 스타일 분류 (마이그레이션 20260429000000)
  primary_category?: string | null;
  style_tags?: string[] | null;
}

export type PlatformFilter = 'all' | 'instagram' | 'tiktok' | 'vogue' | 'elle' | 'wwd' | 'hypebeast' | 'highsnobiety' | 'footwearnews' | 'google' | 'amazon' | 'pinterest' | 'fashiongo' | 'shein';

export function useSnsTrendFeed(platformFilter: PlatformFilter = 'all') {
  const [items, setItems] = useState<TrendFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFeed = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('trend_analyses')
        .select('*')
        .eq('status', 'analyzed')
        .order('created_at', { ascending: false })
        .limit(500);

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;

      const FALLBACK_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

      const mapped: TrendFeedItem[] = (data || [])
        .map((row: any) => {
          const sd = row.source_data || {};
          const platform = sd.platform || 'unknown';
          const rawImage = sd.image_url || '';
          const imageUrl = rawImage.trim() || FALLBACK_PLACEHOLDER;
          return {
            id: row.id,
            platform,
            image_url: imageUrl,
            permalink: sd.permalink || '',
            author: sd.author || '',
            like_count: Number(sd.like_count) || 0,
            view_count: Number(sd.view_count) || 0,
            trend_name: sd.trend_name || sd.article_title || '',
            trend_score: Number(sd.trend_score) || 0,
            summary_ko: (sd.summary_ko && sd.summary_ko !== 'GPT 미연동 - 기본 수집') ? sd.summary_ko : '',
            magazine_name: sd.magazine_name,
            article_title: sd.article_title,
            trend_keywords: row.trend_keywords || [],
            trend_categories: row.trend_categories || [],
            search_hashtags: sd.search_hashtags || [],
            ai_analyzed: !!sd.ai_analyzed,
            ai_keywords: sd.ai_keywords || [],
            created_at: row.created_at,
            source_data: sd,
            // FashionGo 전용
            fg_view_count:     sd.fg_view_count     != null ? Number(sd.fg_view_count)     : undefined,
            fg_click_count:    sd.fg_click_count     != null ? Number(sd.fg_click_count)    : undefined,
            fg_wishlist_count: sd.fg_wishlist_count  != null ? Number(sd.fg_wishlist_count) : undefined,
            fg_search_count:   sd.fg_search_count    != null ? Number(sd.fg_search_count)   : undefined,
            signal_strength:   sd.signal_strength    != null ? Number(sd.signal_strength)   : undefined,
            buyer_segment:     sd.buyer_segment      as string | undefined,
            // 스타일 분류: top-level 컬럼 우선, source_data fallback
            primary_category:  (row as any).primary_category ?? sd.primary_category ?? null,
            style_tags:        Array.isArray((row as any).style_tags)
              ? (row as any).style_tags as string[]
              : Array.isArray(sd.style_tags) ? sd.style_tags as string[] : null,
          };
        })
        .filter((item: TrendFeedItem) => {
          if (platformFilter === 'all') return true;
          return item.platform === platformFilter;
        });

      setItems(mapped);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch trend feed');
    } finally {
      setLoading(false);
    }
  }, [platformFilter]);

  useEffect(() => {
    fetchFeed();
  }, [fetchFeed]);

  return { items, loading, error, refetch: fetchFeed };
}
