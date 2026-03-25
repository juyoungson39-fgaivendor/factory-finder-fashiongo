export interface TrendKeyword {
  keyword: string;
  trend_score: number;
  google: number;
  social: number;
  sales: number;
  change: number;
  category: string;
  history?: number[];
}

export interface RecommendedProduct {
  id: string;
  name_ko: string;
  name_en: string;
  keyword: string;
  total_score: number;
  trend_match: number;
  profitability: number;
  reliability: number;
  season_fit: number;
  source_price_cny: number;
  retail_price_usd: number;
  margin_pct: number;
  supplier_rating: number;
  review_count: number;
  category: string;
}

export const MOCK_TRENDS: TrendKeyword[] = [
  { keyword: "barrel jeans", trend_score: 88, google: 85, social: 91, sales: 88, change: 12, category: "Bottoms", history: [62,65,70,72,74,78,80,82,83,85,84,86,85,87,86,88,87,89,88,90,89,91,90,88,87,88,89,88,87,88] },
  { keyword: "linen blazer", trend_score: 76, google: 72, social: 74, sales: 82, change: 8, category: "Outerwear", history: [55,57,58,60,62,63,65,66,67,68,69,70,71,72,70,71,72,73,74,73,74,75,74,75,76,75,76,77,76,76] },
  { keyword: "mesh ballet flat", trend_score: 82, google: 80, social: 88, sales: 78, change: 15, category: "Shoes", history: [48,50,53,55,58,60,62,64,66,68,70,72,73,74,75,76,77,78,79,78,79,80,79,80,81,80,81,82,81,82] },
  { keyword: "oversized moto jacket", trend_score: 71, google: 68, social: 75, sales: 70, change: -3, category: "Outerwear", history: [75,76,77,78,77,78,77,76,75,76,75,74,75,74,73,74,73,72,73,72,73,72,71,72,71,72,71,72,71,71] },
  { keyword: "crochet top", trend_score: 79, google: 77, social: 83, sales: 77, change: 6, category: "Tops", history: [60,62,63,64,65,66,67,68,69,70,71,72,73,72,73,74,75,74,75,76,77,76,77,78,77,78,79,78,79,79] },
  { keyword: "wide leg trousers", trend_score: 84, google: 82, social: 86, sales: 84, change: 9, category: "Bottoms", history: [60,62,64,65,67,68,70,72,73,74,75,76,77,78,79,80,79,80,81,82,81,82,83,82,83,84,83,84,83,84] },
];

export const MOCK_PRODUCTS: RecommendedProduct[] = [
  { id: "p1", name_ko: "배럴 진 와이드핏", name_en: "Barrel Jeans Wide Fit", keyword: "barrel jeans", total_score: 87, trend_match: 88, profitability: 85, reliability: 90, season_fit: 80, source_price_cny: 68, retail_price_usd: 42, margin_pct: 44, supplier_rating: 4.8, review_count: 342, category: "Bottoms" },
  { id: "p2", name_ko: "린넨 오버핏 블레이저", name_en: "Oversized Linen Blazer", keyword: "linen blazer", total_score: 79, trend_match: 76, profitability: 80, reliability: 84, season_fit: 88, source_price_cny: 92, retail_price_usd: 55, margin_pct: 38, supplier_rating: 4.6, review_count: 218, category: "Outerwear" },
  { id: "p3", name_ko: "메쉬 발레 플랫슈즈", name_en: "Mesh Ballet Flat", keyword: "mesh ballet flat", total_score: 83, trend_match: 82, profitability: 78, reliability: 88, season_fit: 92, source_price_cny: 45, retail_price_usd: 28, margin_pct: 47, supplier_rating: 4.7, review_count: 189, category: "Shoes" },
  { id: "p4", name_ko: "크로셰 크롭 탑", name_en: "Crochet Crop Top", keyword: "crochet top", total_score: 75, trend_match: 79, profitability: 72, reliability: 76, season_fit: 85, source_price_cny: 38, retail_price_usd: 24, margin_pct: 41, supplier_rating: 4.5, review_count: 156, category: "Tops" },
  { id: "p5", name_ko: "오버사이즈 모토 재킷", name_en: "Oversized Moto Jacket", keyword: "oversized moto jacket", total_score: 71, trend_match: 71, profitability: 68, reliability: 78, season_fit: 60, source_price_cny: 125, retail_price_usd: 72, margin_pct: 35, supplier_rating: 4.4, review_count: 97, category: "Outerwear" },
  { id: "p6", name_ko: "와이드 레그 트라우저", name_en: "Wide Leg Trousers", keyword: "wide leg trousers", total_score: 82, trend_match: 84, profitability: 80, reliability: 82, season_fit: 78, source_price_cny: 55, retail_price_usd: 36, margin_pct: 42, supplier_rating: 4.6, review_count: 265, category: "Bottoms" },
  { id: "p7", name_ko: "배럴 진 스트레이트", name_en: "Barrel Jeans Straight", keyword: "barrel jeans", total_score: 84, trend_match: 86, profitability: 82, reliability: 85, season_fit: 78, source_price_cny: 72, retail_price_usd: 44, margin_pct: 42, supplier_rating: 4.7, review_count: 280, category: "Bottoms" },
  { id: "p8", name_ko: "크로셰 니트 베스트", name_en: "Crochet Knit Vest", keyword: "crochet top", total_score: 73, trend_match: 75, profitability: 70, reliability: 74, season_fit: 82, source_price_cny: 42, retail_price_usd: 26, margin_pct: 39, supplier_rating: 4.3, review_count: 112, category: "Tops" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  Bottoms: "#3b82f6",
  Outerwear: "#8b5cf6",
  Shoes: "#f59e0b",
  Tops: "#ec4899",
  Accessories: "#10b981",
};

export const CATEGORY_ICONS: Record<string, string> = {
  Bottoms: "👖",
  Outerwear: "🧥",
  Shoes: "👟",
  Tops: "👕",
  Accessories: "💍",
};
