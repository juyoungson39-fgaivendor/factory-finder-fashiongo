import { useState, useCallback } from 'react';
import { matchProductsByAI } from '@/services/imageMatchingService';
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

  const runMatching = useCallback(async (trendImageUrl: string, products: SourcingProduct[]) => {
    setIsMatching(true);
    setMatchError(null);
    setProgress({ current: 0, total: products.length });
    const startTime = performance.now();

    try {
      const results = await matchProductsByAI(
        trendImageUrl,
        products,
        (current, total) => setProgress({ current, total })
      );

      setMatchedProducts(results);
      setElapsedMs(Math.round(performance.now() - startTime));
    } catch (error) {
      console.error('AI matching error:', error);
      setMatchError('AI 이미지 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsMatching(false);
    }
  }, []);

  return { matchedProducts, isMatching, matchError, progress, elapsedMs, runMatching };
}
