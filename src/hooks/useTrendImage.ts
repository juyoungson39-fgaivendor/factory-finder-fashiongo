export interface TrendArticle {
  url: string;
  publisher: string;
}

/**
 * Returns the product-focused fallback image directly
 * instead of fetching magazine OG thumbnails.
 */
export function useTrendImage(_articles: TrendArticle[], fallbackImage: string) {
  return {
    imageUrl: fallbackImage,
    publisher: '',
    loading: false,
    isFallback: false,
  };
}
