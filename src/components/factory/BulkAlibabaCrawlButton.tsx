import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ShoppingBag } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FACTORY_ALIBABA_PRODUCTS_KEY } from '@/integrations/alibaba/hooks/use-factory-alibaba-products';

const MIN_STOCK_SCORE = 60;
const MAX_FACTORIES = 20;

// Match BulkAlibabaEnrichButton — the enrich edge function processes
// detail-page calls sequentially and Supabase aborts past ~150s. 2 rows
// × ~60s detail call ≈ 120s, safely under the 150s ceiling.
const ENRICH_CHUNK_SIZE = 2;

interface FactoryRow {
  id: string;
  name: string;
  stock_score: number | null;
  alibaba_supplier_id: string | null;
  alibaba_url: string | null;
}

/**
 * Bulk-crawl Alibaba product listings for every factory whose stock_score >= 60.
 *
 * The edge function `crawl-alibaba-products` can in theory take a min_score
 * directly, but sequential server-side processing of N factories exceeds the
 * 150s gateway idle timeout (each factory's Apify fetch alone is 40–100s).
 *
 * So we run the loop CLIENT-side: fetch the eligible factories first, then
 * call the edge function once per factory_id. That way each request comfortably
 * fits inside the timeout AND the user gets real-time progress feedback that
 * matches the existing "크롤링 N/M" buttons on this page.
 */
type Phase = 'idle' | 'crawl' | 'enrich';

export function BulkAlibabaCrawlButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState<{ phase: Phase; done: number; total: number }>(
    { phase: 'idle', done: 0, total: 0 },
  );
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleClick = async () => {
    setIsRunning(true);
    setProgress({ phase: 'crawl', done: 0, total: 0 });

    try {
      // 1) Pick the candidate factories. Filter on the client too so we know
      //    the exact list and can show a meaningful "0개 대상" message.
      const { data: factoriesRaw, error: selectError } = await supabase
        .from('factories')
        .select('id, name, stock_score, alibaba_supplier_id, alibaba_url')
        .gte('stock_score', MIN_STOCK_SCORE)
        .is('deleted_at', null)
        .order('stock_score', { ascending: false })
        .limit(MAX_FACTORIES);

      if (selectError) throw new Error(selectError.message);

      const factories = (factoriesRaw ?? []) as FactoryRow[];
      const crawlable = factories.filter(
        (f) => !!f.alibaba_supplier_id || !!f.alibaba_url,
      );

      if (crawlable.length === 0) {
        toast({
          title: '대상 공장 없음',
          description:
            factories.length === 0
              ? `stock_score >= ${MIN_STOCK_SCORE} 인 공장이 없습니다.`
              : `${factories.length}개 공장 중 알리바바 supplier 정보가 있는 공장이 없습니다.`,
        });
        return;
      }

      setProgress({ phase: 'crawl', done: 0, total: crawlable.length });

      // 2) Sequential single-factory invocations. Each one stays well under the
      //    150s gateway idle timeout, and we get progress feedback.
      let completed = 0;
      let failed = 0;
      let totalRecords = 0;
      const crawledFactoryIds: string[] = [];

      for (let i = 0; i < crawlable.length; i++) {
        const factory = crawlable[i];
        try {
          const { data, error: fnError } = await supabase.functions.invoke(
            'crawl-alibaba-products',
            { body: { factory_id: factory.id } },
          );
          if (fnError) throw new Error(fnError.message);
          const summary = (data as { summary?: { completed?: number; failed?: number; total_records?: number } } | null)?.summary;
          if (summary) {
            completed += summary.completed ?? 0;
            failed += summary.failed ?? 0;
            totalRecords += summary.total_records ?? 0;
          }
          crawledFactoryIds.push(factory.id);
        } catch (e) {
          failed += 1;
          console.error('[bulk-crawl] factory failed', factory.id, factory.name, e);
        }
        setProgress({ phase: 'crawl', done: i + 1, total: crawlable.length });
      }

      // 3) Refresh every per-factory products query at once.
      queryClient.invalidateQueries({ queryKey: FACTORY_ALIBABA_PRODUCTS_KEY });

      // 4) Auto-chain image backfill for any rows the listing crawl left
      //    without a main_image_url. Alibaba randomly serves an
      //    "anchors=20" layout variant where the product <img> sits
      //    OUTSIDE the title anchor and the window-fallback in the parser
      //    can't always find it.
      //
      //    We use `backfill-alibaba-product-images` (NOT the structured
      //    enrich function) — it depends only on the generic
      //    `apify~website-content-crawler` actor we already trust, and
      //    extracts `<meta property="og:image">` from the detail page.
      //    The enrich function's shareze001 actor was failing 100% on
      //    our token, so this path is independent of that.
      let enrichTotal = 0;
      let enrichCompleted = 0;
      let enrichFailed = 0;
      if (crawledFactoryIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data: nullImgRows, error: nullImgError } = await sb
          .from('factory_alibaba_products')
          .select('id')
          .in('factory_id', crawledFactoryIds)
          .is('main_image_url', null);

        if (nullImgError) {
          console.error('[bulk-crawl] null-image lookup failed', nullImgError);
        } else {
          const ids = ((nullImgRows ?? []) as { id: string }[]).map((r) => r.id);
          enrichTotal = ids.length;
          if (enrichTotal > 0) {
            setProgress({ phase: 'enrich', done: 0, total: enrichTotal });
            for (let i = 0; i < ids.length; i += ENRICH_CHUNK_SIZE) {
              const chunk = ids.slice(i, i + ENRICH_CHUNK_SIZE);
              try {
                const { data: enrichData, error: enrichErr } = await supabase.functions.invoke(
                  'backfill-alibaba-product-images',
                  { body: { product_ids: chunk } },
                );
                if (enrichErr) throw new Error(enrichErr.message);
                const s = (enrichData as { summary?: { completed?: number; failed?: number } } | null)?.summary;
                if (s) {
                  enrichCompleted += s.completed ?? 0;
                  enrichFailed    += s.failed    ?? 0;
                }
              } catch (e) {
                enrichFailed += chunk.length;
                console.error('[bulk-crawl] enrich chunk failed', chunk, e);
              }
              setProgress({
                phase: 'enrich',
                done: Math.min(i + ENRICH_CHUNK_SIZE, ids.length),
                total: ids.length,
              });
            }
            // Re-invalidate so the rescued images show up.
            queryClient.invalidateQueries({ queryKey: FACTORY_ALIBABA_PRODUCTS_KEY });
            queryClient.invalidateQueries({ queryKey: ['sourceable-products'] });
          }
        }
      }

      // 5) Final toast — combined summary for crawl + enrich.
      const enrichTail = enrichTotal > 0
        ? ` · 이미지 보강 ${enrichCompleted}/${enrichTotal}${enrichFailed > 0 ? ` (실패 ${enrichFailed})` : ''}`
        : '';
      if (completed > 0 && failed === 0) {
        toast({
          title: '알리바바 상품 일괄 크롤 완료',
          description: `${completed}개 공장 · 총 ${totalRecords}개 상품${enrichTail}`,
        });
      } else if (completed > 0 && failed > 0) {
        toast({
          title: '알리바바 상품 일괄 크롤 부분 완료',
          description: `성공 ${completed} · 실패 ${failed} · 총 ${totalRecords}개 상품${enrichTail}`,
        });
      } else {
        toast({
          title: '일괄 크롤 실패',
          description: `${crawlable.length}개 공장 모두 실패`,
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: '일괄 크롤 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
      setProgress({ phase: 'idle', done: 0, total: 0 });
    }
  };

  const label = (() => {
    if (!isRunning || progress.total === 0) return 'Alibaba 상품 일괄 크롤 (≥60점)';
    const pct = Math.round((progress.done / progress.total) * 100);
    const verb = progress.phase === 'enrich' ? '이미지 보강' : 'Alibaba 크롤링';
    return `${verb} ${progress.done}/${progress.total} (${pct}%)`;
  })();

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 text-xs uppercase tracking-wider font-medium border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/30"
      onClick={handleClick}
      disabled={isRunning}
      title="stock_score >= 60 인 공장들의 알리바바 상품을 일괄 크롤하고, 메인 이미지가 비어있는 상품은 detail page 에서 자동 보강합니다 (최대 20개 공장)"
    >
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <ShoppingBag className="w-3.5 h-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
