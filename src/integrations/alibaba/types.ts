// Client-facing types for the Alibaba integration.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §2.1 + §2.3.
//
// Keep this file in sync with supabase/functions/_shared/alibaba-dtos.ts (T006).
// Review both together in PRs that touch either.

export type AlibabaPlatform = 'alibaba_com' | '1688' | 'taobao';

export type AlibabaConnectionStatus =
  | 'active'
  | 'refresh_required'
  | 'revoked'
  | 'error';

export type AlibabaErrorCode =
  | 'invalid_state'
  | 'expired_state'
  | 'db_insert_failed'
  | 'exchange_failed'
  | 'revoked'
  | 'network_error'
  | 'unknown';

/** Row shape of alibaba_shop_connections (mirrors migration schema). */
export interface AlibabaShopConnection {
  id: string;
  user_id: string;
  platform: AlibabaPlatform;
  shop_id: string;
  shop_name: string | null;
  scopes: string[];
  status: AlibabaConnectionStatus;
  last_error: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  last_refreshed_at: string | null;
  vault_secret_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Edge Function DTOs ──────────────────────────────────────────────────────

export interface OAuthStartRequest {
  platform?: AlibabaPlatform;
  return_to?: string;
}

export interface OAuthStartResponse {
  authorize_url: string;
  state: string;
}

export interface DisconnectRequest {
  connection_id: string;
}

export interface DisconnectResponse {
  ok: true;
}

export interface RefreshTokenResponse {
  refreshed: number;
  skipped: number;
  failed: Array<{ connection_id: string; error: string }>;
}
