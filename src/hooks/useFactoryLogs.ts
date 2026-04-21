import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type FactoryLogEvent =
  | 'FACTORY_CREATED'
  | 'FACTORY_UPDATED'
  | 'FACTORY_DELETED'
  | 'FACTORY_RESTORED'
  | 'FACTORY_HARD_DELETED';

export interface FactoryLog {
  id: string;
  factory_id: string;
  user_id: string;
  event_type: FactoryLogEvent | string;
  event_message: string;
  event_data: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

/**
 * Fetch change-history logs for a single factory (or all factories when factoryId is undefined).
 * Returns newest-first.
 */
export function useFactoryLogs(factoryId?: string, limit = 100) {
  return useQuery<FactoryLog[]>({
    queryKey: ['factory-logs', factoryId, limit],
    queryFn: async () => {
      let q = supabase
        .from('factory_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (factoryId) q = q.eq('factory_id', factoryId);

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as FactoryLog[];
    },
    staleTime: 30_000,
  });
}
