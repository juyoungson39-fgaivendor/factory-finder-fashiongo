import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RefreshCw, ExternalLink, PackageSearch } from 'lucide-react';
import {
  useFactoryAlibabaProducts,
  useTriggerFactoryAlibabaCrawl,
} from '@/integrations/alibaba/hooks/use-factory-alibaba-products';

interface Props {
  factoryId: string;
  /** Optional info used only to decide whether the crawl button can fire. */
  hasAlibabaSource?: boolean;
}

function formatPrice(min: number | null, max: number | null, currency: string | null) {
  if (min == null && max == null) return '—';
  const symbol = currency === 'EUR' ? '€' : currency === 'CNY' ? '¥' : '$';
  if (min != null && max != null && min !== max) {
    return `${symbol}${min.toFixed(2)} – ${symbol}${max.toFixed(2)}`;
  }
  return `${symbol}${(min ?? max ?? 0).toFixed(2)}`;
}

function formatMoq(value: number | null, unit: string | null) {
  if (value == null) return '—';
  return `${value.toLocaleString()} ${unit ?? ''}`.trim();
}

/**
 * Tab body that shows products scraped from this factory's Alibaba supplier
 * showroom, plus a "Crawl now" button.
 */
export function FactoryAlibabaProductsTab({ factoryId, hasAlibabaSource = true }: Props) {
  const { data: products, isLoading } = useFactoryAlibabaProducts(factoryId);
  const { mutate: triggerCrawl, isPending: isCrawling } = useTriggerFactoryAlibabaCrawl();

  const handleCrawl = () => {
    triggerCrawl({ factory_id: factoryId });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">
            이 공장의 알리바바 쇼룸에서 크롤링한 상품
          </p>
          {products && products.length > 0 && (
            <p className="text-xs text-muted-foreground">{products.length}개 상품</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCrawl}
          disabled={isCrawling || !hasAlibabaSource}
          title={
            !hasAlibabaSource
              ? '알리바바 supplier 정보가 없습니다'
              : '지금 크롤링'
          }
        >
          {isCrawling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5 text-xs uppercase tracking-wider">
            {isCrawling ? 'Crawling…' : 'Crawl now'}
          </span>
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !products || products.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-12">
            <PackageSearch className="mb-3 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {hasAlibabaSource
                ? '아직 크롤링된 상품이 없습니다. “Crawl now”를 눌러 시작하세요.'
                : '이 공장에는 알리바바 supplier 정보가 없어 크롤링할 수 없습니다.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr className="bg-muted/50">
                {['이미지', '상품명', '가격', 'MOQ', '수집일', '링크'].map((h) => (
                  <th
                    key={h}
                    className="text-[11px] font-medium text-muted-foreground px-3 py-2 text-left whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 w-12">
                    {p.main_image_url ? (
                      <img
                        src={p.main_image_url}
                        alt={p.title ?? 'Product'}
                        className="w-10 h-12 rounded object-cover border border-border"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-10 h-12 rounded border border-border bg-muted flex items-center justify-center">
                        <span className="text-[8px] text-muted-foreground">No img</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[320px]">
                    <p className="text-xs font-medium line-clamp-2">{p.title ?? '—'}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {p.alibaba_product_id}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatPrice(p.price_min, p.price_max, p.currency)}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    {formatMoq(p.moq_value, p.moq_unit)}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(p.scraped_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-3 py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
