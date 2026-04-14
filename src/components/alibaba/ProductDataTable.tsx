import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PackageSearch } from 'lucide-react';
import { useAlibabaProducts } from '@/integrations/alibaba/hooks/use-alibaba-products';

interface ProductDataTableProps {
  connectionId: string | null;
}

/**
 * Table of synced Alibaba products for a given connection.
 * Columns: Image, Title, Price Range, MOQ, Category, Status, Last Synced.
 */
export const ProductDataTable = ({ connectionId }: ProductDataTableProps) => {
  const { data: products, isLoading } = useAlibabaProducts(connectionId);

  if (!connectionId) {
    return (
      <EmptyState message="Select a connection to view products." />
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <EmptyState message="No products found. Trigger a sync to fetch data from Alibaba." />
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">Image</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Price Range</TableHead>
            <TableHead>MOQ</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Synced</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell>
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.title ?? 'Product'}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary">
                    <PackageSearch className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
              </TableCell>
              <TableCell className="font-medium max-w-[200px] truncate">
                {product.title ?? '—'}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatPriceRange(product.price_min, product.price_max, product.currency)}
              </TableCell>
              <TableCell>{product.moq ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{product.category ?? '—'}</TableCell>
              <TableCell>
                {product.status ? (
                  <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                    {product.status}
                  </Badge>
                ) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                {new Date(product.synced_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

function formatPriceRange(
  min: number | null,
  max: number | null,
  currency: string,
): string {
  if (min == null && max == null) return '—';
  const fmt = (n: number) => `${currency} ${n.toFixed(2)}`;
  if (min != null && max != null && min !== max) return `${fmt(min)} – ${fmt(max)}`;
  return fmt(min ?? max!);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-muted-foreground gap-2">
      <PackageSearch className="h-8 w-8" />
      <p>{message}</p>
    </div>
  );
}
