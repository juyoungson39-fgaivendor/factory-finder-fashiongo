import { useState, useCallback, useRef } from 'react';
import { cosineSimilarity } from '@/services/imageMatchingService';
import { useEmbeddingCache } from './useEmbeddingCache';
import type { SourcingProduct, AIMatchedProduct } from '@/types/matching';

interface UseAIMatchingResult {
  matchedProducts: AIMatchedProduct[];
  isMatching: boolean;
  matchError: string | null;
  progress: { current: number; total: number };
  elapsedMs: number;
  runMatching: (trendImageUrl: string, products: SourcingProduct[]) => Promise<void>;
}

export function useAIMatching(): UseAIMatchingResult {
  const [matchedProducts, setMatchedProducts] = useState<AIMatchedProduct[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [elapsedMs, setElapsedMs] = useState(0);
  const { getCachedEmbedding } = useEmbeddingCache();

  const runMatching = useCallback(async (trendImageUrl: string, products: SourcingProduct[]) => {
    setIsMatching(true);
    setMatchError(null);
    setProgress({ current: 0, total: products.length });
    const startTime = performance.now();

    try {
      // Get trend embedding
      const trendEmb = await getCachedEmbedding(trendImageUrl);

      // Get product embeddings sequentially with delay for rate limiting
      const results: AIMatchedProduct[] = [];
      for (let i = 0; i < products.length; i++) {
        setProgress({ current: i + 1, total: products.length });

        try {
          // 200ms delay between requests for rate limiting
          if (i > 0) await new Promise(r => setTimeout(r, 200));

          const productEmb = await getCachedEmbedding(products[i].image);
          const similarity = cosineSimilarity(trendEmb, productEmb);

          results.push({
            ...products[i],
            similarity,
            matchedByAI: true,
          });
        } catch {
          results.push({
            ...products[i],
            similarity: 0,
            matchedByAI: true,
          });
        }
      }

      // Sort by similarity, take top 6
      results.sort((a, b) => b.similarity - a.similarity);
      setMatchedProducts(results.slice(0, 6));
      setElapsedMs(Math.round(performance.now() - startTime));
    } catch (error) {
      console.error('AI matching error:', error);
      setMatchError('AI 이미지 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsMatching(false);
    }
  }, [getCachedEmbedding]);

  return { matchedProducts, isMatching, matchError, progress, elapsedMs, runMatching };
}
