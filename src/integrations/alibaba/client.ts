import { supabase } from '@/integrations/supabase/client';
import type {
  OAuthStartRequest, OAuthStartResponse,
  SyncDataRequest, SyncDataResponse,
  DisconnectRequest, DisconnectResponse,
} from './types';

export class AlibabaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlibabaApiError';
  }
}

async function invokeFunction<TReq, TRes>(
  functionName: string,
  body: TReq,
): Promise<TRes> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: body as Record<string, unknown>,
  });
  if (error) throw new AlibabaApiError(error.message);
  if (data?.error) throw new AlibabaApiError(data.error);
  return data as TRes;
}

export const alibabaApi = {
  startOAuth: (req: OAuthStartRequest) =>
    invokeFunction<OAuthStartRequest, OAuthStartResponse>('alibaba-oauth-start', req),

  triggerSync: (req: SyncDataRequest) =>
    invokeFunction<SyncDataRequest, SyncDataResponse>('alibaba-sync-data', req),

  disconnect: (req: DisconnectRequest) =>
    invokeFunction<DisconnectRequest, DisconnectResponse>('alibaba-disconnect', req),
};
