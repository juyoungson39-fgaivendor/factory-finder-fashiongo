import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { vaApi } from '@/integrations/va-api/client';
import type { FGProductDetail, FGProductRegistrationRequest } from '@/integrations/va-api/types';
import { AI_VENDORS } from '@/integrations/va-api/vendor-config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

type FashiongoQueueRow = Database['public']['Tables']['fashiongo_queue']['Row'];
type FgRegisteredProductInsert = Database['public']['Tables']['fg_registered_products']['Insert'];

/** Shape of product_data stored in fashiongo_queue */
interface QueueProductData {
  matched_keywords?: string[];
  match_score?: number;
  reasoning?: string;
  products?: Array<{
    name: string;
    category: string;
    wholesalePrice: string;
    retailPrice: string;
    sizes: string;
    colors: string;
  }>;
  notes?: string;
  ai_model_image?: string;
}

export type { FashiongoQueueRow };

/** Normalized queue item enriched with factory name */
export interface FashiongoQueueItem extends FashiongoQueueRow {
  factories?: { name: string; overall_score: number | null } | null;
}

/** Pending queue items for the current user */
export function useFashiongoQueue() {
  const { user } = useAuth();
  return useQuery<FashiongoQueueItem[]>({
    queryKey: ['fashiongo-queue', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fashiongo_queue')
        .select('*, factories(name, overall_score)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FashiongoQueueItem[];
    },
    enabled: !!user,
  });
}

export interface ProcessQueueItemParams {
  queueItemId: string;
  vendorKey: string; // AI vendor id e.g. 'basic', 'trend'
  /** Optional override for product name — defaults to first product in product_data.products */
  itemName?: string;
  categoryId?: number;
  parentCategoryId?: number;
  parentParentCategoryId?: number;
}

/**
 * Processes a single fashiongo_queue item:
 * 1. Calls VA API to register the product
 * 2. On success: updates queue status → 'completed', inserts into fg_registered_products
 * 3. On failure: updates queue status → 'failed', records error_message
 */
export function useProcessQueueItem() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation<FGProductDetail, Error, ProcessQueueItemParams>({
    mutationFn: async ({ queueItemId, vendorKey, itemName, categoryId, parentCategoryId, parentParentCategoryId }) => {
      // 1. Fetch queue item
      const { data: queueItem, error: fetchError } = await supabase
        .from('fashiongo_queue')
        .select('*')
        .eq('id', queueItemId)
        .single();
      if (fetchError || !queueItem) throw new Error(fetchError?.message ?? 'Queue item not found');

      const productData = (queueItem.product_data as QueueProductData) ?? {};
      const firstProduct = productData.products?.[0];
      const resolvedItemName = itemName ?? firstProduct?.name ?? 'AI 등록 상품';

      // Resolve vendor config
      const vendor = AI_VENDORS.find((v) => v.id === vendorKey);
      if (!vendor) throw new Error(`Vendor not found: ${vendorKey}`);

      // Parse price — wholesalePrice may be a string like "15.00"
      const unitPrice = firstProduct?.wholesalePrice ? parseFloat(firstProduct.wholesalePrice) : undefined;

      // 2. Build registration request
      const regRequest: FGProductRegistrationRequest = {
        wholesalerId: vendor.wholesalerId,
        productName: resolvedItemName,
        itemName: resolvedItemName,
        categoryId: categoryId ?? 1,
        parentCategoryId: parentCategoryId ?? 0,
        parentParentCategoryId: parentParentCategoryId ?? 0,
        unitPrice,
        colorId: vendor.defaultColorId,
        imageUrl: productData.ai_model_image,
        autoActivate: false,
      };

      // 3. Call VA API
      let registered: FGProductDetail;
      try {
        registered = await vaApi.post<FGProductDetail>('/products', regRequest as unknown as Record<string, unknown>);
      } catch (err) {
        // Mark as failed
        const errMsg = err instanceof Error ? err.message : String(err);
        await supabase
          .from('fashiongo_queue')
          .update({ status: 'failed', error_message: errMsg, updated_at: new Date().toISOString() })
          .eq('id', queueItemId);
        throw err;
      }

      // 4. On success — update queue status
      await supabase
        .from('fashiongo_queue')
        .update({ status: 'completed', listed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', queueItemId);

      // 5. Insert into fg_registered_products
      const record: FgRegisteredProductInsert = {
        fg_product_id: registered.productId,
        item_name: registered.itemName,
        style_no: registered.styleNo ?? null,
        vendor_key: vendorKey,
        wholesaler_id: vendor.wholesalerId,
        category_id: registered.categoryId ?? null,
        color_id: vendor.defaultColorId,
        image_url: registered.imageUrl ?? null,
        unit_price: registered.unitPrice ?? null,
        status: 'registered',
        source_type: 'fashiongo_queue',
        source_id: queueItemId,
        user_id: user?.id ?? null,
        registered_at: new Date().toISOString(),
      };

      await supabase.from('fg_registered_products').insert(record);

      return registered;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fashiongo-queue'] });
      queryClient.invalidateQueries({ queryKey: ['fg-registered-products'] });
    },
    onError: (err) => {
      toast({
        title: '큐 처리 실패',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
