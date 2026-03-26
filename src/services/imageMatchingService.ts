import { supabase } from '@/integrations/supabase/client';
import type { SourcingProduct, AIMatchedProduct } from '@/types/matching';

/** Batch analyze similarity between trend image and product images using Gemini AI */
export async function analyzeImageSimilarity(
  trendImageUrl: string,
  productImageUrls: string[]
): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke('ai-image-similarity', {
    body: {
      trend_image_url: trendImageUrl,
      product_images: productImageUrls,
    },
  });

  if (error) throw new Error(`AI similarity error: ${error.message}`);
  if (!data?.scores || !Array.isArray(data.scores)) throw new Error('No scores returned');

  return data.scores;
}

/** Match products by AI image similarity */
export async function matchProductsByAI(
  trendImageUrl: string,
  products: SourcingProduct[],
  onProgress?: (current: number, total: number) => void
): Promise<AIMatchedProduct[]> {
  const BATCH_SIZE = 6;

  // Split into batches
  const batches: SourcingProduct[][] = [];
  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    batches.push(products.slice(i, i + BATCH_SIZE));
  }

  onProgress?.(0, products.length);

  // Run ALL batches in parallel
  let completed = 0;
  const batchResults = await Promise.all(
    batches.map(async (batch) => {
      const batchUrls = batch.map(p => p.image);
      const scores = await analyzeImageSimilarity(trendImageUrl, batchUrls);
      completed += batch.length;
      onProgress?.(Math.min(completed, products.length), products.length);
      return scores;
    })
  );

  // Flatten scores
  const allScores = batchResults.flat();

  // Create matched products with AI scores
  const results: AIMatchedProduct[] = products.map((product, index) => ({
    ...product,
    similarity: Math.max(0, Math.min(100, allScores[index] || 0)),
    matchedByAI: true,
  }));

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, 6);
}
