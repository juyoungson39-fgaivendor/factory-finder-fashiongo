import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// The supabase generated types haven't been regenerated since these tables
// landed in this migration. Scoped escape — do NOT widen usage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as any;

// ---------------------------------------------------------------------------
// Types — mirror the migration schema (kept narrow to what the UI needs)
// ---------------------------------------------------------------------------

export interface FactoryAlibabaProduct {
  id: string;
  factory_id: string;
  alibaba_product_id: string;
  alibaba_url: string | null;
  title: string | null;
  main_image_url: string | null;
  price_text: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  moq_text: string | null;
  moq_value: number | null;
  moq_unit: string | null;
  scraped_at: string;
  source_page: string | null;
}

export interface FactoryAlibabaCrawlResult {
  factory_id: string;
  status: 'completed' | 'failed' | 'skipped';
  records_synced: number;
  error_message?: string;
  source_page?: string;
  duration_ms: number;
}

interface FactoryAlibabaCrawlResponse {
  success: boolean;
  summary?: {
    selected: number;
    completed: number;
    failed: number;
    skipped: number;
    total_records: number;
  };
  results?: FactoryAlibabaCrawlResult[];
  error?: string;
}

export const FACTORY_ALIBABA_PRODUCTS_KEY = ['factory-alibaba-products'] as const;

// ---------------------------------------------------------------------------
// Fetch — list scraped products for a single factory
// ---------------------------------------------------------------------------

export function useFactoryAlibabaProducts(factoryId: string | null) {
  return useQuery<FactoryAlibabaProduct[]>({
    queryKey: [...FACTORY_ALIBABA_PRODUCTS_KEY, factoryId],
    queryFn: async () => {
      if (!factoryId) return [];
      const { data, error } = await supabaseUntyped
        .from('factory_alibaba_products')
        .select(
          'id, factory_id, alibaba_product_id, alibaba_url, title, main_image_url, ' +
          'price_text, price_min, price_max, currency, moq_text, moq_value, moq_unit, ' +
          'scraped_at, source_page',
        )
        .eq('factory_id', factoryId)
        .order('scraped_at', { ascending: false });

      if (error) throw new Error(error.message);
      return (data ?? []) as FactoryAlibabaProduct[];
    },
    enabled: !!factoryId,
  });
}

// ---------------------------------------------------------------------------
// Trigger — kick off a crawl for one factory (or many)
// ---------------------------------------------------------------------------

interface TriggerArgs {
  /** Crawl just this factory. */
  factory_id?: string;
  /** Crawl a specific list of factories. */
  factory_ids?: string[];
  /** Crawl all factories with overall_score >= this (default 60 on the server). */
  min_score?: number;
  /** Cap how many factories to crawl in this invocation (default 20 on the server). */
  limit?: number;
}

export function useTriggerFactoryAlibabaCrawl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<FactoryAlibabaCrawlResponse, Error, TriggerArgs>({
    mutationFn: async (req) => {
      const { data, error } = await supabase.functions.invoke('crawl-alibaba-products', {
        body: req,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as FactoryAlibabaCrawlResponse;
    },
    onSuccess: (data, variables) => {
      // Refresh whichever factory views were touched.
      if (variables.factory_id) {
        queryClient.invalidateQueries({
          queryKey: [...FACTORY_ALIBABA_PRODUCTS_KEY, variables.factory_id],
        });
      } else {
        queryClient.invalidateQueries({ queryKey: FACTORY_ALIBABA_PRODUCTS_KEY });
      }

      const summary = data.summary;
      if (!summary) {
        toast({ title: 'Crawl completed' });
        return;
      }
      if (summary.completed > 0 && summary.failed === 0) {
        toast({
          title: '알리바바 상품 크롤링 완료',
          description: `${summary.completed}개 공장 · 총 ${summary.total_records}개 상품`,
        });
      } else if (summary.completed > 0 && summary.failed > 0) {
        toast({
          title: '알리바바 상품 크롤링 부분 완료',
          description: `성공 ${summary.completed} · 실패 ${summary.failed} · 총 ${summary.total_records}개 상품`,
        });
      } else if (summary.skipped > 0 && summary.completed === 0) {
        toast({
          title: '크롤링 건너뜀',
          description: `${summary.skipped}개 공장 — alibaba_supplier_id 또는 alibaba_url 없음`,
          variant: 'default',
        });
      } else {
        toast({
          title: '크롤링 실패',
          description: `실패 ${summary.failed}개 · 결과 없음`,
          variant: 'destructive',
        });
      }
    },
    onError: (err) => {
      toast({
        title: '크롤링 실패',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
