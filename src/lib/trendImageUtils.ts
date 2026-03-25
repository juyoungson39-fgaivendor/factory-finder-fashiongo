import type { SNSTrend, MatchedProduct } from '@/data/trendMockData';

const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

export function getTrendImage(trend: SNSTrend): string {
  return trend.image_url || trend.fallback_image || DEFAULT_PLACEHOLDER;
}

export function getProductImage(product: MatchedProduct): string {
  return product.image_url || DEFAULT_PLACEHOLDER;
}
