import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TEXT_EMBEDDING_MODEL = "gemini-embedding-001"; // 768-dim

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function embedText(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${TEXT_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${TEXT_EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Text embedding failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.embedding.values as number[];
}

function normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
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
    // ── Env vars ─────────────────────────────────────────────
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    if (!SUPABASE_URL || !SERVICE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Request body ─────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { keyword, match_threshold = 0.25, match_count = 20 } = body as {
      keyword?: string;
      match_threshold?: number;
      match_count?: number;
    };

    if (!keyword || typeof keyword !== "string" || keyword.trim() === "") {
      return jsonResponse({ error: "keyword 파라미터가 필요합니다" }, 400);
    }

    const kwTrimmed = keyword.trim();
    console.log(`[match-keyword-to-products] keyword="${kwTrimmed}", threshold=${match_threshold}, count=${match_count}`);

    // ── 1. 키워드 임베딩 생성 ─────────────────────────────────
    const rawVec = await embedText(kwTrimmed, GEMINI_API_KEY);
    const embedding = normalize(rawVec);

    // ── 2. match_sourceable_products RPC 호출 ────────────────
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

    type MatchRow = {
      id: string;
      product_name: string | null;
      factory_name: string | null;
      factory_id: string | null;
      image_url: string | null;
      price: number | null;
      category: string | null;
      fg_category: string | null;
      similarity: number;
    };

    const rows = (matches ?? []) as MatchRow[];

    const result = rows.map((r) => ({
      id: r.id,
      product_name: r.product_name,
      vendor_name: r.factory_name,
      image_url: r.image_url,
      price: r.price,
      category: r.fg_category ?? r.category,
      similarity: Math.round(r.similarity * 10000) / 10000,
    }));

    console.log(`[match-keyword-to-products] "${kwTrimmed}" → ${result.length}건 매칭`);

    return jsonResponse({
      keyword: kwTrimmed,
      matches: result,
      total_matches: result.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("match-keyword-to-products error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
