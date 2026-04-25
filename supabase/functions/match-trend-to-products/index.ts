import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { trend_id, threshold = 0.55, max_results = 10 } = body;

    if (!trend_id) {
      return json({ error: "trend_id is required" }, 400);
    }

    const { data: trend, error: trendError } = await supabase
      .from("trend_analyses")
      .select("id, trend_keywords, source_data, created_at")
      .eq("id", trend_id)
      .single();

    if (trendError || !trend) {
      return json({ error: "Trend not found" }, 404);
    }

    const sourceData: any = trend.source_data || {};
    const title = sourceData.caption || sourceData.title || "";
    const imageUrl = sourceData.image_url || sourceData.thumbnail_url || null;

    const trendText = [title, ...(trend.trend_keywords || [])].filter(Boolean).join(" | ");
    const textEmbedding = await generateEmbedding(trendText);

    let imageEmbedding: number[] | null = null;
    if (imageUrl) {
      try {
        const imageDescription = await analyzeImageWithGemini(imageUrl);
        if (imageDescription) {
          imageEmbedding = await generateEmbedding(imageDescription);
        }
      } catch (imgError) {
        console.error("Image embedding failed, falling back to text-only:", imgError);
      }
    }

    const categoryFilter = extractCategoryFromKeywords(trend.trend_keywords || []);

    const { data: matches, error: matchError } = await supabase.rpc("match_products_hybrid", {
      query_text_embedding: textEmbedding,
      query_image_embedding: imageEmbedding,
      match_threshold: threshold,
      match_count: max_results,
      category_filter: categoryFilter,
    });

    if (matchError) {
      console.error("Match error:", matchError);
      return json({ error: matchError.message }, 500);
    }

    const trendDecay = getTrendDecay(trend.created_at);
    const adjustedMatches = (matches || []).map((m: any) => ({
      ...m,
      combined_score: m.combined_score * trendDecay,
      trend_decay: trendDecay,
    }));

    const matchedIds = adjustedMatches.map((m: any) => m.id);
    let products: any[] = [];

    if (matchedIds.length > 0) {
      const { data: productData } = await supabase
        .from("sourceable_products")
        .select(`
          id, image_url, item_name, item_name_en,
          category, fg_category, price, unit_price_usd,
          source_url, purchase_link, factory_id,
          detected_colors, detected_style,
          factories (id, name, country, city, moq)
        `)
        .in("id", matchedIds);

      products = (productData || [])
        .map((p: any) => {
          const match = adjustedMatches.find((m: any) => m.id === p.id);
          return {
            ...p,
            text_similarity: match?.text_similarity || 0,
            image_similarity: match?.image_similarity ?? null,
            combined_score: match?.combined_score || 0,
            trend_decay: match?.trend_decay || 1,
          };
        })
        .sort((a: any, b: any) => b.combined_score - a.combined_score);
    }

    return json({
      trend_id,
      threshold,
      trend_decay: trendDecay,
      has_image_matching: imageEmbedding !== null,
      matched_count: products.length,
      products,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function generateEmbedding(text: string): Promise<number[]> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/text-embedding-004",
        content: { parts: [{ text: text || "unknown" }] },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Embedding failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return data.embedding.values;
}

async function analyzeImageWithGemini(imageUrl: string): Promise<string | null> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) return null;

  try {
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) return null;

    const imgBuffer = await imgResponse.arrayBuffer();
    if (imgBuffer.byteLength > 5 * 1024 * 1024) return null;

    const bytes = new Uint8Array(imgBuffer);
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    const base64 = btoa(binary);
    const mimeType = imgResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              { text: `Analyze this fashion image. Return ONLY a pipe-separated string of attributes:
item_type | main_colors | material | style | silhouette | notable_details
Example: sneaker | white, beige | leather | casual streetwear | low-top | gum sole, retro design
Keep each attribute concise (1-3 words). If unsure about an attribute, skip it.` }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
      }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (error) {
    console.error("Gemini image analysis failed:", error);
    return null;
  }
}

function getTrendDecay(createdAt: string): number {
  const daysSince = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 7) return 1.0;
  if (daysSince <= 14) return 0.9;
  if (daysSince <= 30) return 0.7;
  return 0.5;
}

const CATEGORY_GROUPS: Record<string, string[]> = {
  footwear: ["shoes", "sneakers", "boots", "sandals", "heels", "loafers", "mules", "flats"],
  tops: ["shirt", "blouse", "t-shirt", "tee", "sweater", "hoodie", "jacket", "coat", "blazer", "cardigan", "vest", "top"],
  bottoms: ["pants", "jeans", "skirt", "shorts", "trousers", "leggings"],
  dresses: ["dress", "gown", "jumpsuit", "romper"],
  bags: ["bag", "tote", "clutch", "backpack", "purse", "handbag"],
  accessories: ["hat", "cap", "scarf", "belt", "jewelry", "necklace", "bracelet", "ring", "earring", "sunglasses", "watch"],
};

function extractCategoryFromKeywords(keywords: string[]): string | null {
  const joined = keywords.join(" ").toLowerCase();
  for (const [, terms] of Object.entries(CATEGORY_GROUPS)) {
    if (terms.some((t) => joined.includes(t))) {
      return null;
    }
  }
  return null;
}
