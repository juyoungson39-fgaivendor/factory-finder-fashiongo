// Thin wrapper around supabase.functions.invoke for Alibaba Edge Functions.
// Surfaces typed AlibabaError on failure. See tech_spec §3.5.

import { supabase } from '@/integrations/supabase/client';
import type {
  OAuthStartRequest,
  OAuthStartResponse,
  DisconnectRequest,
  DisconnectResponse,
} from './types';

export class AlibabaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AlibabaError';
  }
}

async function invoke<TReq, TRes>(
  fn: string,
  body: TReq,
): Promise<TRes> {
  const { data, error } = await supabase.functions.invoke<TRes>(fn, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    const ctx = error as { context?: { status?: number } };
    throw new AlibabaError(
      'invoke_failed',
      error.message ?? `Edge Function ${fn} failed`,
      ctx.context?.status,
    );
  }
  if (data === null || data === undefined) {
    throw new AlibabaError('empty_response', `Edge Function ${fn} returned no data`);
  }
  return data;
}

export function startOAuth(args: OAuthStartRequest = {}): Promise<OAuthStartResponse> {
  return invoke<OAuthStartRequest, OAuthStartResponse>('alibaba-oauth-start', args);
}

export function disconnect(args: DisconnectRequest): Promise<DisconnectResponse> {
  return invoke<DisconnectRequest, DisconnectResponse>('alibaba-disconnect', args);
}
