import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function json(body: unknown, status = 200) {
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

async function fetchImageBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 Lovable Embedding Service" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;
    const buffer = await res.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > 5 * 1024 * 1024) return null;
    return { base64: arrayBufferToBase64(buffer), mimeType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Target: 'trend' — trend_analyses.embedding
// Model: gemini-embedding-001 (768-dim, matches search-by-image query)
// ─────────────────────────────────────────────────────────────
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TREND_EMBED_MODEL = "gemini-embedding-001"; // MUST match search-by-image

async function embedTrendRow(
  text: string,
  imageUrl: string | null,
  apiKey: string,
): Promise<number[]> {
  const url = `${GEMINI_API_BASE}/models/${TREND_EMBED_MODEL}:embedContent?key=${apiKey}`;

  // Try multimodal (text + image) first
  if (imageUrl) {
    const img = await fetchImageBase64(imageUrl);
    if (img) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${TREND_EMBED_MODEL}`,
          content: {
            parts: [
              { text },
              { inlineData: { mimeType: img.mimeType, data: img.base64 } },
            ],
          },
          outputDimensionality: 768,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const vec: number[] = data.embedding.values;
        // L2 normalize
        const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        return mag === 0 ? vec : vec.map((v) => v / mag);
      }
      console.warn("Multimodal embedding failed, falling back to text-only");
    }
  }

  // Text-only fallback
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: `models/${TREND_EMBED_MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: 768,
    }),
  });
  if (!res.ok) {
    throw new Error(`Embedding failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const vec: number[] = data.embedding.values;
  const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  return mag === 0 ? vec : vec.map((v) => v / mag);
}

// ─────────────────────────────────────────────────────────────
// Target: 'products' — sourceable_products.image_embedding (legacy)
// ─────────────────────────────────────────────────────────────
async function analyzeProductImage(
  imageUrl: string,
  geminiKey: string,
): Promise<{ result: string | null; error?: string }> {
  try {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return { result: null, error: `Image fetch failed: ${imgResponse.status}` };
    const imgBuffer = await imgResponse.arrayBuffer();
    if (imgBuffer.byteLength > 5 * 1024 * 1024) return { result: null, error: "Image too large" };

    const bytes = new Uint8Array(imgBuffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    const base64 = btoa(binary);
    const mimeType = imgResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: `Analyze this fashion product image. Return ONLY a pipe-separated string:\nitem_type | main_colors | material | style | silhouette | notable_details\nBe concise (1-3 words per attribute).` },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
      },
    );
    if (!response.ok) return { result: null, error: `Gemini API error: ${response.status}` };
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return text ? { result: text } : { result: null, error: "Gemini returned no text" };
  } catch (e) {
    return { result: null, error: String(e) };
  }
}

async function generateProductEmbedding(text: string, geminiKey: string): Promise<number[]> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } }),
    },
  );
  if (!response.ok) throw new Error(`Embedding failed (${response.status}): ${await response.text()}`);
  const data = await response.json();
  return data.embedding.values;
}

function parseImageDescription(description: string) {
  const parts = description.split("|").map((s) => s.trim());
  return {
    colors: parts[1]?.split(",").map((s) => s.trim()).filter(Boolean) || [],
    material: parts[2] || null,
    style: parts[3] || null,
  };
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const batchSize: number = Math.min(body.batch_size ?? 20, 50);
    // target: 'trend' (default) = trend_analyses.embedding
    //         'products'        = sourceable_products.image_embedding (legacy)
    const target: "trend" | "products" = body.target === "products" ? "products" : "trend";

    // ── Target: trend_analyses ─────────────────────────────────
    if (target === "trend") {
      const { data: rows, error } = await supabase
        .from("trend_analyses")
        .select("id, trend_keywords, lifecycle_stage, source_data, status")
        .is("embedding", null)
        .eq("status", "analyzed")
        .order("created_at", { ascending: false })
        .limit(batchSize);

      if (error) throw error;
      if (!rows || rows.length === 0) {
        // Count remaining anyway
        const { count: remaining } = await supabase
          .from("trend_analyses")
          .select("id", { count: "exact", head: true })
          .is("embedding", null)
          .eq("status", "analyzed");
        return json({ message: "No trend rows to process", processed: 0, failed: 0, remaining: remaining ?? 0 });
      }

      let processed = 0;
      let failed = 0;

      for (const row of rows) {
        try {
          // Build text representation
          const keywords: string[] = row.trend_keywords ?? [];
          // deno-lint-ignore no-explicit-any
          const sd: Record<string, any> = row.source_data ?? {};
          const textParts = [
            keywords.join(" "),
            sd.trend_name,
            sd.summary_ko,
            (sd.search_hashtags as string[] | undefined)?.join(" "),
          ].filter(Boolean);
          const text = textParts.join(" ").trim() || "fashion trend";
          const imageUrl: string | null = sd.image_url ?? null;

          const embedding = await embedTrendRow(text, imageUrl, geminiKey);

          const { error: updateErr } = await supabase
            .from("trend_analyses")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", row.id);

          if (updateErr) throw updateErr;
          processed++;
        } catch (e) {
          console.error(`trend_analyses row ${row.id} failed:`, e);
          failed++;
        }

        // Rate-limit: 500ms between rows
        await new Promise((r) => setTimeout(r, 500));
      }

      const { count: remaining } = await supabase
        .from("trend_analyses")
        .select("id", { count: "exact", head: true })
        .is("embedding", null)
        .eq("status", "analyzed");

      return json({
        message: `Trend embeddings: processed ${processed}, failed ${failed}`,
        processed,
        failed,
        remaining: remaining ?? 0,
      });
    }

    // ── Target: sourceable_products (legacy) ───────────────────
    const { data: products, error } = await supabase
      .from("sourceable_products")
      .select("id, image_url, item_name, item_name_en, category, fg_category")
      .is("image_embedding", null)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .limit(batchSize);

    if (error) throw error;
    if (!products || products.length === 0) {
      return json({ message: "No products to process", processed: 0, failed: 0, remaining: 0 });
    }

    let processed = 0;
    let failed = 0;
    // deno-lint-ignore no-explicit-any
    const results: any[] = [];

    for (const product of products) {
      try {
        const { result: imageDescription, error: analyzeError } = await analyzeProductImage(product.image_url!, geminiKey);
        if (!imageDescription) {
          failed++;
          results.push({ id: product.id, status: "skip", reason: analyzeError || "image analysis failed" });
          continue;
        }

        const enrichedText = [
          imageDescription,
          product.item_name_en || product.item_name,
          product.fg_category || product.category,
        ].filter(Boolean).join(" | ");

        const embedding = await generateProductEmbedding(enrichedText, geminiKey);
        const parsed = parseImageDescription(imageDescription);

        const { error: updateError } = await supabase
          .from("sourceable_products")
          .update({
            image_embedding: JSON.stringify(embedding),
            image_description: imageDescription,
            detected_colors: parsed.colors,
            detected_style: parsed.style,
            detected_material: parsed.material,
          })
          .eq("id", product.id);

        if (updateError) {
          failed++;
          results.push({ id: product.id, status: "error", reason: updateError.message });
        } else {
          processed++;
          results.push({ id: product.id, status: "ok", description: imageDescription });
        }
        await new Promise((r) => setTimeout(r, 3000));
      } catch (productError) {
        console.error(`Failed for product ${product.id}:`, productError);
        failed++;
        results.push({ id: product.id, status: "error", reason: String(productError) });
      }
    }

    const { count: remaining } = await supabase
      .from("sourceable_products")
      .select("id", { count: "exact", head: true })
      .is("image_embedding", null)
      .not("image_url", "is", null)
      .neq("image_url", "");

    return json({
      message: `Processed ${processed}, failed ${failed}`,
      processed,
      failed,
      remaining: remaining || 0,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Batch embedding error:", message);
    return json({ error: message }, 500);
  }
});
