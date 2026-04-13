// Deno-local copy of client-facing DTOs.
// See docs/tasks/alibaba-integration-phase-1-impl/tech_spec.md §2.3.
//
// Keep in sync with src/integrations/alibaba/types.ts (T030):
//   - AlibabaPlatform
//   - AlibabaConnectionStatus
//   - OAuthStartRequest
//   - OAuthStartResponse
//   - DisconnectRequest
//   - DisconnectResponse
//   - RefreshTokenResponse
//   - AlibabaErrorCode
//
// Rationale: Deno does not cleanly import from the Vite/React src tree at deploy time,
// so this duplication is intentional. Review both files together in PRs that touch either.

export type AlibabaPlatform = "alibaba_com" | "1688" | "taobao";

export type AlibabaConnectionStatus =
  | "active"
  | "refresh_required"
  | "revoked"
  | "error";

export type AlibabaErrorCode =
  | "invalid_state"
  | "expired_state"
  | "db_insert_failed"
  | "exchange_failed"
  | "revoked"
  | "network_error"
  | "unknown";

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
