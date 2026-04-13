// Mutation hook: start the Alibaba OAuth flow by redirecting the browser
// to the authorize URL returned by the Edge Function.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { startOAuth } from '../client';
import type { AlibabaPlatform } from '../types';

export interface ConnectAlibabaArgs {
  platform?: AlibabaPlatform;
  return_to?: string;
}

export function useConnectAlibaba(): UseMutationResult<void, Error, ConnectAlibabaArgs | undefined> {
  return useMutation<void, Error, ConnectAlibabaArgs | undefined>({
    mutationFn: async (args) => {
      const payload: ConnectAlibabaArgs = args ?? {};
      const res = await startOAuth(payload);
      // Hard navigation — the Edge Function returned an external OAuth URL.
      window.location.href = res.authorize_url;
    },
    onError: (err) => {
      console.error('[useConnectAlibaba] failed', err);
      toast.error('Alibaba 연결을 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    },
  });
}
