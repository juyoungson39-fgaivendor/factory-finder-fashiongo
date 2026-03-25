import { useRef, useCallback } from 'react';
import { getImageEmbedding } from '@/services/imageMatchingService';

export function useEmbeddingCache() {
  const cacheRef = useRef<Map<string, number[]>>(new Map());

  const getCachedEmbedding = useCallback(async (imageUrl: string) => {
    if (cacheRef.current.has(imageUrl)) {
      return cacheRef.current.get(imageUrl)!;
    }
    const embedding = await getImageEmbedding(imageUrl);
    cacheRef.current.set(imageUrl, embedding);
    return embedding;
  }, []);

  const clearCache = useCallback(() => {
    cacheRef.current.clear();
  }, []);

  return { getCachedEmbedding, clearCache };
}
