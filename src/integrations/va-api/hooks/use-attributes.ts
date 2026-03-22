import { useQuery } from '@tanstack/react-query';
import { vaApi } from '../client';
import type { FGProductAttributes } from '../types';

export function useAttributes(categoryId: number | undefined, wholesalerId: number | undefined) {
  return useQuery<FGProductAttributes>({
    queryKey: ['va-api', 'attributes', categoryId],
    queryFn: () =>
      vaApi.get<FGProductAttributes>(`/attributes/${categoryId}`, {
        wholesalerId: wholesalerId!,
      }),
    enabled: !!categoryId && !!wholesalerId,
    staleTime: 1000 * 60 * 10,
  });
}
