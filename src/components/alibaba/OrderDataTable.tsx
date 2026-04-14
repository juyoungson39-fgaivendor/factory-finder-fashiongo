import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ShoppingCart } from 'lucide-react';
import { useAlibabaOrders } from '@/integrations/alibaba/hooks/use-alibaba-orders';

interface OrderDataTableProps {
  connectionId: string | null;
}

/**
 * Table of synced Alibaba orders for a given connection.
 * Columns: Order ID, Status, Total Amount, Buyer, Item Count, Ordered At, Last Synced.
 */
export const OrderDataTable = ({ connectionId }: OrderDataTableProps) => {
  const { data: orders, isLoading } = useAlibabaOrders(connectionId);

  if (!connectionId) {
    return <EmptyState message="Select a connection to view orders." />;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <EmptyState message="No orders found. Trigger a sync to fetch data from Alibaba." />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Order ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Total Amount</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Ordered At</TableHead>
            <TableHead>Last Synced</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-mono text-xs">
                {order.external_order_id}
              </TableCell>
              <TableCell>
                {order.order_status ? (
                  <Badge variant={resolveOrderStatusVariant(order.order_status)}>
                    {order.order_status}
                  </Badge>
                ) : '—'}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {order.total_amount != null
                  ? `${order.currency} ${order.total_amount.toFixed(2)}`
                  : '—'}
              </TableCell>
              <TableCell>{order.buyer_name ?? '—'}</TableCell>
              <TableCell>{order.item_count ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {order.ordered_at ? new Date(order.ordered_at).toLocaleString() : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(order.synced_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

function resolveOrderStatusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const lower = status.toLowerCase();
  if (lower.includes('complete') || lower.includes('success')) return 'default';
  if (lower.includes('cancel') || lower.includes('refund') || lower.includes('fail')) return 'destructive';
  return 'secondary';
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground gap-2">
      <ShoppingCart className="h-8 w-8" />
      <p>{message}</p>
    </div>
  );
}
