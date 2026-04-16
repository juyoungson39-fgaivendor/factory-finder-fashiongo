import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useAlibabaConnections,
  useStartOAuth,
  useDisconnectShop,
  CONNECTIONS_KEY,
} from '../use-alibaba-connections';

// Mock supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock alibaba client
vi.mock('../../client', () => ({
  alibabaApi: {
    startOAuth: vi.fn(),
    disconnect: vi.fn(),
  },
  AlibabaApiError: class AlibabaApiError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AlibabaApiError';
    }
  },
}));

// Mock AuthContext
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

// Mock use-toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}));

import { supabase } from '@/integrations/supabase/client';
import { alibabaApi } from '../../client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const mockFrom = supabase.from as ReturnType<typeof vi.fn>;
const mockStartOAuth = alibabaApi.startOAuth as ReturnType<typeof vi.fn>;
const mockDisconnect = alibabaApi.disconnect as ReturnType<typeof vi.fn>;
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>;
const mockUseToast = useToast as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockConnection = {
  id: 'conn-1',
  user_id: 'user-1',
  platform: 'alibaba_com',
  shop_id: 'shop-123',
  shop_name: 'My Shop',
  scopes: ['product:read'],
  status: 'active',
  access_token_expires_at: '2026-01-01T00:00:00Z',
  refresh_token_expires_at: '2027-01-01T00:00:00Z',
  vault_secret_name: 'my-secret',
  last_synced_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
};

describe('CONNECTIONS_KEY', () => {
  it('is a stable array key', () => {
    expect(CONNECTIONS_KEY).toEqual(['alibaba', 'connections']);
  });
});

describe('useAlibabaConnections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUseToast.mockReturnValue({ toast: vi.fn() });
  });

  it('fetches connections for the current user', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [mockConnection], error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const { result } = renderHook(() => useAlibabaConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([mockConnection]);
    expect(mockFrom).toHaveBeenCalledWith('alibaba_shop_connections');
    expect(mockQuery.neq).toHaveBeenCalledWith('status', 'disconnected');
  });

  it('is disabled when there is no user', () => {
    mockUseAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => useAlibabaConnections(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('throws an error when supabase returns an error', async () => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    };
    mockFrom.mockReturnValue(mockQuery);

    const { result } = renderHook(() => useAlibabaConnections(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('DB error');
  });
});

describe('useStartOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockUseToast.mockReturnValue({ toast: vi.fn() });
    // Mock window.location.href setter
    Object.defineProperty(window, 'location', {
      value: { href: '' },
      writable: true,
    });
  });

  it('calls alibabaApi.startOAuth with the given platform', async () => {
    const authUrl = 'https://oauth.alibaba.com/authorize?state=abc';
    mockStartOAuth.mockResolvedValue({ authorization_url: authUrl, state: 'abc' });

    const { result } = renderHook(() => useStartOAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ platform: 'alibaba_com' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockStartOAuth).toHaveBeenCalledWith({ platform: 'alibaba_com' });
  });

  it('redirects to authorization_url on success', async () => {
    const authUrl = 'https://oauth.alibaba.com/authorize?state=xyz';
    mockStartOAuth.mockResolvedValue({ authorization_url: authUrl, state: 'xyz' });

    const { result } = renderHook(() => useStartOAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ platform: '1688' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(window.location.href).toBe(authUrl);
  });

  it('sets isError when startOAuth fails', async () => {
    mockStartOAuth.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useStartOAuth(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ platform: 'taobao' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Network error');
  });
});

describe('useDisconnectShop', () => {
  let mockToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1' } });
    mockToast = vi.fn();
    mockUseToast.mockReturnValue({ toast: mockToast });

    // Setup supabase from mock for query invalidation
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(mockQuery);
  });

  it('calls alibabaApi.disconnect with the connectionId', async () => {
    mockDisconnect.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDisconnectShop(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('conn-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDisconnect).toHaveBeenCalledWith({ connection_id: 'conn-1' });
  });

  it('shows success toast on disconnect', async () => {
    mockDisconnect.mockResolvedValue({ success: true });

    const { result } = renderHook(() => useDisconnectShop(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('conn-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockToast).toHaveBeenCalledWith({ title: 'Shop disconnected successfully' });
  });

  it('shows error toast on failure', async () => {
    mockDisconnect.mockRejectedValue(new Error('Disconnect failed'));

    const { result } = renderHook(() => useDisconnectShop(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('conn-99');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Disconnect failed',
      description: 'Disconnect failed',
      variant: 'destructive',
    });
  });
});
