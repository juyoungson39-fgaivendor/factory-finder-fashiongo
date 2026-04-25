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
    const batch_size: number = body.batch_size ?? 20;

    const { data: products, error } = await supabase
      .from("sourceable_products")
      .select("id, image_url, item_name, item_name_en, category, fg_category")
      .is("image_embedding", null)
      .not("image_url", "is", null)
      .neq("image_url", "")
      .limit(batch_size);

    if (error) throw error;
    if (!products || products.length === 0) {
      return json({ message: "No products to process", processed: 0, remaining: 0 });
    }

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY가 설정되지 않았습니다");
    if (!openaiKey) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다");

    let processed = 0;
    let failed = 0;
    const results: any[] = [];

    for (const product of products) {
      try {
        const imageDescription = await analyzeImage(product.image_url!, geminiKey);

        if (!imageDescription) {
          failed++;
          results.push({ id: product.id, status: "skip", reason: "image analysis failed" });
          continue;
        }

        const enrichedText = [
          imageDescription,
          product.item_name_en || product.item_name,
          product.fg_category || product.category,
        ].filter(Boolean).join(" | ");

        const embedding = await generateEmbedding(enrichedText, openaiKey);
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

        await new Promise((resolve) => setTimeout(resolve, 1000));
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
    console.error("Batch error:", message);
    return json({ error: message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function analyzeImage(imageUrl: string, geminiKey: string): Promise<string | null> {
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
              { text: `Analyze this fashion product image. Return ONLY a pipe-separated string:
item_type | main_colors | material | style | silhouette | notable_details
Example: sneaker | white, beige | leather | casual streetwear | low-top | gum sole, retro design
Be concise (1-3 words per attribute). Skip unknown attributes.` }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
      }
    );

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (error) {
    console.error("Gemini analysis error:", error);
    return null;
  }
}

async function generateEmbedding(text: string, openaiKey: string): Promise<number[]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embedding failed (${response.status}): ${await response.text()}`);
  }
  const data = await response.json();
  return data.data[0].embedding;
}

function parseImageDescription(description: string) {
  const parts = description.split("|").map((s) => s.trim());
  return {
    colors: parts[1]?.split(",").map((s) => s.trim()).filter(Boolean) || [],
    material: parts[2] || null,
    style: parts[3] || null,
  };
}
