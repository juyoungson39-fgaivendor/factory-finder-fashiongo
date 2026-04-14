import { createAlibabaDataHook } from './use-alibaba-data';
import type { AlibabaProduct } from '../types';

/**
 * Fetch all products for the given connection from the local DB.
 * Results are already synced from Alibaba via alibaba-sync-data.
 */
export const useAlibabaProducts = createAlibabaDataHook<AlibabaProduct>({
  queryKeySegment: 'products',
  table: 'alibaba_products',
  orderBy: 'synced_at',
});
