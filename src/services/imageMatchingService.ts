import { supabase } from '@/integrations/supabase/client';
import type { SourcingProduct, AIMatchedProduct } from '@/types/matching';

/** Get CLIP embedding for an image via edge function */
export async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const { data, error } = await supabase.functions.invoke('clip-embedding', {
    body: { image_url: imageUrl },
  });

  if (error) throw new Error(`Embedding error: ${error.message}`);
  if (!data?.embedding) throw new Error('No embedding returned');

  return data.embedding;
}

/** Cosine similarity between two vectors → 0~100 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;

  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;

  const similarity = dot / denom;
  // CLIP cosine sim typically ranges 0.15~0.40 for images
  // Normalize to 0~100 scale (0.15→0, 0.40→100)
  const normalized = Math.max(0, Math.min(100, ((similarity - 0.15) / 0.25) * 100));
  return Math.round(normalized);
}
