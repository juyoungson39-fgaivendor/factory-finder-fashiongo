import { describe, it, expect } from 'vitest';
import type {
  AlibabaPlatform,
  ConnectionStatus,
  SyncStatus,
  SyncEntityType,
  AlibabaConnection,
  AlibabaProduct,
  AlibabaOrder,
  AlibabaInventory,
  AlibabaSyncLog,
  OAuthStartRequest,
  OAuthStartResponse,
  OAuthCallbackRequest,
  OAuthCallbackResponse,
  SyncDataRequest,
  SyncDataResponse,
  DisconnectRequest,
  DisconnectResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
} from '../types';

describe('Alibaba Types', () => {
  describe('AlibabaPlatform', () => {
    it('accepts valid platform values', () => {
      const platforms: AlibabaPlatform[] = ['alibaba_com', '1688', 'taobao'];
      expect(platforms).toHaveLength(3);
    });
  });

  describe('ConnectionStatus', () => {
    it('accepts valid status values', () => {
      const statuses: ConnectionStatus[] = ['active', 'expired', 'disconnected'];
      expect(statuses).toHaveLength(3);
    });
  });

  describe('SyncStatus', () => {
    it('accepts valid sync status values', () => {
      const statuses: SyncStatus[] = ['in_progress', 'completed', 'partial', 'failed'];
      expect(statuses).toHaveLength(4);
    });
  });

  describe('SyncEntityType', () => {
    it('accepts valid entity type values', () => {
      const types: SyncEntityType[] = ['products', 'orders', 'inventory', 'all'];
      expect(types).toHaveLength(4);
    });
  });

  describe('AlibabaConnection', () => {
    it('can create a valid connection object', () => {
      const connection: AlibabaConnection = {
        id: 'conn-1',
        user_id: 'user-1',
        platform: 'alibaba_com',
        shop_id: 'shop-123',
        shop_name: 'My Shop',
        scopes: ['product:read', 'order:read'],
        status: 'active',
        access_token_expires_at: '2026-01-01T00:00:00Z',
        refresh_token_expires_at: '2027-01-01T00:00:00Z',
        vault_secret_name: 'my-secret',
        last_synced_at: '2025-12-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-06-01T00:00:00Z',
      };
      expect(connection.platform).toBe('alibaba_com');
      expect(connection.status).toBe('active');
    });

    it('accepts null for optional fields', () => {
      const connection: AlibabaConnection = {
        id: 'conn-2',
        user_id: 'user-1',
        platform: '1688',
        shop_id: 'shop-456',
        shop_name: null,
        scopes: [],
        status: 'disconnected',
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        vault_secret_name: null,
        last_synced_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      };
      expect(connection.shop_name).toBeNull();
      expect(connection.last_synced_at).toBeNull();
    });
  });

  describe('AlibabaProduct', () => {
    it('can create a valid product object', () => {
      const product: AlibabaProduct = {
        id: 'prod-1',
        user_id: 'user-1',
        connection_id: 'conn-1',
        external_product_id: 'ext-prod-1',
        title: 'Test Product',
        image_url: 'https://example.com/img.jpg',
        price_min: 10.5,
        price_max: 20.0,
        currency: 'USD',
        moq: 100,
        category: 'Electronics',
        status: 'active',
        raw_data: { source: 'alibaba' },
        synced_at: '2025-12-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(product.currency).toBe('USD');
      expect(product.raw_data).toHaveProperty('source');
    });
  });

  describe('AlibabaOrder', () => {
    it('can create a valid order object', () => {
      const order: AlibabaOrder = {
        id: 'order-1',
        user_id: 'user-1',
        connection_id: 'conn-1',
        external_order_id: 'ext-order-1',
        order_status: 'shipped',
        total_amount: 500.0,
        currency: 'USD',
        buyer_name: 'John Doe',
        item_count: 3,
        ordered_at: '2025-11-01T00:00:00Z',
        raw_data: {},
        synced_at: '2025-12-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(order.order_status).toBe('shipped');
      expect(order.total_amount).toBe(500.0);
    });
  });

  describe('AlibabaInventory', () => {
    it('can create a valid inventory object', () => {
      const inventory: AlibabaInventory = {
        id: 'inv-1',
        user_id: 'user-1',
        connection_id: 'conn-1',
        external_product_id: 'ext-prod-1',
        sku: 'SKU-001',
        warehouse: 'WH-A',
        quantity: 50,
        reserved_quantity: 5,
        raw_data: {},
        synced_at: '2025-12-01T00:00:00Z',
        created_at: '2025-01-01T00:00:00Z',
      };
      expect(inventory.quantity).toBe(50);
      expect(inventory.reserved_quantity).toBe(5);
    });
  });

  describe('AlibabaSyncLog', () => {
    it('can create a valid sync log object', () => {
      const log: AlibabaSyncLog = {
        id: 'log-1',
        user_id: 'user-1',
        connection_id: 'conn-1',
        entity_type: 'products',
        status: 'completed',
        records_synced: 100,
        last_page: 5,
        error_message: null,
        started_at: '2025-12-01T00:00:00Z',
        completed_at: '2025-12-01T00:10:00Z',
      };
      expect(log.status).toBe('completed');
      expect(log.records_synced).toBe(100);
    });
  });

  describe('Request/Response types', () => {
    it('OAuthStartRequest has platform field', () => {
      const req: OAuthStartRequest = { platform: 'alibaba_com' };
      expect(req.platform).toBe('alibaba_com');
    });

    it('OAuthStartResponse has authorization_url and state', () => {
      const res: OAuthStartResponse = {
        authorization_url: 'https://oauth.alibaba.com/authorize',
        state: 'random-state-string',
      };
      expect(res.authorization_url).toContain('alibaba');
    });

    it('OAuthCallbackRequest has code and state', () => {
      const req: OAuthCallbackRequest = { code: 'auth-code', state: 'state-value' };
      expect(req.code).toBe('auth-code');
    });

    it('OAuthCallbackResponse has success and connection info', () => {
      const res: OAuthCallbackResponse = {
        success: true,
        connection_id: 'conn-1',
        shop_name: 'My Shop',
      };
      expect(res.success).toBe(true);
    });

    it('SyncDataRequest accepts optional entity_types', () => {
      const req1: SyncDataRequest = { connection_id: 'conn-1' };
      const req2: SyncDataRequest = { connection_id: 'conn-1', entity_types: ['products', 'orders'] };
      expect(req1.entity_types).toBeUndefined();
      expect(req2.entity_types).toHaveLength(2);
    });

    it('SyncDataResponse has all required fields', () => {
      const res: SyncDataResponse = {
        success: true,
        sync_log_id: 'log-1',
        records_synced: 50,
        status: 'completed',
      };
      expect(res.records_synced).toBe(50);
    });

    it('DisconnectRequest has connection_id', () => {
      const req: DisconnectRequest = { connection_id: 'conn-1' };
      expect(req.connection_id).toBe('conn-1');
    });

    it('DisconnectResponse has success', () => {
      const res: DisconnectResponse = { success: true };
      expect(res.success).toBe(true);
    });

    it('RefreshTokenRequest has connection_id', () => {
      const req: RefreshTokenRequest = { connection_id: 'conn-1' };
      expect(req.connection_id).toBe('conn-1');
    });

    it('RefreshTokenResponse has success and new_expires_at', () => {
      const res: RefreshTokenResponse = {
        success: true,
        new_expires_at: '2027-01-01T00:00:00Z',
      };
      expect(res.new_expires_at).toBeTruthy();
    });
  });
});
