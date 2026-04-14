import { createAlibabaDataHook } from './use-alibaba-data';
import type { AlibabaInventory } from '../types';

/**
 * Fetch all inventory records for the given connection from the local DB.
 * Results are already synced from Alibaba via alibaba-sync-data.
 */
export const useAlibabaInventory = createAlibabaDataHook<AlibabaInventory>({
  queryKeySegment: 'inventory',
  table: 'alibaba_inventory',
  orderBy: 'synced_at',
});
