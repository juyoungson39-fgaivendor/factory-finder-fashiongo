import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// FashionGo 카테고리 & 트렌드 데이터 (Mock용)
// ─────────────────────────────────────────────────────────────
const FG_CATEGORIES = [
  "Dresses",
  "Tops",
  "Bottoms",
  "Outerwear",
  "Accessories",
  "Shoes",
  "Swimwear",
  "Activewear",
  "Loungewear",
  "Denim",
];

/** 카테고리별 시즌 키워드 */
const FG_TREND_DATA: Record<string, {
  keywords: string[];
  styles: string[];
  imageKeyword: string;
  baseScore: number;
}> = {
  Dresses: {
    keywords: ["floral midi dress", "off-shoulder dress", "wrap dress", "bodycon dress", "maxi dress"],
    styles: ["Floral Print", "Off-Shoulder", "Wrap Style", "Bodycon", "Flowy Maxi"],
    imageKeyword: "summer dress fashion",
    baseScore: 82,
  },
  Tops: {
    keywords: ["crop top", "oversized tee", "linen blouse", "corset top", "halter top"],
    styles: ["Crop Silhouette", "Oversized Fit", "Linen Fabric", "Corset Detail", "Halter Neck"],
    imageKeyword: "fashion top women",
    baseScore: 76,
  },
  Bottoms: {
    keywords: ["wide leg pants", "cargo pants", "mini skirt", "pleated trousers", "barrel jeans"],
    styles: ["Wide Leg", "Cargo Pocket", "Mini Length", "Pleated", "Barrel Fit"],
    imageKeyword: "fashion bottoms women",
    baseScore: 74,
  },
  Outerwear: {
    keywords: ["oversized blazer", "trench coat", "leather jacket", "moto jacket", "bomber jacket"],
    styles: ["Oversized Blazer", "Classic Trench", "Faux Leather", "Moto Style", "Bomber"],
    imageKeyword: "women jacket outerwear fashion",
    baseScore: 68,
  },
  Accessories: {
    keywords: ["tote bag", "mini crossbody", "chunky jewelry", "bucket hat", "square sunglasses"],
    styles: ["Tote Style", "Crossbody", "Chunky Chain", "Bucket", "Square Frame"],
    imageKeyword: "fashion accessories women",
    baseScore: 71,
  },
  Shoes: {
    keywords: ["platform sandals", "mule slides", "chunky sneakers", "kitten heels", "ankle boots"],
    styles: ["Platform Sole", "Mule Style", "Chunky Sole", "Kitten Heel", "Ankle Height"],
    imageKeyword: "women shoes fashion",
    baseScore: 69,
  },
  Swimwear: {
    keywords: ["one piece swimsuit", "string bikini", "high waist bikini", "cover-up", "resort wear"],
    styles: ["One-Piece", "String Tie", "High Waist", "Cover-Up", "Resort"],
    imageKeyword: "swimwear fashion",
    baseScore: 65,
  },
  Activewear: {
    keywords: ["leggings set", "sports bra", "yoga pants", "running shorts", "athletic set"],
    styles: ["Matching Set", "Sports Bra", "High Waist Yoga", "Running Shorts", "2-Piece"],
    imageKeyword: "activewear workout fashion",
    baseScore: 72,
  },
  Loungewear: {
    keywords: ["cozy set", "ribbed lounge set", "satin pajamas", "knit cardigan", "comfy co-ord"],
    styles: ["Matching Set", "Ribbed Knit", "Satin", "Cozy Cardigan", "Co-Ord"],
    imageKeyword: "loungewear cozy fashion",
    baseScore: 63,
  },
  Denim: {
    keywords: ["straight leg jeans", "baggy denim", "denim jacket", "flare jeans", "denim skirt"],
    styles: ["Straight Leg", "Baggy Fit", "Denim Jacket", "Flare", "Denim Skirt"],
    imageKeyword: "denim fashion women",
    baseScore: 78,
  },
};

/** 실제 FashionGo 이미지 플레이스홀더 (Unsplash 패션 이미지) */
const FASHION_IMAGE_URLS: Record<string, string> = {
  Dresses:    "https://images.unsplash.com/photo-1566479179817-c0df03b88a28?w=400&h=533&fit=crop",
  Tops:       "https://images.unsplash.com/photo-1594938298603-c8148c4b0d15?w=400&h=533&fit=crop",
  Bottoms:    "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&h=533&fit=crop",
  Outerwear:  "https://images.unsplash.com/photo-1551537482-f2075a1d41f2?w=400&h=533&fit=crop",
  Accessories:"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=400&h=533&fit=crop",
  Shoes:      "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&h=533&fit=crop",
  Swimwear:   "https://images.unsplash.com/photo-1570976447640-ac859083963f?w=400&h=533&fit=crop",
  Activewear: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400&h=533&fit=crop",
  Loungewear: "https://images.unsplash.com/photo-1604176354204-9268737828e4?w=400&h=533&fit=crop",
  Denim:      "https://images.unsplash.com/photo-1602293589930-45aad59ba3ab?w=400&h=533&fit=crop",
};

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface BuyerSignalRow {
  user_id: string;
  signal_type: "view" | "click" | "wishlist" | "order" | "search";
  product_category: string;
  keyword: string;
  count: number;
  signal_date: string;
  source_data: Record<string, unknown>;
}

interface TrendInsert {
  user_id: string;
  trend_keywords: string[];
  trend_categories: string[];
  status: string;
  source_data: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 파레토 분포 난수 (상위 20% 트렌드에 트래픽 집중) */
function paretoRandom(min: number, max: number): number {
  const u = Math.random();
  // 간단한 근사: 지수 분포로 파레토 흉내
  const raw = min + (max - min) * (1 - Math.pow(u, 1.5));
  return Math.round(raw);
}

/** 날짜 오프셋 ISO 문자열 */
function dateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

/** 중복 체크용 키 */
function signalKey(category: string, keyword: string, date: string): string {
  return `${category}:${keyword}:${date}`;
}

// ─────────────────────────────────────────────────────────────
// Mock Signal Generator
// ─────────────────────────────────────────────────────────────
function generateMockSignals(userId: string, limit: number): BuyerSignalRow[] {
  const rows: BuyerSignalRow[] = [];
  const now = new Date();
  const month = now.getMonth(); // 0-11

  // 계절 가중치 (봄3~5, 여름6~8, 가을9~11, 겨울12~2)
  const seasonBoost: Record<string, number> = {};
  if (month >= 2 && month <= 4) {
    // 봄: Dresses, Tops, Accessories 인기
    seasonBoost["Dresses"] = 1.4;
    seasonBoost["Tops"] = 1.3;
    seasonBoost["Accessories"] = 1.2;
  } else if (month >= 5 && month <= 7) {
    // 여름: Swimwear, Dresses, Activewear 인기
    seasonBoost["Swimwear"] = 1.6;
    seasonBoost["Dresses"] = 1.3;
    seasonBoost["Activewear"] = 1.2;
  } else if (month >= 8 && month <= 10) {
    // 가을: Outerwear, Denim, Bottoms 인기
    seasonBoost["Outerwear"] = 1.5;
    seasonBoost["Denim"] = 1.3;
    seasonBoost["Bottoms"] = 1.2;
  } else {
    // 겨울: Outerwear, Loungewear 인기
    seasonBoost["Outerwear"] = 1.6;
    seasonBoost["Loungewear"] = 1.4;
  }

  let generated = 0;

  for (const category of FG_CATEGORIES) {
    if (generated >= limit) break;
    const trendData = FG_TREND_DATA[category];
    const boost = seasonBoost[category] ?? 1.0;

    for (let kwIdx = 0; kwIdx < trendData.keywords.length; kwIdx++) {
      if (generated >= limit) break;
      const keyword = trendData.keywords[kwIdx];

      // 키워드별로 최근 7일 신호 생성 (파레토: 첫 번째 키워드가 가장 인기)
      const kwBoost = 1.0 / (kwIdx + 1) * 2; // 1.0, 0.67, 0.5, 0.4, 0.33

      for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
        const signalDate = dateOffset(daysAgo);
        // 최신 데이터일수록 더 많은 신호 (당일 > 1일전 > ...)
        const recencyBoost = 1.0 + (6 - daysAgo) * 0.1;

        // VIEW
        rows.push({
          user_id: userId,
          signal_type: "view",
          product_category: category,
          keyword,
          count: paretoRandom(
            Math.round(200 * boost * kwBoost * recencyBoost),
            Math.round(2000 * boost * kwBoost * recencyBoost)
          ),
          signal_date: signalDate,
          source_data: { mock: true, season_boost: boost },
        });

        // CLICK (view의 약 8~15%)
        rows.push({
          user_id: userId,
          signal_type: "click",
          product_category: category,
          keyword,
          count: paretoRandom(
            Math.round(20 * boost * kwBoost * recencyBoost),
            Math.round(250 * boost * kwBoost * recencyBoost)
          ),
          signal_date: signalDate,
          source_data: { mock: true },
        });

        // WISHLIST (click의 약 10~25%)
        rows.push({
          user_id: userId,
          signal_type: "wishlist",
          product_category: category,
          keyword,
          count: paretoRandom(
            Math.round(5 * boost * kwBoost * recencyBoost),
            Math.round(60 * boost * kwBoost * recencyBoost)
          ),
          signal_date: signalDate,
          source_data: { mock: true },
        });
      }

      // SEARCH (전체 주 단위)
      rows.push({
        user_id: userId,
        signal_type: "search",
        product_category: category,
        keyword,
        count: paretoRandom(
          Math.round(50 * boost * kwBoost),
          Math.round(500 * boost * kwBoost)
        ),
        signal_date: dateOffset(0),
        source_data: { mock: true },
      });

      generated++;
    }
  }

  return rows;
}

// ─────────────────────────────────────────────────────────────
// Convert signals → trend_analyses rows
// ─────────────────────────────────────────────────────────────
function buildTrendInserts(
  userId: string,
  signals: BuyerSignalRow[],
  existingKeys: Set<string>
): TrendInsert[] {
  // 카테고리+키워드별 뷰/클릭/위시리스트 집계
  const aggMap = new Map<
    string,
    {
      category: string;
      keyword: string;
      view_count: number;
      click_count: number;
      wishlist_count: number;
      search_count: number;
    }
  >();

  for (const s of signals) {
    const key = `${s.product_category}:${s.keyword}`;
    const agg = aggMap.get(key) ?? {
      category: s.product_category,
      keyword: s.keyword,
      view_count: 0,
      click_count: 0,
      wishlist_count: 0,
      search_count: 0,
    };
    if (s.signal_type === "view")     agg.view_count     += s.count;
    if (s.signal_type === "click")    agg.click_count    += s.count;
    if (s.signal_type === "wishlist") agg.wishlist_count += s.count;
    if (s.signal_type === "search")   agg.search_count   += s.count;
    aggMap.set(key, agg);
  }

  const inserts: TrendInsert[] = [];

  for (const [key, agg] of aggMap.entries()) {
    if (existingKeys.has(key)) continue;

    const trendData = FG_TREND_DATA[agg.category];
    if (!trendData) continue;

    // 시그널 강도 점수 (0~100): 클릭율 × 위시리스트율 × 검색량 가중합
    const totalInteractions = agg.view_count + agg.click_count * 3 + agg.wishlist_count * 7 + agg.search_count * 2;
    const maxExpected = 10000 * 4; // rough normalization ceiling
    const rawScore = Math.min(100, Math.round((totalInteractions / maxExpected) * 100 * 3));
    const trendScore = Math.max(20, Math.min(100, rawScore + trendData.baseScore)) / 2;

    // 해당 키워드의 인덱스로 스타일 매핑
    const kwIdx = trendData.keywords.indexOf(agg.keyword);
    const styleName = trendData.styles[kwIdx >= 0 ? kwIdx : 0];

    inserts.push({
      user_id: userId,
      trend_keywords: [agg.keyword, ...trendData.keywords.filter((k) => k !== agg.keyword).slice(0, 2)],
      trend_categories: [agg.category],
      status: "analyzed",
      source_data: {
        platform: "fashiongo",
        trend_name: `${styleName} — ${agg.category}`,
        image_url: FASHION_IMAGE_URLS[agg.category] ?? "",
        // FashionGo 전용 바이어 시그널 지표
        fg_view_count:     agg.view_count,
        fg_click_count:    agg.click_count,
        fg_wishlist_count: agg.wishlist_count,
        fg_search_count:   agg.search_count,
        signal_strength:   Math.round(trendScore),
        buyer_segment:     "US Wholesale Boutique",
        category:          agg.category,
        keyword:           agg.keyword,
        style_name:        styleName,
        // AI 분석 결과 (mock)
        ai_analyzed:       true,
        trend_score:       Math.round(trendScore),
        summary_ko:        `FashionGo 바이어 데이터 기반 ${agg.category} 트렌드. ${agg.view_count.toLocaleString()}회 조회, ${agg.wishlist_count.toLocaleString()}개 위시리스트 추가.`,
        ai_keywords: [
          { keyword: agg.keyword, type: "product_style" },
          { keyword: agg.category.toLowerCase(), type: "category" },
          { keyword: "fashiongo_trending", type: "platform_signal" },
        ],
        trending_styles:   [styleName],
        collected_at:      new Date().toISOString(),
        mock_mode:         true,
      },
    });
  }

  return inserts;
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "POST만 지원합니다" }, 405);
  }

  try {
    const SUPABASE_URL    = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    // 향후 실제 FashionGo API 연동 시 사용
    const FG_API_KEY      = Deno.env.get("FASHIONGO_API_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const {
      user_id,
      limit = 20,
      mode = FG_API_KEY ? "api" : "mock",
    } = body as {
      user_id?: string;
      limit?: number;
      mode?: "mock" | "api";
    };

    if (!user_id) {
      return jsonResponse({ error: "user_id가 필요합니다" }, 400);
    }

    const isMock = mode === "mock" || !FG_API_KEY;

    console.log(`[collect-fg-buyer-signals] start — user=${user_id}, mode=${isMock ? "mock" : "api"}, limit=${limit}`);

    // ── 기존 FashionGo 트렌드 중복 방지용 키 ─────────────────
    const { data: existing } = await supabase
      .from("trend_analyses")
      .select("source_data")
      .eq("user_id", user_id)
      .eq("source_data->>platform", "fashiongo")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    const existingKeys = new Set<string>();
    for (const row of existing ?? []) {
      const sd = row.source_data as Record<string, string> | null;
      if (sd?.category && sd?.keyword) {
        existingKeys.add(`${sd.category}:${sd.keyword}`);
      }
    }

    let savedSignalCount = 0;
    let savedTrendCount  = 0;

    if (isMock) {
      // ── Mock 모드 ─────────────────────────────────────────
      const mockSignals = generateMockSignals(user_id, limit);

      // fg_buyer_signals에 upsert (signal_date 기준 중복 스킵)
      const { count: signalCount, error: sigErr } = await supabase
        .from("fg_buyer_signals")
        .upsert(mockSignals, {
          onConflict: "user_id,signal_type,product_category,keyword,signal_date",
          ignoreDuplicates: true,
          count: "exact",
        });

      if (sigErr) {
        console.warn("fg_buyer_signals upsert 경고:", sigErr.message);
      }
      savedSignalCount = signalCount ?? mockSignals.length;

      // trend_analyses에 변환 삽입
      const trendInserts = buildTrendInserts(user_id, mockSignals, existingKeys);

      if (trendInserts.length > 0) {
        const { data: inserted, error: trendErr } = await supabase
          .from("trend_analyses")
          .insert(trendInserts)
          .select("id");

        if (trendErr) {
          console.warn("trend_analyses 삽입 경고:", trendErr.message);
        }
        savedTrendCount = inserted?.length ?? 0;
      }

    } else {
      // ── API 모드 (향후 구현) ──────────────────────────────
      // TODO: FashionGo API 연동
      // const apiData = await fetchFashionGoAPI(FG_API_KEY!, { limit });
      // ... transform and insert ...
      console.log("[collect-fg-buyer-signals] API mode: FG_API_KEY present but integration not yet implemented");
      return jsonResponse({
        success: true,
        saved: 0,
        mock_mode: false,
        message: "FashionGo API 모드는 아직 구현 중입니다.",
      });
    }

    console.log(`[collect-fg-buyer-signals] done — signals: ${savedSignalCount}, trends: ${savedTrendCount}`);

    return jsonResponse({
      success: true,
      saved: savedTrendCount,          // batch-pipeline이 'saved' 키를 읽음
      signal_rows: savedSignalCount,
      trend_rows: savedTrendCount,
      mock_mode: isMock,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("collect-fg-buyer-signals error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
