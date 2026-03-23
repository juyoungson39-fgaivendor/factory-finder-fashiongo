import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vaApi } from '../client';
import type {
  FGProductListResponse,
  FGProductListParams,
  FGProductDetail,
  FGBestSellerItem,
  FGProductRegistrationRequest,
} from '../types';
import { useToast } from '@/hooks/use-toast';

export function useProducts(params: FGProductListParams) {
  return useQuery<FGProductListResponse>({
    queryKey: ['va-api', 'products', params],
    queryFn: () =>
      vaApi.get<FGProductListResponse>('/products', {
        wholesalerId: params.wholesalerId,
        active: params.active,
        categoryId: params.categoryId,
        page: params.page ?? 1,
        size: params.size ?? 50,
      }),
    enabled: !!params.wholesalerId,
  });
}

export function useProductDetail(productId: number | undefined, wholesalerId: number | undefined) {
  return useQuery<FGProductDetail>({
    queryKey: ['va-api', 'product', productId],
    queryFn: () =>
      vaApi.get<FGProductDetail>(`/products/${productId}`, {
        wholesalerId: wholesalerId,
      }),
    enabled: !!productId && !!wholesalerId,
  });
}

export function useBestSellers(wholesalerId: number | undefined) {
  return useQuery<FGBestSellerItem[]>({
    queryKey: ['va-api', 'best-sellers', wholesalerId],
    queryFn: () =>
      vaApi.get<FGBestSellerItem[]>('/products/best-sellers', {
        wholesalerId: wholesalerId,
      }),
    enabled: !!wholesalerId,
  });
}

export function useRegisterProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<FGProductDetail, Error, FGProductRegistrationRequest>({
    mutationFn: (request) => vaApi.post<FGProductDetail>('/products', request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['va-api', 'products'] });
      toast({ title: 'Product registered successfully' });
    },
    onError: (err) => {
      toast({ title: 'Registration failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<FGProductDetail, Error, { productId: number; request: FGProductRegistrationRequest }>({
    mutationFn: ({ productId, request }) =>
      vaApi.put<FGProductDetail>(`/products/${productId}`, request),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['va-api', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['va-api', 'product', variables.productId] });
      toast({ title: 'Product updated successfully' });
    },
    onError: (err) => {
      toast({ title: 'Update failed', description: err.message, variant: 'destructive' });
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<boolean, Error, { productId: number; wholesalerId: number }>({
    mutationFn: ({ productId, wholesalerId }) =>
      vaApi.delete<boolean>(`/products/${productId}`, { wholesalerId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['va-api', 'products'] });
      toast({ title: 'Product deactivated' });
    },
    onError: (err) => {
      toast({ title: 'Deactivation failed', description: err.message, variant: 'destructive' });
    },
  });
}
