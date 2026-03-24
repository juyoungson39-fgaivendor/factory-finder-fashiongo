import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useToast } from '@/hooks/use-toast';

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
