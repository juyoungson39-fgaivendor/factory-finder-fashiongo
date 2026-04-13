// Mutation hook: disconnect an Alibaba shop.
// Invalidates the connection list on success.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { disconnect } from '../client';
import type { DisconnectRequest, DisconnectResponse } from '../types';
import { ALIBABA_CONNECTIONS_QUERY_KEY } from './use-alibaba-connections';

export function useDisconnectAlibaba(): UseMutationResult<DisconnectResponse, Error, DisconnectRequest> {
  const queryClient = useQueryClient();

  return useMutation<DisconnectResponse, Error, DisconnectRequest>({
    mutationFn: (args) => disconnect(args),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ALIBABA_CONNECTIONS_QUERY_KEY });
      toast.success('Alibaba 상점 연결이 해제되었습니다.');
    },
    onError: (err) => {
      console.error('[useDisconnectAlibaba] failed', err);
      toast.error('연결 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    },
  });
}
