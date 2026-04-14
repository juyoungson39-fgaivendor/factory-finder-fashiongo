import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddConnectionButton } from '../AddConnectionButton';

// Mock the hook
vi.mock('@/integrations/alibaba/hooks/use-alibaba-connections', () => ({
  useStartOAuth: vi.fn(),
}));

import { useStartOAuth } from '@/integrations/alibaba/hooks/use-alibaba-connections';

const mockUseStartOAuth = useStartOAuth as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('AddConnectionButton', () => {
  let mockMutate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMutate = vi.fn();
    mockUseStartOAuth.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('renders the "Connect Alibaba Shop" button', () => {
    render(<AddConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByRole('button', { name: /connect alibaba shop/i })).toBeInTheDocument();
  });

  it('calls startOAuth with default platform alibaba_com when clicked', () => {
    render(<AddConnectionButton />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button'));
    expect(mockMutate).toHaveBeenCalledWith({ platform: 'alibaba_com' });
  });

  it('calls startOAuth with the provided platform', () => {
    render(<AddConnectionButton platform="1688" />, { wrapper: createWrapper() });
    fireEvent.click(screen.getByRole('button'));
    expect(mockMutate).toHaveBeenCalledWith({ platform: '1688' });
  });

  it('shows loading state when isPending is true', () => {
    mockUseStartOAuth.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });

    render(<AddConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(screen.queryByText('Connect Alibaba Shop')).not.toBeInTheDocument();
  });

  it('disables the button when isPending is true', () => {
    mockUseStartOAuth.mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });

    render(<AddConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('button is enabled when not pending', () => {
    render(<AddConnectionButton />, { wrapper: createWrapper() });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
