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
  image?: string;
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
  { id: "p1", name_ko: "배럴 진 와이드핏", name_en: "Barrel Jeans Wide Fit", keyword: "barrel jeans", total_score: 87, trend_match: 88, profitability: 85, reliability: 90, season_fit: 80, source_price_cny: 68, retail_price_usd: 42, margin_pct: 44, supplier_rating: 4.8, review_count: 342, category: "Bottoms", image: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=500&fit=crop&crop=center" },
  { id: "p2", name_ko: "린넨 오버핏 블레이저", name_en: "Oversized Linen Blazer", keyword: "linen blazer", total_score: 79, trend_match: 76, profitability: 80, reliability: 84, season_fit: 88, source_price_cny: 92, retail_price_usd: 55, margin_pct: 38, supplier_rating: 4.6, review_count: 218, category: "Outerwear", image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&h=500&fit=crop&crop=center" },
  { id: "p3", name_ko: "메쉬 발레 플랫슈즈", name_en: "Mesh Ballet Flat", keyword: "mesh ballet flat", total_score: 83, trend_match: 82, profitability: 78, reliability: 88, season_fit: 92, source_price_cny: 45, retail_price_usd: 28, margin_pct: 47, supplier_rating: 4.7, review_count: 189, category: "Shoes", image: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&h=500&fit=crop&crop=center" },
  { id: "p4", name_ko: "크로셰 크롭 탑", name_en: "Crochet Crop Top", keyword: "crochet top", total_score: 75, trend_match: 79, profitability: 72, reliability: 76, season_fit: 85, source_price_cny: 38, retail_price_usd: 24, margin_pct: 41, supplier_rating: 4.5, review_count: 156, category: "Tops", image: "https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=400&h=500&fit=crop&crop=center" },
  { id: "p5", name_ko: "오버사이즈 모토 재킷", name_en: "Oversized Moto Jacket", keyword: "oversized moto jacket", total_score: 71, trend_match: 71, profitability: 68, reliability: 78, season_fit: 60, source_price_cny: 125, retail_price_usd: 72, margin_pct: 35, supplier_rating: 4.4, review_count: 97, category: "Outerwear", image: "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400&h=500&fit=crop&crop=center" },
  { id: "p6", name_ko: "와이드 레그 트라우저", name_en: "Wide Leg Trousers", keyword: "wide leg trousers", total_score: 82, trend_match: 84, profitability: 80, reliability: 82, season_fit: 78, source_price_cny: 55, retail_price_usd: 36, margin_pct: 42, supplier_rating: 4.6, review_count: 265, category: "Bottoms", image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=500&fit=crop&crop=center" },
  { id: "p7", name_ko: "배럴 진 스트레이트", name_en: "Barrel Jeans Straight", keyword: "barrel jeans", total_score: 84, trend_match: 86, profitability: 82, reliability: 85, season_fit: 78, source_price_cny: 72, retail_price_usd: 44, margin_pct: 42, supplier_rating: 4.7, review_count: 280, category: "Bottoms", image: "https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=400&h=500&fit=crop&crop=center" },
  { id: "p8", name_ko: "크로셰 니트 베스트", name_en: "Crochet Knit Vest", keyword: "crochet top", total_score: 73, trend_match: 75, profitability: 70, reliability: 74, season_fit: 82, source_price_cny: 42, retail_price_usd: 26, margin_pct: 39, supplier_rating: 4.3, review_count: 112, category: "Tops", image: "https://images.unsplash.com/photo-1434389677669-e08b4cda3a0a?w=400&h=500&fit=crop&crop=center" },
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

export interface TrendArticle {
  url: string;
  publisher: string;
}

export interface SNSTrend {
  id: string;
  style_name: string;
  description: string;
  source: string;
  source_handle: string;
  engagement: string;
  change_pct: number;
  category: string;
  celebrity: string;
  tags: string[];
  detected_at: string;
  image_url: string;
  fallback_image: string;
  product_image?: string;
  articles: TrendArticle[];
  /** @deprecated use articles[0] */
  article_ref: string;
  /** @deprecated use articles[0].url */
  article_url: string;
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
  image_url: string;
}

export const CATEGORY_GRADIENTS: Record<string, string> = {
  Shoes: "from-pink-400 to-purple-500",
  Tops: "from-sky-300 to-teal-400",
  Bottoms: "from-amber-600 to-olive-600",
  Accessories: "from-gray-400 to-gray-800",
  Dresses: "from-orange-300 to-pink-300",
};

export const MOCK_SNS_TRENDS: SNSTrend[] = [
  {
    id: "trend_1", style_name: "Chunky Sporty Sneaker", description: "Nike Air Max 95 'Stadium Green' with oversized shearling jacket", celebrity: "Hailey Bieber", source: "Instagram", source_handle: "@haileybieber", engagement: "2.3M likes", change_pct: 340, category: "Shoes",
    tags: ["chunky sole", "Nike Air Max", "white-green", "dad shoe", "retro sporty"], detected_at: "2026-03-20",
    image_url: "", fallback_image: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600&h=800&fit=crop&crop=bottom",
    articles: [
      { url: "https://www.highsnobiety.com/p/hailey-bieber-nike-air-max-95/", publisher: "Highsnobiety" },
      { url: "https://footwearnews.com/fashion/celebrity-style/hailey-bieber-black-nike-air-max-95-sneakers-1203546026/", publisher: "Footwear News" },
      { url: "https://www.marieclaire.com/fashion/celebrity-style/hailey-bieber-nike-air-max-green-sneakers-justin-shearling-jacket/", publisher: "Marie Claire" },
    ],
    product_image: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=120&h=120&fit=crop",
    article_ref: "Highsnobiety", article_url: "https://www.highsnobiety.com/p/hailey-bieber-nike-air-max-95/",
  },
  {
    id: "trend_2", style_name: "Sheer Layered Blouse", description: "Sheer white blouse with leather jacket and wide-leg pants in Paris", celebrity: "Bella Hadid", source: "Instagram", source_handle: "@bellahadid", engagement: "1.8M likes", change_pct: 210, category: "Tops",
    tags: ["sheer", "layered", "white", "see-through", "Parisian chic"], detected_at: "2026-03-18",
    image_url: "", fallback_image: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=520&fit=crop&crop=top",
    articles: [
      { url: "https://www.marieclaire.com/fashion/celebrity-style/bella-hadid-paris-wide-leg-pants-fall-loafers-woven-bag/", publisher: "Marie Claire" },
      { url: "https://www.redcarpet-fashionawards.com/2025/09/26/bella-hadid-nails-fall-street-style-in-paris/", publisher: "Red Carpet Fashion Awards" },
    ],
    product_image: "https://images.unsplash.com/photo-1598554747436-c9293d6a588f?w=120&h=120&fit=crop",
    article_ref: "Marie Claire", article_url: "https://www.marieclaire.com/fashion/celebrity-style/bella-hadid-paris-wide-leg-pants-fall-loafers-woven-bag/",
  },
  {
    id: "trend_3", style_name: "Wide Cargo Pants", description: "Amiri camo cargo pants with Gucci tote bag in NYC Flatiron", celebrity: "Rihanna", source: "TikTok", source_handle: "@badgalriri", engagement: "4.1M views", change_pct: 180, category: "Bottoms",
    tags: ["cargo", "wide leg", "camo", "utility", "street style"], detected_at: "2026-03-22",
    image_url: "", fallback_image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=400&h=520&fit=crop&crop=center",
    articles: [
      { url: "https://www.marieclaire.com/fashion/rihanna-camo-cargo-pants-gucci-tote/", publisher: "Marie Claire" },
      { url: "https://www.wmagazine.com/fashion/rihanna-camo-cargo-pants-blue-jersey-gucci-bag-new-york", publisher: "W Magazine" },
      { url: "https://www.eonline.com/news/1321062/ways-to-wear-the-cargo-pants-trend-like-rihanna-kim-kardashian-dua-lipa-hailey-bieber-more-stars", publisher: "E! Online" },
    ],
    product_image: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=120&h=120&fit=crop",
    article_ref: "Marie Claire", article_url: "https://www.marieclaire.com/fashion/rihanna-camo-cargo-pants-gucci-tote/",
  },
  {
    id: "trend_4", style_name: "Oversized Leather Tote", description: "The Row Park Tote Three in dark olive — 2026's next It Bag", celebrity: "Kendall Jenner", source: "Instagram", source_handle: "@kendalljenner", engagement: "980K likes", change_pct: 150, category: "Accessories",
    tags: ["leather", "oversized", "The Row", "olive", "quiet luxury"], detected_at: "2026-03-19",
    image_url: "", fallback_image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=400&h=520&fit=crop&crop=center",
    articles: [
      { url: "https://www.whowhatwear.com/fashion/luxury/the-row-park-three-tote-bag-kendall-jenner", publisher: "Who What Wear" },
      { url: "https://www.marieclaire.com/fashion/kendall-jenner-coachella-bag-the-row-tote/", publisher: "Marie Claire" },
    ],
    product_image: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=120&h=120&fit=crop",
    article_ref: "Who What Wear", article_url: "https://www.whowhatwear.com/fashion/luxury/the-row-park-three-tote-bag-kendall-jenner",
  },
  {
    id: "trend_5", style_name: "Miu Miu Mini Dress", description: "Miu Miu SS26 Campaign — babydoll mini & crochet knit layering", celebrity: "Olivia Rodrigo", source: "TikTok", source_handle: "@oliviarodrigo", engagement: "1.5M views", change_pct: 260, category: "Dresses",
    tags: ["Miu Miu", "mini dress", "babydoll", "crochet", "Y2K"], detected_at: "2026-03-21",
    image_url: "", fallback_image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&h=520&fit=crop&crop=top",
    articles: [
      { url: "https://www.nylon.com/fashion/olivia-rodrigo-miu-miu-campaign-spring-summer-2026", publisher: "Nylon" },
      { url: "https://www.bustle.com/style/olivia-rodrigo-miu-miu-babydoll-minidress", publisher: "Bustle" },
      { url: "https://www.justjared.com/2026/01/20/olivia-rodrigo-stars-in-new-miu-miu-springsummer-2026-campaign/", publisher: "Just Jared" },
    ],
    product_image: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=120&h=120&fit=crop",
    article_ref: "Nylon", article_url: "https://www.nylon.com/fashion/olivia-rodrigo-miu-miu-campaign-spring-summer-2026",
  },
];

export const MOCK_MATCHED_PRODUCTS: Record<string, MatchedProduct[]> = {
  // ── trend_1: Chunky Sporty Sneaker (Hailey Bieber) ──
  trend_1: [
    { id: "mp1_1", name_ko: "레트로 청키 플랫폼 스니커즈 – 화이트/그린", name_en: "Retro Chunky Platform Sneaker – White/Green", similarity: 94, similarity_detail: { color: 96, silhouette: 93, material: 92 }, source_price_cny: 130, retail_price_usd: 45, margin_pct: 52, supplier_rating: 4.7, review_count: 312, category: "Shoes", matched_tags: ["chunky sole", "retro", "white-green", "platform"], image_url: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=300&h=300&fit=crop&crop=center" },
    { id: "mp1_2", name_ko: "대디슈즈 두꺼운 밑창 러너 – 멀티컬러", name_en: "Dad Shoe Thick Sole Runner – Multi Color", similarity: 89, similarity_detail: { color: 85, silhouette: 92, material: 90 }, source_price_cny: 108, retail_price_usd: 38, margin_pct: 50, supplier_rating: 4.5, review_count: 198, category: "Shoes", matched_tags: ["dad shoe", "thick sole", "sporty", "retro runner"], image_url: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&h=300&fit=crop&crop=center" },
    { id: "mp1_3", name_ko: "에어쿠션 청키 스니커즈 – 베이지/화이트", name_en: "Air Cushion Chunky Sneaker – Beige/White", similarity: 87, similarity_detail: { color: 90, silhouette: 88, material: 83 }, source_price_cny: 145, retail_price_usd: 48, margin_pct: 53, supplier_rating: 4.8, review_count: 267, category: "Shoes", matched_tags: ["air cushion", "chunky", "beige", "casual sporty"], image_url: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=300&h=300&fit=crop&crop=center" },
    { id: "mp1_4", name_ko: "빈티지 러닝 스니커즈 – 그레이/화이트", name_en: "Vintage Running Sneaker – Grey/White", similarity: 85, similarity_detail: { color: 82, silhouette: 90, material: 83 }, source_price_cny: 98, retail_price_usd: 35, margin_pct: 49, supplier_rating: 4.3, review_count: 156, category: "Shoes", matched_tags: ["vintage", "running", "grey", "retro sporty"], image_url: "https://images.unsplash.com/photo-1600269452121-4f2416e55c28?w=300&h=300&fit=crop&crop=center" },
    { id: "mp1_5", name_ko: "오버사이즈 솔 스트릿 스니커즈 – 블랙/화이트", name_en: "Oversized Sole Street Sneaker – Black/White", similarity: 83, similarity_detail: { color: 78, silhouette: 89, material: 82 }, source_price_cny: 115, retail_price_usd: 42, margin_pct: 48, supplier_rating: 4.6, review_count: 223, category: "Shoes", matched_tags: ["oversized sole", "street", "black-white", "chunky"], image_url: "https://images.unsplash.com/photo-1560769629-975ec94e6a86?w=300&h=300&fit=crop&crop=center" },
    { id: "mp1_6", name_ko: "메쉬 통기성 청키 트레이너 – 화이트", name_en: "Mesh Breathable Chunky Trainer – White", similarity: 80, similarity_detail: { color: 88, silhouette: 78, material: 74 }, source_price_cny: 85, retail_price_usd: 30, margin_pct: 51, supplier_rating: 4.4, review_count: 189, category: "Shoes", matched_tags: ["mesh", "breathable", "trainer", "white"], image_url: "https://images.unsplash.com/photo-1491553895911-0055eca6402d?w=300&h=300&fit=crop&crop=center" },
  ],
  // ── trend_2: Sheer Layered Blouse (Bella Hadid) ──
  trend_2: [
    { id: "mp2_1", name_ko: "시어 오간자 레이어드 블라우스 – 화이트", name_en: "Sheer Organza Layered Blouse – White", similarity: 95, similarity_detail: { color: 97, silhouette: 94, material: 93 }, source_price_cny: 58, retail_price_usd: 30, margin_pct: 44, supplier_rating: 4.7, review_count: 176, category: "Tops", matched_tags: ["sheer", "organza", "layered", "white blouse"], image_url: "https://images.unsplash.com/photo-1564584217132-2271feaeb3c5?w=300&h=300&fit=crop&crop=center" },
    { id: "mp2_2", name_ko: "시스루 메쉬 롱슬리브 탑 – 아이보리", name_en: "See-Through Mesh Long Sleeve Top – Ivory", similarity: 90, similarity_detail: { color: 92, silhouette: 88, material: 90 }, source_price_cny: 45, retail_price_usd: 25, margin_pct: 41, supplier_rating: 4.5, review_count: 134, category: "Tops", matched_tags: ["see-through", "mesh", "long sleeve", "ivory"], image_url: "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=300&h=300&fit=crop&crop=center" },
    { id: "mp2_3", name_ko: "쉬폰 러플 시어 블라우스 – 크림", name_en: "Chiffon Ruffle Sheer Blouse – Cream", similarity: 88, similarity_detail: { color: 90, silhouette: 87, material: 86 }, source_price_cny: 62, retail_price_usd: 32, margin_pct: 44, supplier_rating: 4.8, review_count: 201, category: "Tops", matched_tags: ["chiffon", "ruffle", "sheer", "cream"], image_url: "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=300&h=300&fit=crop&crop=center" },
    { id: "mp2_4", name_ko: "레이스 트림 투명 블라우스 – 오프화이트", name_en: "Lace Trim Transparent Blouse – Off White", similarity: 85, similarity_detail: { color: 88, silhouette: 84, material: 83 }, source_price_cny: 70, retail_price_usd: 35, margin_pct: 46, supplier_rating: 4.6, review_count: 156, category: "Tops", matched_tags: ["lace", "transparent", "off-white", "romantic"], image_url: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=300&h=400&fit=crop&crop=top" },
    { id: "mp2_5", name_ko: "플리티드 시어 버튼업 – 화이트/베이지", name_en: "Pleated Sheer Button-Up – White/Beige", similarity: 82, similarity_detail: { color: 86, silhouette: 80, material: 80 }, source_price_cny: 48, retail_price_usd: 26, margin_pct: 40, supplier_rating: 4.4, review_count: 112, category: "Tops", matched_tags: ["pleated", "sheer", "button-up", "minimalist"], image_url: "https://images.unsplash.com/photo-1551488831-00ddcb6c6bd3?w=300&h=300&fit=crop&crop=center" },
    { id: "mp2_6", name_ko: "튤 오버레이 크롭 블라우스 – 화이트", name_en: "Tulle Overlay Crop Blouse – White", similarity: 79, similarity_detail: { color: 85, silhouette: 76, material: 76 }, source_price_cny: 55, retail_price_usd: 28, margin_pct: 43, supplier_rating: 4.3, review_count: 98, category: "Tops", matched_tags: ["tulle", "overlay", "crop", "white"], image_url: "https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=300&h=300&fit=crop&crop=center" },
  ],
  // ── trend_3: Wide Cargo Pants (Rihanna) ──
  trend_3: [
    { id: "mp3_1", name_ko: "와이드 레그 카모 카고 팬츠 – 그린/브라운", name_en: "Wide Leg Camo Cargo Pants – Green/Brown", similarity: 96, similarity_detail: { color: 97, silhouette: 96, material: 94 }, source_price_cny: 85, retail_price_usd: 40, margin_pct: 47, supplier_rating: 4.7, review_count: 356, category: "Bottoms", matched_tags: ["wide leg", "camo", "cargo", "utility"], image_url: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=300&h=300&fit=crop&crop=center" },
    { id: "mp3_2", name_ko: "오버사이즈 포켓 카고 트라우저 – 카키", name_en: "Oversized Pocket Cargo Trousers – Khaki", similarity: 91, similarity_detail: { color: 88, silhouette: 94, material: 91 }, source_price_cny: 72, retail_price_usd: 36, margin_pct: 46, supplier_rating: 4.5, review_count: 223, category: "Bottoms", matched_tags: ["oversized pocket", "cargo", "khaki", "street"], image_url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=300&h=300&fit=crop&crop=center" },
    { id: "mp3_3", name_ko: "파라슈트 와이드 카고 조거 – 아미 그린", name_en: "Parachute Wide Cargo Jogger – Army Green", similarity: 88, similarity_detail: { color: 90, silhouette: 87, material: 86 }, source_price_cny: 78, retail_price_usd: 38, margin_pct: 45, supplier_rating: 4.6, review_count: 187, category: "Bottoms", matched_tags: ["parachute", "wide", "jogger", "army green"], image_url: "https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=300&h=300&fit=crop&crop=center" },
    { id: "mp3_4", name_ko: "배기 유틸리티 멀티포켓 팬츠 – 올리브", name_en: "Baggy Utility Pants Multi-Pocket – Olive", similarity: 85, similarity_detail: { color: 83, silhouette: 88, material: 84 }, source_price_cny: 92, retail_price_usd: 42, margin_pct: 48, supplier_rating: 4.4, review_count: 145, category: "Bottoms", matched_tags: ["baggy", "utility", "multi-pocket", "olive"], image_url: "https://images.unsplash.com/photo-1517438476312-10d79c077509?w=300&h=300&fit=crop&crop=center" },
    { id: "mp3_5", name_ko: "드로스트링 카고 와이드 팬츠 – 블랙/카모", name_en: "Drawstring Cargo Wide Pants – Black/Camo", similarity: 82, similarity_detail: { color: 80, silhouette: 85, material: 81 }, source_price_cny: 65, retail_price_usd: 32, margin_pct: 44, supplier_rating: 4.3, review_count: 112, category: "Bottoms", matched_tags: ["drawstring", "cargo", "wide", "black camo"], image_url: "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=300&h=300&fit=crop&crop=center" },
    { id: "mp3_6", name_ko: "립스탑 릴렉스드 카고 – 데저트 탄", name_en: "Ripstop Relaxed Cargo – Desert Tan", similarity: 79, similarity_detail: { color: 76, silhouette: 83, material: 78 }, source_price_cny: 98, retail_price_usd: 45, margin_pct: 48, supplier_rating: 4.5, review_count: 98, category: "Bottoms", matched_tags: ["ripstop", "relaxed", "cargo", "desert tan"], image_url: "https://images.unsplash.com/photo-1506629082955-511b1aa562c8?w=300&h=300&fit=crop&crop=center" },
  ],
  // ── trend_4: Oversized Leather Tote (Kendall Jenner) ──
  trend_4: [
    { id: "mp4_1", name_ko: "대형 소프트 레더 토트백 – 다크 올리브", name_en: "Large Soft Leather Tote Bag – Dark Olive", similarity: 95, similarity_detail: { color: 96, silhouette: 95, material: 93 }, source_price_cny: 158, retail_price_usd: 68, margin_pct: 50, supplier_rating: 4.8, review_count: 201, category: "Accessories", matched_tags: ["leather", "oversized", "olive", "quiet luxury"], image_url: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=300&h=300&fit=crop&crop=center" },
    { id: "mp4_2", name_ko: "오버사이즈 쇼퍼 토트 – 블랙 레더", name_en: "Oversized Shopper Tote – Black Leather", similarity: 90, similarity_detail: { color: 82, silhouette: 94, material: 93 }, source_price_cny: 128, retail_price_usd: 58, margin_pct: 48, supplier_rating: 4.6, review_count: 178, category: "Accessories", matched_tags: ["oversized", "shopper", "black leather", "minimalist"], image_url: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=300&h=300&fit=crop&crop=center" },
    { id: "mp4_3", name_ko: "제뉴인 레더 마켓 토트 – 브라운", name_en: "Genuine Leather Market Tote – Brown", similarity: 87, similarity_detail: { color: 84, silhouette: 90, material: 88 }, source_price_cny: 175, retail_price_usd: 72, margin_pct: 51, supplier_rating: 4.9, review_count: 145, category: "Accessories", matched_tags: ["genuine leather", "market tote", "brown", "artisan"], image_url: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=300&h=300&fit=crop&crop=center" },
    { id: "mp4_4", name_ko: "슬라우치 오버사이즈 토트 – 토프", name_en: "Slouchy Oversized Tote – Taupe", similarity: 84, similarity_detail: { color: 86, silhouette: 83, material: 82 }, source_price_cny: 105, retail_price_usd: 48, margin_pct: 47, supplier_rating: 4.5, review_count: 123, category: "Accessories", matched_tags: ["slouchy", "oversized", "taupe", "casual luxury"], image_url: "https://images.unsplash.com/photo-1591561954557-26941169b49e?w=300&h=300&fit=crop&crop=center" },
    { id: "mp4_5", name_ko: "스트럭처드 레더 캐리올 – 포레스트 그린", name_en: "Structured Leather Carryall – Forest Green", similarity: 81, similarity_detail: { color: 88, silhouette: 78, material: 77 }, source_price_cny: 140, retail_price_usd: 62, margin_pct: 49, supplier_rating: 4.4, review_count: 98, category: "Accessories", matched_tags: ["structured", "carryall", "forest green", "leather"], image_url: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=300&h=300&fit=crop&crop=center" },
    { id: "mp4_6", name_ko: "미니멀 레더 버킷 토트 – 크림", name_en: "Minimalist Leather Bucket Tote – Cream", similarity: 78, similarity_detail: { color: 74, silhouette: 80, material: 80 }, source_price_cny: 115, retail_price_usd: 52, margin_pct: 48, supplier_rating: 4.3, review_count: 87, category: "Accessories", matched_tags: ["minimalist", "bucket", "cream", "clean design"], image_url: "https://images.unsplash.com/photo-1614179689702-355944cd0918?w=300&h=300&fit=crop&crop=center" },
  ],
  // ── trend_5: Miu Miu Mini Dress (Olivia Rodrigo) ──
  trend_5: [
    { id: "mp5_1", name_ko: "베이비돌 크로셰 미니 드레스 – 핑크", name_en: "Babydoll Crochet Mini Dress – Pink", similarity: 93, similarity_detail: { color: 91, silhouette: 95, material: 92 }, source_price_cny: 85, retail_price_usd: 42, margin_pct: 46, supplier_rating: 4.7, review_count: 178, category: "Dresses", matched_tags: ["babydoll", "crochet", "mini", "pink"], image_url: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=300&h=300&fit=crop&crop=top" },
    { id: "mp5_2", name_ko: "니트 A라인 미니 드레스 – 크림/파스텔", name_en: "Knit A-Line Mini Dress – Cream/Pastel", similarity: 89, similarity_detail: { color: 88, silhouette: 91, material: 87 }, source_price_cny: 72, retail_price_usd: 38, margin_pct: 43, supplier_rating: 4.5, review_count: 145, category: "Dresses", matched_tags: ["knit", "A-line", "mini", "pastel"], image_url: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=300&h=300&fit=crop&crop=center" },
    { id: "mp5_3", name_ko: "크로셰 트림 민소매 미니 – 화이트", name_en: "Crochet Trim Sleeveless Mini – White", similarity: 86, similarity_detail: { color: 84, silhouette: 88, material: 85 }, source_price_cny: 62, retail_price_usd: 32, margin_pct: 44, supplier_rating: 4.6, review_count: 134, category: "Dresses", matched_tags: ["crochet trim", "sleeveless", "mini", "white"], image_url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=300&h=400&fit=crop&crop=top" },
    { id: "mp5_4", name_ko: "퍼프슬리브 베이비돌 드레스 – 라벤더", name_en: "Puff Sleeve Babydoll Dress – Lavender", similarity: 84, similarity_detail: { color: 80, silhouette: 87, material: 84 }, source_price_cny: 78, retail_price_usd: 40, margin_pct: 45, supplier_rating: 4.8, review_count: 112, category: "Dresses", matched_tags: ["puff sleeve", "babydoll", "lavender", "Y2K"], image_url: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=300&h=400&fit=crop&crop=top" },
    { id: "mp5_5", name_ko: "레트로 Y2K 미니 슬립 드레스 – 베이비 블루", name_en: "Retro Y2K Mini Slip Dress – Baby Blue", similarity: 81, similarity_detail: { color: 78, silhouette: 84, material: 80 }, source_price_cny: 55, retail_price_usd: 28, margin_pct: 43, supplier_rating: 4.4, review_count: 98, category: "Dresses", matched_tags: ["Y2K", "slip dress", "baby blue", "retro"], image_url: "https://images.unsplash.com/photo-1612336307429-8a898d10e223?w=300&h=300&fit=crop&crop=center" },
    { id: "mp5_6", name_ko: "플로럴 크로셰 오버레이 미니 – 멀티", name_en: "Floral Crochet Overlay Mini – Multi", similarity: 78, similarity_detail: { color: 75, silhouette: 80, material: 79 }, source_price_cny: 92, retail_price_usd: 45, margin_pct: 46, supplier_rating: 4.5, review_count: 87, category: "Dresses", matched_tags: ["floral", "crochet overlay", "multi-color", "boho mini"], image_url: "https://images.unsplash.com/photo-1550639525-c97d455acf70?w=300&h=300&fit=crop&crop=center" },
  ],
};
