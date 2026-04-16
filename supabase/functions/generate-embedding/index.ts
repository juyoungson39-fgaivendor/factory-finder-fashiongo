import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TEXT_EMBEDDING_MODEL = "text-embedding-004"; // 768-dim, text-only, stable

// [TEST MODE] 테스트용 배치 제한 상수 — 프로덕션 시 값을 올려주세요
const MAX_BATCH_SIZE = 3;
const BATCH_LIMIT = MAX_BATCH_SIZE;

// Whitelisted to prevent SQL injection via table name
const ALLOWED_TABLES = ["sourceable_products", "trend_analyses"] as const;
type AllowedTable = (typeof ALLOWED_TABLES)[number];

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
  url: string
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Lovable Embedding Service" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength) return null;
    return { base64: arrayBufferToBase64(buffer), mimeType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Gemini Embedding Calls
// ─────────────────────────────────────────────────────────────
async function embedText(text: string, apiKey: string): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
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

async function embedImage(
  base64: string,
  mimeType: string,
  apiKey: string
): Promise<number[] | null> {
  const url = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${EMBEDDING_MODEL}`,
      content: {
        parts: [{ inlineData: { mimeType, data: base64 } }],
      },
    }),
  });
  if (!res.ok) {
    // Multimodal embedding may not be available on all API tiers — soft fail
    console.warn(`Image embedding failed (${res.status}): ${await res.text()}`);
    return null;
  }
  const data = await res.json();
  return data.embedding.values as number[];
}

/** Weighted average: textWeight + imageWeight should equal 1.0 */
function weightedAverage(
  textVec: number[],
  imageVec: number[],
  textWeight = 0.4,
  imageWeight = 0.6
): number[] {
  return textVec.map((v, i) => v * textWeight + imageVec[i] * imageWeight);
}

/** L2-normalize a vector (makes cosine similarity == dot product) */
function normalize(vec: number[]): number[] {
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vec;
  return vec.map((v) => v / magnitude);
}

// ─────────────────────────────────────────────────────────────
// Core: build embedding for one row
// ─────────────────────────────────────────────────────────────
async function buildEmbedding(
  text: string | null,
  imageUrl: string | null,
  apiKey: string
): Promise<number[]> {
  const hasText = !!text?.trim();
  const hasImage = !!imageUrl;

  if (!hasText && !hasImage) {
    throw new Error("text 또는 image_url 중 하나는 필수입니다");
  }

  let textVec: number[] | null = null;
  let imageVec: number[] | null = null;

  if (hasText) {
    textVec = await embedText(text!.trim(), apiKey);
  }

  if (hasImage) {
    const img = await fetchImageBase64(imageUrl!);
    if (img) {
      imageVec = await embedImage(img.base64, img.mimeType, apiKey);
    } else {
      console.warn("Image could not be fetched, falling back to text-only:", imageUrl);
    }
  }

  // Decide final vector
  if (textVec && imageVec) {
    return normalize(weightedAverage(textVec, imageVec, 0.4, 0.6));
  }
  if (textVec) return normalize(textVec);
  if (imageVec) return normalize(imageVec);

  throw new Error("임베딩 생성 실패: 유효한 텍스트와 이미지가 없습니다");
}

// ─────────────────────────────────────────────────────────────
// Table-specific: extract text & image from a DB row
// ─────────────────────────────────────────────────────────────
function extractRowContent(
  table: AllowedTable,
  // deno-lint-ignore no-explicit-any
  row: Record<string, any>
): { text: string; imageUrl: string | null } {
  if (table === "sourceable_products") {
    const parts = [
      row.item_name,
      row.item_name_en,
      row.category,
      row.fg_category,
      row.vendor_name,
    ].filter(Boolean);
    return {
      text: parts.join(" "),
      imageUrl: row.image_url ?? null,
    };
  }

  // trend_analyses
  const keywords: string[] = row.trend_keywords ?? [];
  const sourceData = row.source_data ?? {};
  const parts = [
    keywords.join(" "),
    sourceData.trend_name,
    sourceData.summary_ko,
    (sourceData.search_hashtags as string[] | undefined)?.join(" "),
  ].filter(Boolean);

  return {
    text: parts.join(" "),
    imageUrl: sourceData.image_url ?? null,
  };
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase 환경변수가 설정되지 않았습니다");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json();
    const { table, id, text, image_url, batch } = body as {
      table: string;
      id?: string;
      text?: string;
      image_url?: string;
      batch?: boolean;
    };

    // Validate table name (prevent SQL injection)
    if (!ALLOWED_TABLES.includes(table as AllowedTable)) {
      return jsonResponse(
        { error: `허용되지 않는 테이블입니다. 허용: ${ALLOWED_TABLES.join(", ")}` },
        400
      );
    }
    const allowedTable = table as AllowedTable;

    // ── Batch mode ──────────────────────────────────────────────
    if (batch) {
      console.log(`[TEST MODE] 최대 ${MAX_BATCH_SIZE}건 제한`);
      const { data: rows, error: fetchErr } = await supabase
        .from(allowedTable)
        .select("*")
        .is("embedding", null)
        .limit(BATCH_LIMIT);

      if (fetchErr) throw new Error(`DB 조회 실패: ${fetchErr.message}`);
      if (!rows || rows.length === 0) {
        return jsonResponse({ success: true, processed: 0, message: "처리할 행이 없습니다" });
      }

      let processed = 0;
      let failed = 0;
      const errors: { id: string; error: string }[] = [];

      for (const row of rows) {
        try {
          const { text: rowText, imageUrl: rowImageUrl } = extractRowContent(allowedTable, row);

          if (!rowText && !rowImageUrl) {
            console.warn(`Row ${row.id}: 텍스트와 이미지 없음, 스킵`);
            failed++;
            continue;
          }

          const embedding = await buildEmbedding(rowText || null, rowImageUrl, GEMINI_API_KEY);

          const { error: updateErr } = await supabase
            .from(allowedTable)
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", row.id);

          if (updateErr) throw new Error(updateErr.message);
          processed++;
        } catch (err) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ id: row.id, error: msg });
          console.error(`Row ${row.id} 실패:`, msg);
        }
      }

      return jsonResponse({
        success: true,
        processed,
        failed,
        total: rows.length,
        ...(errors.length > 0 ? { errors } : {}),
      });
    }

    // ── Single mode ─────────────────────────────────────────────
    if (!id) {
      return jsonResponse({ error: "단건 모드에서는 id가 필요합니다" }, 400);
    }
    if (!text && !image_url) {
      return jsonResponse({ error: "text 또는 image_url 중 하나는 필수입니다" }, 400);
    }

    const embedding = await buildEmbedding(text ?? null, image_url ?? null, GEMINI_API_KEY);

    const { error: updateErr } = await supabase
      .from(allowedTable)
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", id);

    if (updateErr) throw new Error(`DB 업데이트 실패: ${updateErr.message}`);

    return jsonResponse({
      success: true,
      id,
      table: allowedTable,
      dimensions: embedding.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-embedding error:", message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
