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

/** Row returned by match_sourceable_products RPC */
interface MatchRow {
  id: string;
  product_name: string;
  factory_name: string;
  factory_id: string;
  image_url: string | null;
  price: number | null;
  stock_quantity: number | null;
  category: string | null;
  fg_category: string | null;
  similarity: number;
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
      trend_item_id,
      match_count = 20,
      match_threshold = 0.3,
    } = body as {
      trend_item_id?: string;
      match_count?: number;
      match_threshold?: number;
    };

    if (!trend_item_id) {
      return jsonResponse({ error: "trend_item_id가 필요합니다" }, 400);
    }

    // ── 1. 트렌드 row 조회 ────────────────────────────────────
    const { data: trendRow, error: trendErr } = await supabase
      .from("trend_analyses")
      .select(
        "id, embedding, trend_keywords, source_data"
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
    const { data: matches, error: rpcErr } = await supabase.rpc(
      "match_sourceable_products",
      {
        query_embedding: JSON.stringify(embedding),
        match_threshold,
        match_count,
      }
    );

    if (rpcErr) {
      throw new Error(`match_sourceable_products RPC 오류: ${rpcErr.message}`);
    }

    const matchRows = (matches ?? []) as MatchRow[];

    // ── 4. 응답 조립 ──────────────────────────────────────────

    return jsonResponse({
      trend: {
        id: trend.id,
        title: sd.trend_name || trend.trend_keywords.slice(0, 3).join(", ") || "",
        image_url: sd.image_url ?? null,
        ai_keywords: trend.ai_keywords ?? [],
        trend_score: trend.trend_score ?? 0,
      },
      matches: matchRows.map((m) => ({
        id: m.id,
        product_name: m.product_name,
        factory_name: m.factory_name,
        factory_id: m.factory_id,
        image_url: m.image_url,
        price: m.price,
        stock_quantity: m.stock_quantity,   // NULL — 현재 스키마에 없음
        category: m.category ?? m.fg_category,
        fg_category: m.fg_category,
        similarity: Math.round(m.similarity * 10000) / 10000,  // 소수점 4자리
      })),
      total_matches: matchRows.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("match-trend-to-products error:", message);
    return jsonResponse({ error: message }, 500);
  }
});
