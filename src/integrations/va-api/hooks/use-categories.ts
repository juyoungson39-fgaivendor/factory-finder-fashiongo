import { useQuery } from '@tanstack/react-query';
import { vaApi } from '../client';
import type { FGCategory } from '../types';

export function useCategories() {
  return useQuery<FGCategory[]>({
    queryKey: ['va-api', 'categories'],
    queryFn: () => vaApi.get<FGCategory[]>('/categories'),
    staleTime: 1000 * 60 * 30, // categories rarely change — cache 30 min
  });
}
