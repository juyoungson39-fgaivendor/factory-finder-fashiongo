import type { SNSTrend, MatchedProduct } from '@/data/trendMockData';

const DEFAULT_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

export const TREND_FALLBACK_IMAGES: Record<string, string> = {
  "Chunky Sporty Sneaker": "https://images.unsplash.com/photo-1552346154-21d32810aba3?w=400&h=500&fit=crop",
  "Sheer Layered Blouse": "https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=400&h=500&fit=crop",
  "Wide Cargo Pants": "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop",
  "Oversized Leather Tote": "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&h=500&fit=crop",
  "Crochet Knit Mini Dress": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=500&fit=crop",
};

export const PRODUCT_FALLBACK_IMAGES: Record<string, string[]> = {
  Shoes: [
    "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=300&h=300&fit=crop",
  ],
  Tops: [
    "https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=300&h=300&fit=crop",
  ],
  Bottoms: [
    "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&h=300&fit=crop",
  ],
  Accessories: [
    "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&h=300&fit=crop",
  ],
  Dresses: [
    "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=300&h=300&fit=crop",
    "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=300&fit=crop",
  ],
};

export function getTrendImage(trend: SNSTrend): string {
  if ((trend as any).api_image_url) return (trend as any).api_image_url;
  return TREND_FALLBACK_IMAGES[trend.style_name] || DEFAULT_PLACEHOLDER;
}

export function getProductImage(product: MatchedProduct, index: number): string {
  if ((product as any).model_image_url) return (product as any).model_image_url;
  if ((product as any).product_image_url) return (product as any).product_image_url;
  const fallbacks = PRODUCT_FALLBACK_IMAGES[product.category] || [];
  return fallbacks[index % fallbacks.length] || DEFAULT_PLACEHOLDER;
}
