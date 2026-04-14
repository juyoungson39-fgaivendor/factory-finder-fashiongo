import { useMutation, useQueryClient } from '@tanstack/react-query';
import { alibabaApi } from '../client';
import type { SyncDataRequest, SyncDataResponse } from '../types';
import { useToast } from '@/hooks/use-toast';
import { CONNECTIONS_KEY } from './use-alibaba-connections';

/**
 * Trigger an immediate data sync for a given connection.
 * Invalidates the connections query on success so last_synced_at refreshes.
 */
export function useTriggerSync() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<SyncDataResponse, Error, SyncDataRequest>({
    mutationFn: (req) => alibabaApi.triggerSync(req),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      if (data.status === 'completed') {
        toast({
          title: 'Sync completed',
          description: `${data.records_synced} records synced`,
        });
      } else if (data.status === 'partial') {
        toast({
          title: 'Sync partially completed',
          description: `${data.records_synced} records synced. ${data.error_message ?? ''}`.trim(),
          variant: 'default',
        });
      }
    },
    onError: (err) => {
      toast({
        title: 'Sync failed',
        description: err.message,
        variant: 'destructive',
      });
    },
  });
}
