import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TEXT_EMBEDDING_MODEL = "gemini-embedding-001"; // 768-dim, matches trend_analyses.embedding
const VISION_MODEL = "google/gemini-2.5-flash"; // via Lovable AI Gateway
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function fetchImageBase64(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Lovable Trend Search" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL did not return an image: ${contentType}`);
  }
  const buffer = await res.arrayBuffer();
  if (!buffer.byteLength) throw new Error("Empty image body");
  return {
    base64: arrayBufferToBase64(buffer),
    mimeType: contentType.split(";")[0],
  };
}

// Step 1: image → fashion description text via Lovable AI Gateway (multimodal)
async function describeImage(
  base64: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const prompt =
    "Describe this fashion image for similarity search. Include: garment type/category, " +
    "colors, pattern, style, silhouette, material/fabric, season/occasion. " +
    "Reply with a concise English description (1-2 sentences, no preamble).";

  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      }],
      temperature: 0.2,
      max_tokens: 200,
    }),
  });
  if (!res.ok) {
    throw new Error(`Vision describe failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const text = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!text) throw new Error("Vision returned empty description");
  return text;
}

// Step 2: text → 768-dim embedding (matches existing trend embeddings)
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${TEXT_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${TEXT_EMBEDDING_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) {
    throw new Error(`Text embedding failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.embedding.values as number[];
}

function normalize(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (mag === 0) return vec;
  return vec.map((v) => v / mag);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "POST only" }, 405);

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase env not configured");
    }

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Body
    const body = await req.json().catch(() => ({}));
    const { image_url, limit } = body as {
      image_url?: string;
      user_id?: string;
      limit?: number;
    };
    if (!image_url || typeof image_url !== "string") {
      return jsonResponse({ error: "image_url is required" }, 400);
    }
    const matchLimit = Math.min(
      Math.max(Number(limit) || DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    // Step 1: image → description
    const img = await fetchImageBase64(image_url);
    const description = await describeImage(img.base64, img.mimeType, LOVABLE_API_KEY);

    // Step 2: description → embedding
    const rawVec = await embedText(description, GEMINI_API_KEY);
    const queryEmbedding = normalize(rawVec);

    // Step 3: similarity search via RPC (service role)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: rows, error: rpcErr } = await supabase.rpc(
      "match_trend_analyses_by_embedding",
      {
        query_embedding: JSON.stringify(queryEmbedding),
        match_limit: matchLimit,
      },
    );
    if (rpcErr) throw new Error(`Similarity search failed: ${rpcErr.message}`);

    return jsonResponse({
      results: rows ?? [],
      total: rows?.length ?? 0,
      image_description: description,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("search-by-image error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
