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
  Dresses: "👗",
};

// Image Trend types and mock data

export interface SNSTrend {
  id: string;
  style_name: string;
  source: string;
  views: string;
  change_pct: number;
  category: string;
  celebrity: string;
  tags: string[];
  detected_at: string;
}

export interface MatchedProduct {
  id: string;
  name_ko: string;
  name_en: string;
  similarity: number;
  similarity_detail: { color: number; silhouette: number; material: number };
  source_price_cny: number;
  retail_price_usd: number;
  margin_pct: number;
  supplier_rating: number;
  review_count: number;
  category: string;
  matched_tags: string[];
}

export const CATEGORY_GRADIENTS: Record<string, string> = {
  Shoes: "from-pink-400 to-purple-500",
  Tops: "from-sky-300 to-teal-400",
  Bottoms: "from-amber-600 to-olive-600",
  Accessories: "from-gray-400 to-gray-800",
  Dresses: "from-orange-300 to-pink-300",
};

export const MOCK_SNS_TRENDS: SNSTrend[] = [
  { id: "trend_1", style_name: "Chunky Sporty Sneaker", source: "TikTok", views: "2.3M", change_pct: 340, category: "Shoes", celebrity: "속도(Speed)", tags: ["chunky sole", "white", "sporty", "retro"], detected_at: "2026-03-20" },
  { id: "trend_2", style_name: "Sheer Layered Blouse", source: "Instagram", views: "1.8M", change_pct: 210, category: "Tops", celebrity: "Hailey Bieber", tags: ["sheer", "layered", "white", "minimal"], detected_at: "2026-03-18" },
  { id: "trend_3", style_name: "Wide Cargo Pants", source: "TikTok", views: "4.1M", change_pct: 180, category: "Bottoms", celebrity: "NewJeans Haerin", tags: ["cargo", "wide leg", "khaki", "utility"], detected_at: "2026-03-22" },
  { id: "trend_4", style_name: "Oversized Leather Tote", source: "Instagram", views: "980K", change_pct: 150, category: "Accessories", celebrity: "Kendall Jenner", tags: ["leather", "oversized", "black", "minimal"], detected_at: "2026-03-19" },
  { id: "trend_5", style_name: "Crochet Knit Mini Dress", source: "TikTok", views: "1.5M", change_pct: 260, category: "Dresses", celebrity: "Olivia Rodrigo", tags: ["crochet", "knit", "mini", "summer"], detected_at: "2026-03-21" },
];

export const MOCK_MATCHED_PRODUCTS: Record<string, MatchedProduct[]> = {
  trend_1: [
    { id: "mp1", name_ko: "청키 스포츠 스니커즈", name_en: "Chunky Sport Sneaker", similarity: 92, similarity_detail: { color: 95, silhouette: 90, material: 88 }, source_price_cny: 89, retail_price_usd: 45, margin_pct: 48, supplier_rating: 4.7, review_count: 289, category: "Shoes", matched_tags: ["chunky sole", "white", "sporty"] },
    { id: "mp2", name_ko: "레트로 러닝 스니커즈", name_en: "Retro Running Sneaker", similarity: 85, similarity_detail: { color: 88, silhouette: 84, material: 80 }, source_price_cny: 75, retail_price_usd: 38, margin_pct: 45, supplier_rating: 4.5, review_count: 198, category: "Shoes", matched_tags: ["retro", "white", "sporty"] },
    { id: "mp3", name_ko: "플랫폼 캐주얼 스니커즈", name_en: "Platform Casual Sneaker", similarity: 79, similarity_detail: { color: 82, silhouette: 78, material: 75 }, source_price_cny: 95, retail_price_usd: 48, margin_pct: 46, supplier_rating: 4.6, review_count: 167, category: "Shoes", matched_tags: ["chunky sole", "platform"] },
    { id: "mp4", name_ko: "메쉬 통기 스포츠화", name_en: "Mesh Breathable Sport Shoe", similarity: 74, similarity_detail: { color: 70, silhouette: 80, material: 72 }, source_price_cny: 65, retail_price_usd: 32, margin_pct: 50, supplier_rating: 4.4, review_count: 312, category: "Shoes", matched_tags: ["sporty", "mesh", "white"] },
    { id: "mp5", name_ko: "빈티지 청키 워커", name_en: "Vintage Chunky Walker", similarity: 71, similarity_detail: { color: 65, silhouette: 82, material: 68 }, source_price_cny: 110, retail_price_usd: 55, margin_pct: 47, supplier_rating: 4.3, review_count: 143, category: "Shoes", matched_tags: ["chunky sole", "retro"] },
    { id: "mp6", name_ko: "화이트 캔버스 스니커즈", name_en: "White Canvas Sneaker", similarity: 68, similarity_detail: { color: 90, silhouette: 55, material: 58 }, source_price_cny: 42, retail_price_usd: 22, margin_pct: 52, supplier_rating: 4.6, review_count: 425, category: "Shoes", matched_tags: ["white", "minimal"] },
  ],
  trend_2: [
    { id: "mp7", name_ko: "시스루 레이어드 블라우스", name_en: "Sheer Layered Blouse", similarity: 89, similarity_detail: { color: 92, silhouette: 88, material: 85 }, source_price_cny: 52, retail_price_usd: 30, margin_pct: 42, supplier_rating: 4.5, review_count: 176, category: "Tops", matched_tags: ["sheer", "layered", "white"] },
    { id: "mp8", name_ko: "오간자 퍼프 탑", name_en: "Organza Puff Top", similarity: 82, similarity_detail: { color: 85, silhouette: 80, material: 78 }, source_price_cny: 48, retail_price_usd: 28, margin_pct: 40, supplier_rating: 4.4, review_count: 134, category: "Tops", matched_tags: ["sheer", "minimal"] },
    { id: "mp9", name_ko: "미니멀 시폰 셔츠", name_en: "Minimal Chiffon Shirt", similarity: 75, similarity_detail: { color: 80, silhouette: 72, material: 70 }, source_price_cny: 40, retail_price_usd: 24, margin_pct: 38, supplier_rating: 4.3, review_count: 98, category: "Tops", matched_tags: ["minimal", "white"] },
  ],
  trend_3: [
    { id: "mp10", name_ko: "와이드 카고 팬츠", name_en: "Wide Cargo Pants", similarity: 94, similarity_detail: { color: 90, silhouette: 96, material: 92 }, source_price_cny: 72, retail_price_usd: 40, margin_pct: 44, supplier_rating: 4.8, review_count: 356, category: "Bottoms", matched_tags: ["cargo", "wide leg", "khaki"] },
    { id: "mp11", name_ko: "유틸리티 포켓 팬츠", name_en: "Utility Pocket Pants", similarity: 86, similarity_detail: { color: 82, silhouette: 90, material: 85 }, source_price_cny: 68, retail_price_usd: 38, margin_pct: 42, supplier_rating: 4.6, review_count: 223, category: "Bottoms", matched_tags: ["utility", "wide leg"] },
    { id: "mp12", name_ko: "스트릿 카고 조거", name_en: "Street Cargo Jogger", similarity: 72, similarity_detail: { color: 75, silhouette: 70, material: 68 }, source_price_cny: 58, retail_price_usd: 32, margin_pct: 40, supplier_rating: 4.4, review_count: 187, category: "Bottoms", matched_tags: ["cargo", "khaki"] },
  ],
  trend_4: [
    { id: "mp13", name_ko: "오버사이즈 레더 토트백", name_en: "Oversized Leather Tote", similarity: 91, similarity_detail: { color: 94, silhouette: 90, material: 88 }, source_price_cny: 135, retail_price_usd: 68, margin_pct: 46, supplier_rating: 4.7, review_count: 201, category: "Accessories", matched_tags: ["leather", "oversized", "black"] },
    { id: "mp14", name_ko: "미니멀 블랙 숄더백", name_en: "Minimal Black Shoulder Bag", similarity: 78, similarity_detail: { color: 88, silhouette: 72, material: 70 }, source_price_cny: 85, retail_price_usd: 42, margin_pct: 48, supplier_rating: 4.5, review_count: 156, category: "Accessories", matched_tags: ["black", "minimal"] },
  ],
  trend_5: [
    { id: "mp15", name_ko: "크로셰 니트 미니 원피스", name_en: "Crochet Knit Mini Dress", similarity: 90, similarity_detail: { color: 88, silhouette: 92, material: 90 }, source_price_cny: 78, retail_price_usd: 42, margin_pct: 43, supplier_rating: 4.6, review_count: 178, category: "Dresses", matched_tags: ["crochet", "knit", "mini"] },
    { id: "mp16", name_ko: "썸머 니트 홀터 드레스", name_en: "Summer Knit Halter Dress", similarity: 83, similarity_detail: { color: 80, silhouette: 85, material: 82 }, source_price_cny: 65, retail_price_usd: 36, margin_pct: 40, supplier_rating: 4.5, review_count: 145, category: "Dresses", matched_tags: ["knit", "summer"] },
    { id: "mp17", name_ko: "보헤미안 크로셰 스커트", name_en: "Bohemian Crochet Skirt", similarity: 76, similarity_detail: { color: 72, silhouette: 78, material: 80 }, source_price_cny: 55, retail_price_usd: 30, margin_pct: 41, supplier_rating: 4.4, review_count: 112, category: "Dresses", matched_tags: ["crochet", "summer"] },
  ],
};
