import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AlibabaApiError, alibabaApi } from '../client';

// Mock the supabase client module
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from '@/integrations/supabase/client';

const mockInvoke = supabase.functions.invoke as ReturnType<typeof vi.fn>;

describe('AlibabaApiError', () => {
  it('is an instance of Error', () => {
    const err = new AlibabaApiError('test error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AlibabaApiError);
  });

  it('sets the name to AlibabaApiError', () => {
    const err = new AlibabaApiError('test error');
    expect(err.name).toBe('AlibabaApiError');
  });

  it('sets the message correctly', () => {
    const err = new AlibabaApiError('something went wrong');
    expect(err.message).toBe('something went wrong');
  });

  it('can be caught as Error', () => {
    const throwIt = () => { throw new AlibabaApiError('catch me'); };
    expect(throwIt).toThrowError('catch me');
  });
});

describe('alibabaApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('structure', () => {
    it('has startOAuth method', () => {
      expect(typeof alibabaApi.startOAuth).toBe('function');
    });

    it('has triggerSync method', () => {
      expect(typeof alibabaApi.triggerSync).toBe('function');
    });

    it('has disconnect method', () => {
      expect(typeof alibabaApi.disconnect).toBe('function');
    });
  });

  describe('startOAuth', () => {
    it('calls supabase.functions.invoke with alibaba-oauth-start', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { authorization_url: 'https://oauth.alibaba.com', state: 'abc123' },
        error: null,
      });

      const result = await alibabaApi.startOAuth({ platform: 'alibaba_com' });

      expect(mockInvoke).toHaveBeenCalledWith('alibaba-oauth-start', {
        body: { platform: 'alibaba_com' },
      });
      expect(result).toEqual({ authorization_url: 'https://oauth.alibaba.com', state: 'abc123' });
    });

    it('throws AlibabaApiError when supabase returns an error', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Function invocation failed' },
      });

      await expect(alibabaApi.startOAuth({ platform: 'alibaba_com' })).rejects.toThrow(AlibabaApiError);
      await expect(alibabaApi.startOAuth({ platform: 'alibaba_com' })).rejects.toThrow('Function invocation failed');
    });

    it('throws AlibabaApiError when data contains an error field', async () => {
      mockInvoke.mockResolvedValue({
        data: { error: 'Invalid platform' },
        error: null,
      });

      await expect(alibabaApi.startOAuth({ platform: 'alibaba_com' })).rejects.toThrow(AlibabaApiError);
      await expect(alibabaApi.startOAuth({ platform: 'alibaba_com' })).rejects.toThrow('Invalid platform');
    });
  });

  describe('triggerSync', () => {
    it('calls supabase.functions.invoke with alibaba-sync-data', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          success: true,
          sync_log_id: 'log-1',
          records_synced: 100,
          status: 'completed',
        },
        error: null,
      });

      const result = await alibabaApi.triggerSync({ connection_id: 'conn-1' });

      expect(mockInvoke).toHaveBeenCalledWith('alibaba-sync-data', {
        body: { connection_id: 'conn-1' },
      });
      expect(result.success).toBe(true);
      expect(result.records_synced).toBe(100);
    });

    it('passes entity_types when provided', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { success: true, sync_log_id: 'log-2', records_synced: 50, status: 'completed' },
        error: null,
      });

      await alibabaApi.triggerSync({
        connection_id: 'conn-1',
        entity_types: ['products', 'orders'],
      });

      expect(mockInvoke).toHaveBeenCalledWith('alibaba-sync-data', {
        body: { connection_id: 'conn-1', entity_types: ['products', 'orders'] },
      });
    });

    it('throws AlibabaApiError on failure', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Sync failed' },
      });

      await expect(alibabaApi.triggerSync({ connection_id: 'conn-1' })).rejects.toThrow(AlibabaApiError);
    });
  });

  describe('disconnect', () => {
    it('calls supabase.functions.invoke with alibaba-disconnect', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { success: true },
        error: null,
      });

      const result = await alibabaApi.disconnect({ connection_id: 'conn-1' });

      expect(mockInvoke).toHaveBeenCalledWith('alibaba-disconnect', {
        body: { connection_id: 'conn-1' },
      });
      expect(result.success).toBe(true);
    });

    it('throws AlibabaApiError when disconnect fails', async () => {
      mockInvoke.mockResolvedValue({
        data: null,
        error: { message: 'Connection not found' },
      });

      await expect(alibabaApi.disconnect({ connection_id: 'conn-99' })).rejects.toThrow(AlibabaApiError);
      await expect(alibabaApi.disconnect({ connection_id: 'conn-99' })).rejects.toThrow('Connection not found');
    });

    it('throws AlibabaApiError when data.error is present', async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { error: 'Permission denied' },
        error: null,
      });

      await expect(alibabaApi.disconnect({ connection_id: 'conn-1' })).rejects.toThrow('Permission denied');
    });
  });
});
