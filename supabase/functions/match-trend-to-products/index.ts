import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants & types
// ─────────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TrendRow {
  id: string;
  embedding: number[] | string | null;
  trend_keywords: string[];
  ai_keywords: Array<{ keyword: string; type: string }> | null;
  trend_score: number | null;
  source_data: {
    trend_name?: string;
    image_url?: string;
    platform?: string;
    caption?: string;
  } | null;
}

/** Row returned by match_sourceable_products RPC (schema v2: migration 20260416030206) */
interface MatchRow {
  id: string;
  item_name: string | null;
  item_name_en: string | null;
  vendor_name: string | null;
  factory_id: string;
  image_url: string | null;
  unit_price: number | null;
  unit_price_usd: number | null;
  category: string | null;
  similarity: number;
}

/** Expanded product detail from sourceable_products + factories join */
interface ProductDetail {
  id: string;
  image_url: string | null;
  item_name: string | null;
  item_name_en: string | null;
  category: string | null;
  fg_category: string | null;
  unit_price: number | null;
  unit_price_usd: number | null;
  source_url: string | null;
  purchase_link: string | null;
  factories: {
    id: string;
    name: string;
    country: string | null;
    city: string | null;
    moq: string | null;
  } | null;
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

/**
 * Supabase stores vector columns as a string like "[0.1,0.2,...]"
 * or as a plain JS array depending on the client version.
 * Normalise both.
 */
function parseEmbedding(raw: number[] | string | null): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through
    }
  }
  return null;
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
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const {
      trend_item_id: bodyTrendItemId,
      trend_id,                        // alias (수정 1)
      match_count = 20,
      max_results,                     // alias (수정 1)
      match_threshold = 0.3,
      threshold,                       // alias (수정 1)
    } = body as {
      trend_item_id?: string;
      trend_id?: string;
      match_count?: number;
      max_results?: number;
      match_threshold?: number;
      threshold?: number;
    };
    const trend_item_id = bodyTrendItemId ?? trend_id;
    const effectiveMatchCount = max_results ?? match_count;
    const effectiveThreshold = threshold ?? match_threshold;

    if (!trend_item_id) {
      return jsonResponse({ error: "trend_item_id 또는 trend_id가 필요합니다" }, 400);
    }

    // ── 1. 트렌드 row 조회 ────────────────────────────────────
    const { data: trendRow, error: trendErr } = await supabase
      .from("trend_analyses")
      .select(
        "id, embedding, image_embedding, trend_keywords, source_data"
      )
      .eq("id", trend_item_id)
      .single();

    if (trendErr || !trendRow) {
      console.error("trend lookup error:", trendErr?.message, "id:", trend_item_id);
      return jsonResponse(
        { error: `trend_item_id를 찾을 수 없습니다: ${trend_item_id}` },
        404
      );
    }

    const sd = (trendRow.source_data ?? {}) as Record<string, any>;
    const trend = {
      ...trendRow,
      ai_keywords: sd.ai_keywords ?? [],
      trend_score: sd.trend_score ?? null,
    } as TrendRow;

    // ── 2. embedding NULL 체크 — 없으면 즉석 생성 ─────────────
    let embedding = parseEmbedding(trend.embedding);
    if (!embedding || embedding.length === 0) {
      console.log(`embedding 없음 — 즉석 생성 시도: ${trend_item_id}`);

      // Build text from available trend fields
      const textParts = [
        (trend.trend_keywords ?? []).join(" "),
        sd.trend_name,
        sd.title,
        sd.summary_ko,
        sd.caption,
      ].filter(Boolean);
      const inlineText = textParts.join(" ").trim();
      const inlineImage = sd.image_url ?? null;

      if (!inlineText && !inlineImage) {
        return jsonResponse(
          { error: "트렌드에 텍스트/이미지가 없어 embedding을 생성할 수 없습니다", trend_item_id },
          422
        );
      }

      const { data: genData, error: genErr } = await supabase.functions.invoke(
        "generate-embedding",
        {
          body: {
            table: "trend_analyses",
            id: trend_item_id,
            text: inlineText || undefined,
            image_url: inlineImage || undefined,
          },
        }
      );

      if (genErr) {
        console.error("on-the-fly generate-embedding 실패:", genErr.message);
        return jsonResponse(
          { error: `embedding 생성 실패: ${genErr.message}`, trend_item_id },
          500
        );
      }
      console.log("on-the-fly generate-embedding 성공:", genData);

      // Re-fetch the embedding
      const { data: refetched } = await supabase
        .from("trend_analyses")
        .select("embedding")
        .eq("id", trend_item_id)
        .single();

      embedding = parseEmbedding(refetched?.embedding ?? null);
      if (!embedding || embedding.length === 0) {
        return jsonResponse(
          { error: "embedding 생성 후에도 조회 실패", trend_item_id },
          500
        );
      }
    }

    // ── 3. RPC: match_sourceable_products 호출 ────────────────
    // ── 3. RPC: hybrid match ──────────────────────────────────
    const trendImageEmb = parseEmbedding((trendRow as any).image_embedding ?? null);
    const hasTrendImg = !!trendImageEmb && trendImageEmb.length > 0;

    // Build attribute keywords from trend (keywords + ai_keywords)
    const aiKwArr: string[] = Array.isArray(trend.ai_keywords)
      ? (trend.ai_keywords as any[]).map((k) =>
          typeof k === "string" ? k : (k?.keyword ?? "")
        ).filter(Boolean)
      : [];
    const queryAttributeKeywords = Array.from(new Set(
      [...(trend.trend_keywords ?? []), ...aiKwArr]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase().trim())
        .filter((s) => s.length > 0)
    ));

    const W_TEXT = 0.4, W_IMAGE = 0.4, W_ATTR = 0.2;
    const { data: matches, error: rpcErr } = await supabase.rpc(
      "match_sourceable_products_hybrid",
      {
        query_text_embedding: JSON.stringify(embedding),
        query_image_embedding: hasTrendImg ? JSON.stringify(trendImageEmb) : null,
        match_threshold: effectiveThreshold,
        max_results: effectiveMatchCount,
        w_text: W_TEXT,
        w_image: W_IMAGE,
        w_attr: W_ATTR,
        query_attribute_keywords: queryAttributeKeywords.length > 0 ? queryAttributeKeywords : null,
      }
    );

    if (rpcErr) {
      throw new Error(`match_sourceable_products_hybrid RPC 오류: ${rpcErr.message}`);
    }

    type HybridRow = {
      id: string; item_name: string | null; item_name_en: string | null;
      vendor_name: string | null; category: string | null; image_url: string | null;
      unit_price: number | null; unit_price_usd: number | null; factory_id: string;
      text_sim: number | null; image_sim: number | null; final_score: number;
      used_signals: string[];
    };
    const matchRows = (matches ?? []) as HybridRow[];

    const candidates_passed = matchRows.length;
    const max_score_seen = matchRows.reduce((m, r) => Math.max(m, r.final_score ?? 0), 0);
    const has_image_matching = hasTrendImg && matchRows.some(r => r.image_sim != null);
    let reason: string = "ok";
    if (!hasTrendImg) reason = "trend_no_image_emb";
    else if (candidates_passed === 0) reason = "no_pass_threshold";

    // ── 4. 확장 상품 정보 조회 ───────────────────────────────
    const matchIds = matchRows.map((m) => m.id);
    const productDetailsMap = new Map<string, ProductDetail>();

    if (matchIds.length > 0) {
      const { data: productDetails, error: pdErr } = await supabase
        .from("sourceable_products")
        .select(
          "id, image_url, item_name, item_name_en, category, fg_category, unit_price, unit_price_usd, source_url, purchase_link, factories(id, name, country, city, moq)"
        )
        .in("id", matchIds);

      if (pdErr) {
        console.warn("sourceable_products 2차 조회 실패 (non-fatal):", pdErr.message);
      } else if (productDetails) {
        for (const pd of productDetails) {
          productDetailsMap.set(pd.id, pd as unknown as ProductDetail);
        }
      }
    }

    const productList = matchRows.map((m) => {
      const pd = productDetailsMap.get(m.id);
      const itemName = m.item_name ?? pd?.item_name ?? null;
      const itemNameEn = m.item_name_en ?? pd?.item_name_en ?? null;
      const factoryName = m.vendor_name ?? pd?.factories?.name ?? "";
      const round4 = (n: number | null) => n == null ? null : Math.round(n * 10000) / 10000;
      const textSim = round4(m.text_sim);
      const imgSim = round4(m.image_sim);
      const finalScore = round4(m.final_score);
      return {
        id: m.id,
        product_name: itemName ?? "",
        item_name: itemName,
        item_name_en: itemNameEn,
        factory_name: factoryName,
        factory_id: m.factory_id,
        image_url: pd?.image_url ?? m.image_url,
        price: pd?.unit_price ?? m.unit_price ?? null,
        unit_price_usd: pd?.unit_price_usd ?? m.unit_price_usd ?? null,
        stock_quantity: null,
        category: pd?.category ?? m.category ?? null,
        fg_category: pd?.fg_category ?? null,
        source_url: pd?.source_url ?? null,
        purchase_link: pd?.purchase_link ?? null,
        similarity: finalScore,
        combined_score: finalScore,
        text_similarity: textSim,
        image_similarity: imgSim,
        text_sim: textSim,
        image_sim: imgSim,
        final_score: finalScore,
        used_signals: m.used_signals ?? [],
        trend_decay: 1.0,
        factories: pd?.factories ?? null,
      };
    });

    return jsonResponse({
      trend: {
        id: trend.id,
        title: sd.trend_name || trend.trend_keywords.slice(0, 3).join(", ") || "",
        image_url: sd.image_url ?? null,
        ai_keywords: trend.ai_keywords ?? [],
        trend_score: trend.trend_score ?? 0,
      },
      products: productList,
      matches: productList,
      has_image_matching,
      total_matches: productList.length,
      debug: {
        reason,
        candidates_passed,
        max_score_seen: Math.round(max_score_seen * 10000) / 10000,
        applied_threshold: effectiveThreshold,
        trend_has_image_emb: hasTrendImg,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("match-trend-to-products error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
