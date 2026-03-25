import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface InstagramTrendItem {
  id: string;
  image_url: string;
  caption: string;
  permalink: string;
  media_type: string;
  timestamp: string;
  like_count: number;
  comments_count: number;
  tags: string[];
  mentions: string[];
  source_type: string;
}

export interface AIGeneratedTrend {
  style_name: string;
  celebrity: string;
  description: string;
  source: string;
  source_handle: string;
  engagement: string;
  change_pct: number;
  category: string;
  tags: string[];
  unsplash_query: string;
}

export type TrendSource = 'instagram_api' | 'ai_generated' | 'mock' | 'none';

interface FetchResult {
  success: boolean;
  source: TrendSource;
  data: InstagramTrendItem[] | AIGeneratedTrend[];
  message?: string;
  count?: number;
}

export function useInstagramTrends() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trends, setTrends] = useState<FetchResult | null>(null);
  const { toast } = useToast();

  const fetchTrends = async (options?: {
    hashtags?: string[];
    limit?: number;
    ig_user_id?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'fetch-instagram-trends',
        {
          body: {
            hashtags: options?.hashtags || ['streetstyle', 'ootd', 'fashiontrend', 'celebritystyle'],
            limit: options?.limit || 20,
            ig_user_id: options?.ig_user_id,
          },
        }
      );

      if (fnError) throw fnError;

      const result = data as FetchResult;
      setTrends(result);

      if (result.source === 'ai_generated') {
        toast({
          title: 'AI 트렌드 생성',
          description: 'Instagram API 연결 실패로 AI가 트렌드를 생성했습니다.',
        });
      } else if (result.source === 'instagram_api') {
        toast({
          title: '실시간 트렌드 로드 완료',
          description: `Instagram에서 ${result.count}개의 트렌드를 가져왔습니다.`,
        });
      }

      return result;
    } catch (err: any) {
      const msg = err.message || 'Instagram 트렌드를 가져오는데 실패했습니다.';
      setError(msg);
      toast({
        title: '트렌드 로드 실패',
        description: msg,
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { fetchTrends, trends, loading, error };
}
