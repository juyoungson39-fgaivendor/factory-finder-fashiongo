export interface TrendArticle {
  url: string;
  publisher: string;
}

/**
 * Uses the product-focused fallback image directly.
 * Magazine OG images typically show celebrity faces, not the actual product.
 */
export function useTrendImage(_articles: TrendArticle[], fallbackImage: string) {
  return {
    imageUrl: fallbackImage,
    publisher: '',
    loading: false,
    isFallback: false,
  };
}
