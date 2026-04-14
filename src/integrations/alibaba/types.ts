// --- Connection ---

export type AlibabaPlatform = 'alibaba_com' | '1688' | 'taobao';
export type ConnectionStatus = 'active' | 'expired' | 'disconnected';
export type SyncStatus = 'in_progress' | 'completed' | 'partial' | 'failed';
export type SyncEntityType = 'products' | 'orders' | 'inventory' | 'all';

export interface AlibabaConnection {
  id: string;
  user_id: string;
  platform: AlibabaPlatform;
  shop_id: string;
  shop_name: string | null;
  scopes: string[];
  status: ConnectionStatus;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  vault_secret_name: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// --- Products ---

export interface AlibabaProduct {
  id: string;
  user_id: string;
  connection_id: string;
  external_product_id: string;
  title: string | null;
  image_url: string | null;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  moq: number | null;
  category: string | null;
  status: string | null;
  raw_data: Record<string, unknown>;
  synced_at: string;
  created_at: string;
}

// --- Orders ---

export interface AlibabaOrder {
  id: string;
  user_id: string;
  connection_id: string;
  external_order_id: string;
  order_status: string | null;
  total_amount: number | null;
  currency: string;
  buyer_name: string | null;
  item_count: number | null;
  ordered_at: string | null;
  raw_data: Record<string, unknown>;
  synced_at: string;
  created_at: string;
}

// --- Inventory ---

export interface AlibabaInventory {
  id: string;
  user_id: string;
  connection_id: string;
  external_product_id: string;
  sku: string | null;
  warehouse: string | null;
  quantity: number;
  reserved_quantity: number;
  raw_data: Record<string, unknown>;
  synced_at: string;
  created_at: string;
}

// --- Sync Logs ---

export interface AlibabaSyncLog {
  id: string;
  user_id: string;
  connection_id: string;
  entity_type: SyncEntityType;
  status: SyncStatus;
  records_synced: number;
  last_page: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// --- Edge Function Request/Response ---

export interface OAuthStartRequest {
  platform: AlibabaPlatform;
}

export interface OAuthStartResponse {
  authorization_url: string;
  state: string;
}

export interface OAuthCallbackRequest {
  code: string;
  state: string;
}

export interface OAuthCallbackResponse {
  success: boolean;
  connection_id: string;
  shop_name: string;
}

export interface SyncDataRequest {
  connection_id: string;
  entity_types?: SyncEntityType[];
}

export interface SyncDataResponse {
  success: boolean;
  sync_log_id: string;
  records_synced: number;
  status: SyncStatus;
  error_message?: string;
}

export interface DisconnectRequest {
  connection_id: string;
}

export interface DisconnectResponse {
  success: boolean;
}

export interface RefreshTokenRequest {
  connection_id: string;
}

export interface RefreshTokenResponse {
  success: boolean;
  new_expires_at: string;
}
