import { createAlibabaDataHook } from './use-alibaba-data';
import type { AlibabaOrder } from '../types';

/**
 * Fetch all orders for the given connection from the local DB.
 * Results are already synced from Alibaba via alibaba-sync-data.
 */
export const useAlibabaOrders = createAlibabaDataHook<AlibabaOrder>({
  queryKeySegment: 'orders',
  table: 'alibaba_orders',
  orderBy: 'ordered_at',
});
