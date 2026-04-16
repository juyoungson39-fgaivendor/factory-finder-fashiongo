import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Supabase generated types do not yet include alibaba_* tables (pending `supabase gen types`
// after migration deploy). This is a deliberate, scoped escape — do NOT widen usage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as any;

interface AlibabaDataQueryConfig<T> {
  /** Segment used in the React Query key: ['alibaba', segment, connectionId] */
  queryKeySegment: string;
  /** Supabase table name */
  table: string;
  /** Column to sort by (descending) */
  orderBy: string;
}

/**
 * Factory that creates a React Query hook for fetching Alibaba synced data
 * from a local Supabase table filtered by connectionId.
 *
 * All three data hooks (products, orders, inventory) follow the same pattern —
 * only the table, type, and sort column differ.
 */
export function createAlibabaDataHook<T>(config: AlibabaDataQueryConfig<T>) {
  return function useAlibabaData(connectionId: string | null) {
    return useQuery<T[]>({
      queryKey: ['alibaba', config.queryKeySegment, connectionId],
      queryFn: async () => {
        const { data, error } = await supabaseUntyped
          .from(config.table)
          .select('*')
          .eq('connection_id', connectionId!)
          .order(config.orderBy, { ascending: false });

        if (error) throw new Error(error.message);
        return data as T[];
      },
      enabled: !!connectionId,
    });
  };
}
