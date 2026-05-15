import { useMemo, useState } from 'react';
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
import { BulkAlibabaCrawlButton } from '@/components/factory/BulkAlibabaCrawlButton';

/**
 * Aggregated view of products scraped from every factory's Alibaba showroom,
 * with a per-factory chip filter at the top.
 */
export function AllFactoryAlibabaProductsTable() {
  const { data: products, isLoading } = useAllFactoryAlibabaProducts();
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);

  // Per-factory aggregate: name, stock_score, and crawl count.
  // Sorted by stock_score desc so the highest-scoring factories show up first.
  const factoryStats = useMemo(() => {
    if (!products) return [];
    const map = new Map<string, {
      id: string;
      name: string | null;
      stock_score: number | null;
      count: number;
    }>();
    for (const p of products) {
      const cur = map.get(p.factory_id);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(p.factory_id, {
          id: p.factory_id,
          name: p.factory_name,
          stock_score: p.factory_stock_score,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      // stock_score desc, then count desc
      const sa = a.stock_score ?? -1;
      const sb = b.stock_score ?? -1;
      if (sb !== sa) return sb - sa;
      return b.count - a.count;
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    if (!selectedFactoryId) return products;
    return products.filter((p) => p.factory_id === selectedFactoryId);
  }, [products, selectedFactoryId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-end">
          <BulkAlibabaCrawlButton />
        </div>
        <div className="flex flex-col items-center justify-center py-16 border border-dashed rounded-lg">
          <PackageSearch className="mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            크롤링된 상품이 없습니다. 우측 상단 "ALIBABA 상품 일괄 크롤" 버튼을 눌러보세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Per-factory filter — chip row showing which factories were crawled */}
      <div className="space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium pt-1">
            크롤된 공장 ({factoryStats.length}개)
          </p>
          <BulkAlibabaCrawlButton />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FactoryChip
            label="전체"
            count={products.length}
            isSelected={selectedFactoryId === null}
            onClick={() => setSelectedFactoryId(null)}
          />
          {factoryStats.map((f) => (
            <FactoryChip
              key={f.id}
              label={f.name ?? '(이름 없음)'}
              stockScore={f.stock_score}
              count={f.count}
              isSelected={selectedFactoryId === f.id}
              onClick={() => setSelectedFactoryId(f.id)}
            />
          ))}
        </div>
      </div>

      {/* Products table */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {filteredProducts.length}개 상품
          {selectedFactoryId && ' (필터 적용)'}
        </p>
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
              {filteredProducts.map((p) => (
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
                    {p.moq_value != null
                      ? `${p.moq_value.toLocaleString()} ${p.moq_unit ?? ''}`.trim()
                      : '—'}
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
    </div>
  );
}

interface FactoryChipProps {
  label: string;
  stockScore?: number | null;
  count: number;
  isSelected: boolean;
  onClick: () => void;
}

function FactoryChip({ label, stockScore, count, isSelected, onClick }: FactoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors',
        isSelected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:bg-accent text-foreground',
      ].join(' ')}
    >
      <span className="font-medium max-w-[180px] truncate">{label}</span>
      {stockScore != null && (
        <span
          className={[
            'px-1 py-0.5 rounded text-[10px] font-mono',
            isSelected
              ? 'bg-primary-foreground/20 text-primary-foreground'
              : 'bg-muted text-muted-foreground',
          ].join(' ')}
        >
          {stockScore}
        </span>
      )}
      <span
        className={[
          'text-[10px] tabular-nums',
          isSelected ? 'text-primary-foreground/90' : 'text-muted-foreground',
        ].join(' ')}
      >
        {count}개
      </span>
    </button>
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
