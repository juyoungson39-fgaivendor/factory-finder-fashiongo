import { Button } from '@/components/ui/button';
import { Loader2, ShoppingBag } from 'lucide-react';
import { useTriggerFactoryAlibabaCrawl } from '@/integrations/alibaba/hooks/use-factory-alibaba-products';

/**
 * Crawl Alibaba product listings for every factory whose overall_score >= 60.
 *
 * Server defaults (in supabase/functions/crawl-alibaba-products):
 *   - min_score = 60
 *   - factory limit per invocation = 20
 *   - max products per factory = 60
 *
 * Sending an empty body relies on those defaults. To override, pass
 * `{ min_score, limit }` from a settings UI in the future.
 */
export function BulkAlibabaCrawlButton() {
  const { mutate: triggerCrawl, isPending } = useTriggerFactoryAlibabaCrawl();

  const handleClick = () => {
    triggerCrawl({});
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 text-xs uppercase tracking-wider font-medium border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
      onClick={handleClick}
      disabled={isPending}
      title="overall_score >= 60 인 공장들의 알리바바 상품을 일괄 크롤합니다 (최대 20개 공장)"
    >
      {isPending ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
      )}
      {isPending ? 'Alibaba 상품 일괄 크롤 중…' : 'Alibaba 상품 일괄 크롤 (≥60점)'}
    </Button>
  );
}
