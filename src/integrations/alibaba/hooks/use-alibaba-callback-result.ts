// Side-effect hook: reads URL params once on mount, surfaces toasts for the
// OAuth callback result, and cleans the URL so a refresh doesn't re-fire.
// See tech_spec §5.6.

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AlibabaErrorCode } from '../types';
import { ALIBABA_CONNECTIONS_QUERY_KEY } from './use-alibaba-connections';

const ERROR_MESSAGES: Record<AlibabaErrorCode, string> = {
  invalid_state: '인증 요청이 변조되었거나 만료되었습니다. 다시 시도해 주세요.',
  expired_state: '연결 요청이 만료되었습니다 (15분 제한). 다시 시도해 주세요.',
  db_insert_failed: '연결 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  exchange_failed: 'Alibaba 인증 서버 응답 오류. 잠시 후 다시 시도해 주세요.',
  revoked: 'Alibaba 상점에서 권한이 해제되었습니다. 상점 소유주에게 문의하세요.',
  network_error: '네트워크 오류가 발생했습니다.',
  unknown: '알 수 없는 오류가 발생했습니다.',
};

function errorCodeToMessage(code: string): string {
  if (code in ERROR_MESSAGES) {
    return ERROR_MESSAGES[code as AlibabaErrorCode];
  }
  return ERROR_MESSAGES.unknown;
}

export function useAlibabaCallbackResult(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    const errorCode = params.get('error');

    let consumed = false;

    if (connected === '1') {
      toast.success('Alibaba 상점이 연결되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ALIBABA_CONNECTIONS_QUERY_KEY });
      consumed = true;
    } else if (errorCode !== null && errorCode !== '') {
      toast.error(errorCodeToMessage(errorCode));
      consumed = true;
    }

    if (consumed) {
      // Clean URL so refresh doesn't re-fire.
      window.history.replaceState({}, '', window.location.pathname);
    }
    // Run once per mount — no dependency re-firing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
