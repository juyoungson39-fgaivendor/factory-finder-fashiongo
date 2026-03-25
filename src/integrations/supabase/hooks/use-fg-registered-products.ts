import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';
import { vaApi } from '@/integrations/va-api/client';
import type { FGProductListResponse } from '@/integrations/va-api/types';

type FgRegisteredProductInsert = Database['public']['Tables']['fg_registered_products']['Insert'];
type FgRegisteredProductRow = Database['public']['Tables']['fg_registered_products']['Row'];

export function useInsertFgRegisteredProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<FgRegisteredProductRow, Error, FgRegisteredProductInsert>({
    mutationFn: async (data) => {
      const { data: inserted, error } = await supabase
        .from('fg_registered_products')
        .insert(data)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return inserted;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fg-registered-products'] });
    },
    onError: (err) => {
      toast({
        title: 'FG 등록 이력 저장 실패',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}

export function useFgRegisteredProducts(vendorKey?: string) {
  return useQuery<FgRegisteredProductRow[]>({
    queryKey: ['fg-registered-products', vendorKey],
    queryFn: async () => {
      let query = supabase
        .from('fg_registered_products')
        .select('*')
        .order('registered_at', { ascending: false });

      if (vendorKey) {
        query = query.eq('vendor_key', vendorKey);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useSyncRegisteredProductStatus(wholesalerId: number | undefined) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['fg-registered-products-sync', wholesalerId],
    queryFn: async () => {
      if (!wholesalerId) return null;

      // 1. Supabase에서 status = 'registered'인 레코드 조회
      const { data: pendingRows, error: supabaseError } = await supabase
        .from('fg_registered_products')
        .select('id, fg_product_id')
        .eq('status', 'registered');

      if (supabaseError) throw new Error(supabaseError.message);
      if (!pendingRows || pendingRows.length === 0) return { synced: 0 };

      const pendingProductIds = new Set(pendingRows.map((r) => r.fg_product_id));

      // 2. VA API에서 해당 wholesaler의 상품 목록 조회 (best-effort: 실패 시 skip)
      let vaItems: FGProductListResponse['items'] = [];
      try {
        const response = await vaApi.get<FGProductListResponse>('/products', {
          wholesalerId,
          size: 200,
        });
        vaItems = response.items;
      } catch {
        // VA API 실패 시 동기화 skip
        return { synced: 0 };
      }

      // 3. isActive=true인 상품 중 pending 목록에 있는 것만 추출
      const toActivate = vaItems.filter(
        (item) => item.isActive && pendingProductIds.has(item.productId)
      );
      if (toActivate.length === 0) return { synced: 0 };

      // 4. Supabase UPDATE: status = 'activated', activated_at = activatedOn
      let synced = 0;
      for (const item of toActivate) {
        const { error: updateError } = await supabase
          .from('fg_registered_products')
          .update({
            status: 'activated',
            activated_at: item.activatedOn ?? new Date().toISOString(),
          })
          .eq('fg_product_id', item.productId)
          .eq('status', 'registered');

        if (!updateError) synced++;
      }

      if (synced > 0) {
        queryClient.invalidateQueries({ queryKey: ['fg-registered-products'] });
      }

      return { synced };
    },
    enabled: !!wholesalerId,
    staleTime: 5 * 60 * 1000, // 5분
    retry: false,
  });
}
