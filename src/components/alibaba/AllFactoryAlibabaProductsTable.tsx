import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, PackageSearch, ExternalLink } from 'lucide-react';
import { useAllFactoryAlibabaProducts } from '@/integrations/alibaba/hooks/use-factory-alibaba-products';

/**
 * Aggregated view of products scraped from every factory's Alibaba showroom.
 * Replaces the per-connection ProductDataTable for the global "Products" tab.
 */
export function AllFactoryAlibabaProductsTable() {
  const { data: products, isLoading } = useAllFactoryAlibabaProducts();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg">
        <PackageSearch className="mb-3 h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          크롤링된 상품이 없습니다. 공장 리스트 페이지에서 "ALIBABA 상품 일괄 크롤" 버튼을 눌러보세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{products.length}개 상품</p>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Image</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Price Range</TableHead>
              <TableHead>MOQ</TableHead>
              <TableHead>Factory</TableHead>
              <TableHead>Last Crawled</TableHead>
              <TableHead className="w-20">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  {p.main_image_url ? (
                    <img
                      src={p.main_image_url}
                      alt={p.title ?? 'Product'}
                      className="h-10 w-10 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded bg-secondary">
                      <PackageSearch className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-medium max-w-[320px]">
                  <p className="line-clamp-2 text-xs">{p.title ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {p.alibaba_product_id}
                  </p>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatPriceRange(p.price_min, p.price_max, p.currency)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {p.moq_value != null ? `${p.moq_value.toLocaleString()} ${p.moq_unit ?? ''}`.trim() : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{p.factory_name ?? '—'}</span>
                    {p.factory_stock_score != null && (
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {p.factory_stock_score}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(p.scraped_at).toLocaleDateString('ko-KR')}
                </TableCell>
                <TableCell>
                  {p.alibaba_url ? (
                    <a
                      href={p.alibaba_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3 mr-0.5" />
                      Alibaba
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function formatPriceRange(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const symbol = currency === 'EUR' ? '€' : currency === 'CNY' ? '¥' : '$';
  if (min != null && max != null && min !== max) {
    return `${symbol}${min.toFixed(2)} – ${symbol}${max.toFixed(2)}`;
  }
  return `${symbol}${(min ?? max ?? 0).toFixed(2)}`;
}
