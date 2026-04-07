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
  created_at: string;
}

type PlatformFilter = 'all' | 'instagram' | 'tiktok' | 'magazine';

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
        .limit(50);

      const { data, error: dbError } = await query;
      if (dbError) throw dbError;

      const FALLBACK_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

      const mapped: TrendFeedItem[] = (data || [])
        .map((row: any) => {
          const sd = row.source_data || {};
          const platform = sd.platform || 'unknown';
          // Ensure image_url is never empty – use placeholder as fallback
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
            summary_ko: sd.summary_ko || '',
            magazine_name: sd.magazine_name,
            article_title: sd.article_title,
            trend_keywords: row.trend_keywords || [],
            trend_categories: row.trend_categories || [],
            created_at: row.created_at,
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
