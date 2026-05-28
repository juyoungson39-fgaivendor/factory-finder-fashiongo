import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FACTORY_ALIBABA_PRODUCTS_KEY } from '@/integrations/alibaba/hooks/use-factory-alibaba-products';

// Each Apify detail-page call averages 30–60s and the edge function
// processes the chunk SEQUENTIALLY. Supabase's gateway aborts any
// function invocation past 150s — chunks of 6 reproducibly hit 504s.
// 2 rows × ~60s = ~120s leaves a safe margin under the 150s ceiling.
const CHUNK_SIZE = 2;

/**
 * Bulk-enrich every `factory_alibaba_products` row that hasn't been
 * detail-page enriched yet (enriched_at IS NULL).
 *
 * The edge function (`enrich-alibaba-product-details`) accepts a list
 * of product_ids and processes them sequentially. We split the full
 * "missing" set into small chunks and feed them one chunk at a time
 * to get progress feedback.
 */
export function BulkAlibabaEnrichButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleClick = async () => {
    setIsRunning(true);
    setProgress({ done: 0, total: 0 });

    try {
      // 1) Find every alibaba row that still needs detail enrichment.
      //    Includes:
      //      - rows never enriched (enriched_at IS NULL)
      //      - rows enriched but image missing (main_image_url IS NULL) —
      //        the listing crawl's anchors=20 layout variant can leave
      //        main_image_url NULL even after a successful crawl; the
      //        enrich function backfills these from the detail page's
      //        mediaItems[0].
      //    NOTE: supabase types not regenerated; scoped untyped client.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any;
      const { data: rows, error: selectError } = await sb
        .from('factory_alibaba_products')
        .select('id')
        .or('enriched_at.is.null,main_image_url.is.null');

      if (selectError) throw new Error(selectError.message);

      const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id);
      if (ids.length === 0) {
        toast({
          title: '보강할 상품 없음',
          description: '모든 알리바바 상품이 이미 상세 정보 + 이미지가 채워져 있습니다.',
        });
        return;
      }

      setProgress({ done: 0, total: ids.length });

      let completed = 0;
      let failed = 0;
      let skipped = 0;

      // 2) Chunk and invoke. Sequential — each chunk waits for the previous.
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        try {
          const { data, error: fnError } = await supabase.functions.invoke(
            'enrich-alibaba-product-details',
            { body: { product_ids: chunk, only_missing: false } },
          );
          if (fnError) throw new Error(fnError.message);
          const summary = (data as { summary?: { completed?: number; failed?: number; skipped?: number } } | null)?.summary;
          if (summary) {
            completed += summary.completed ?? 0;
            failed    += summary.failed    ?? 0;
            skipped   += summary.skipped   ?? 0;
          }
        } catch (e) {
          // Whole-chunk failure — count every id in this chunk as failed.
          failed += chunk.length;
          console.error('[bulk-enrich] chunk failed', chunk, e);
        }
        setProgress({ done: Math.min(i + CHUNK_SIZE, ids.length), total: ids.length });
      }

      // 3) Refresh products query so the page picks up the new fields.
      queryClient.invalidateQueries({ queryKey: FACTORY_ALIBABA_PRODUCTS_KEY });
      // Also refresh the sourceable-products view that the 소싱가능상품 page reads.
      queryClient.invalidateQueries({ queryKey: ['sourceable-products'] });

      // 4) Final summary toast.
      if (completed > 0 && failed === 0) {
        toast({
          title: '상세 정보 보강 완료',
          description: `${completed}개 상품 (스킵 ${skipped})`,
        });
      } else if (completed > 0 && failed > 0) {
        toast({
          title: '상세 정보 보강 부분 완료',
          description: `성공 ${completed} · 실패 ${failed} · 스킵 ${skipped}`,
        });
      } else {
        toast({
          title: '상세 정보 보강 실패',
          description: `${ids.length}개 상품 모두 실패`,
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({
        title: '상세 정보 보강 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setIsRunning(false);
      setProgress({ done: 0, total: 0 });
    }
  };

  const label =
    isRunning && progress.total > 0
      ? `상세 보강 ${progress.done}/${progress.total} (${Math.round(
          (progress.done / progress.total) * 100,
        )}%)`
      : '상세 정보 일괄 보강';

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 text-xs uppercase tracking-wider font-medium border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30"
      onClick={handleClick}
      disabled={isRunning}
      title="상세 정보(소재 · 무게 · 카테고리) 또는 메인 이미지가 채워지지 않은 알리바바 상품을 일괄로 detail 페이지에서 추출합니다"
    >
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <Sparkles className="w-3.5 h-3.5 mr-1.5" />
      )}
      {label}
    </Button>
  );
}
