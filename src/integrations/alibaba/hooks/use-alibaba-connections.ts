// React Query hook: list of Alibaba connections for the current user.
// RLS restricts rows to auth.uid() — no extra filter needed client-side.

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AlibabaShopConnection } from '../types';

// Base key for all Alibaba connection queries. Components invalidating the
// current user's list should use `alibabaConnectionsKey(userId)` — the base
// key invalidates every user's list under this root, which is what logout
// wants, while queries themselves are scoped per user to prevent cross-user
// cache leakage.
const ALIBABA_CONNECTIONS_BASE_KEY = ['alibaba-connections'] as const;

export function alibabaConnectionsKey(userId: string | null | undefined): readonly unknown[] {
  return userId ? [...ALIBABA_CONNECTIONS_BASE_KEY, userId] : ALIBABA_CONNECTIONS_BASE_KEY;
}

/**
 * Invalidator key used by mutations that don't know the current user directly.
 * Invalidates every per-user cache variant under the base root.
 */
export const ALIBABA_CONNECTIONS_QUERY_KEY = ALIBABA_CONNECTIONS_BASE_KEY;

// The Supabase generated types do not yet include the `alibaba_*` tables.
// Until `supabase gen types` is re-run post-deploy, we narrow the client locally.
// This is a deliberate, scoped escape — do NOT widen its usage.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabaseUntyped = supabase as any;

export function useAlibabaConnections(): UseQueryResult<AlibabaShopConnection[], Error> {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Defensive: on user change (including logout → null), drop any other user's
  // cached list so it cannot flash to the new user before the fresh fetch resolves.
  // React Query's `enabled:!!user` gates execution but does not clear stale data.
  if (user === null) {
    queryClient.removeQueries({ queryKey: ALIBABA_CONNECTIONS_BASE_KEY });
  }

  return useQuery<AlibabaShopConnection[], Error>({
    queryKey: alibabaConnectionsKey(user?.id),
    staleTime: 30_000,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabaseUntyped
        .from('alibaba_shop_connections')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw new Error(String((error as { message?: string }).message ?? error));
      return ((data ?? []) as unknown) as AlibabaShopConnection[];
    },
  });
}
