import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentAccessMode } from '@/lib/runtimeMode';

export const useIsAdmin = () => {
  const { user } = useAuth();

  const { data: isAdmin = isDevelopmentAccessMode, isLoading } = useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!user,
  });

  return { isAdmin: isDevelopmentAccessMode ? true : isAdmin, isLoading };
};
