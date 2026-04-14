import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { alibabaApi } from '../client';
import type { AlibabaConnection, OAuthStartRequest } from '../types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export const CONNECTIONS_KEY = ['alibaba', 'connections'];

/**
 * Fetch all active/expired Alibaba shop connections for the current user.
 * Excludes disconnected connections.
 */
export function useAlibabaConnections() {
  const { user } = useAuth();
  return useQuery<AlibabaConnection[]>({
    queryKey: CONNECTIONS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alibaba_shop_connections')
        .select('*')
        .eq('user_id', user!.id)
        .neq('status', 'disconnected')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data as AlibabaConnection[];
    },
    enabled: !!user,
  });
}

/**
 * Start the OAuth flow: calls alibaba-oauth-start, then redirects the browser.
 * On success the mutation result contains authorization_url; call window.location.href = url.
 */
export function useStartOAuth() {
  return useMutation<{ authorization_url: string; state: string }, Error, OAuthStartRequest>({
    mutationFn: (req) => alibabaApi.startOAuth(req),
    onSuccess: (data) => {
      // Full-page redirect to Alibaba's OAuth authorization page
      window.location.href = data.authorization_url;
    },
  });
}

/**
 * Disconnect a shop connection.
 * Calls alibaba-disconnect then invalidates the connections query cache.
 */
export function useDisconnectShop() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation<void, Error, string>({
    mutationFn: async (connectionId: string) => {
      await alibabaApi.disconnect({ connection_id: connectionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      toast({ title: 'Shop disconnected successfully' });
    },
    onError: (err) => {
      toast({ title: 'Disconnect failed', description: err.message, variant: 'destructive' });
    },
  });
}
