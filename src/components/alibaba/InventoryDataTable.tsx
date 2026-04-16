import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Warehouse } from 'lucide-react';
import { useAlibabaInventory } from '@/integrations/alibaba/hooks/use-alibaba-inventory';

interface InventoryDataTableProps {
  connectionId: string | null;
}

/**
 * Table of synced Alibaba inventory records for a given connection.
 * Columns: Product ID, SKU, Warehouse, Quantity, Reserved, Last Synced.
 */
export const InventoryDataTable = ({ connectionId }: InventoryDataTableProps) => {
  const { data: inventory, isLoading } = useAlibabaInventory(connectionId);

  if (!connectionId) {
    return <EmptyState message="Select a connection to view inventory." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!inventory || inventory.length === 0) {
    return (
      <EmptyState message="No inventory found. Trigger a sync to fetch data from Alibaba." />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product ID</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Warehouse</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Reserved</TableHead>
            <TableHead>Last Synced</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inventory.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">
                {item.external_product_id}
              </TableCell>
              <TableCell>{item.sku ?? '—'}</TableCell>
              <TableCell>{item.warehouse ?? '—'}</TableCell>
              <TableCell className="text-right font-medium">
                {item.quantity.toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {item.reserved_quantity.toLocaleString()}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(item.synced_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground gap-2">
      <Warehouse className="h-8 w-8" />
      <p>{message}</p>
    </div>
  );
}
