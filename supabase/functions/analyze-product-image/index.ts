import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

async function resolveImageDataUrl(imageUrl: string): Promise<{ dataUrl: string | null; reason?: string }> {
  try {
    const response = await fetch(imageUrl, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 Lovable Image Fetcher",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { dataUrl: null, reason: `Image URL returned ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) {
      return { dataUrl: null, reason: `URL did not return an image (${contentType || "unknown content type"})` };
    }

    const buffer = await response.arrayBuffer();
    if (!buffer.byteLength) {
      return { dataUrl: null, reason: "Image response was empty" };
    }

    const base64 = arrayBufferToBase64(buffer);
    return { dataUrl: `data:${contentType};base64,${base64}` };
  } catch (error) {
    return {
      dataUrl: null,
      reason: error instanceof Error ? error.message : "Failed to fetch image",
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url, image_base64 } = await req.json();

    if (!image_url && !image_base64) {
      return jsonResponse({ error: "image_url 또는 image_base64가 필요합니다" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    let resolvedImageUrl: string | null = null;

    if (image_base64) {
      resolvedImageUrl = image_base64.startsWith("data:")
        ? image_base64
        : `data:image/jpeg;base64,${image_base64}`;
    } else if (image_url) {
      const resolved = await resolveImageDataUrl(image_url);
      if (!resolved.dataUrl) {
        console.warn("Skipping AI analysis due to unreachable image", {
          image_url,
          reason: resolved.reason,
        });

        return jsonResponse({
          success: false,
          skipped: true,
          reason: resolved.reason || "이미지를 불러올 수 없습니다",
          analysis: null,
        });
      }

      resolvedImageUrl = resolved.dataUrl;
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a fashion product image analyst. Analyze the product image and return structured data.

Determine:
1. product_type: The specific garment type in English. Use standard FashionGo naming:
   - "Dress", "Maxi Dress", "Mini Dress", "Bodycon Dress"
   - "Top", "Blouse", "T-Shirt", "Tank Top", "Crop Top"
   - "Pants", "Jeans", "Leggings", "Shorts", "Wide Leg Pants"
   - "Skirt", "Mini Skirt", "Maxi Skirt"
   - "Jacket", "Blazer", "Coat", "Cardigan", "Hoodie"
   - "Jumpsuit", "Romper"
   - "Set" (matching top+bottom), "2 Piece Set", "3 Piece Set"
   - "Swimwear", "Bikini", "One Piece Swimsuit"
   - "Activewear", "Sports Bra", "Yoga Pants"

2. is_plus_size: boolean — true if the garment appears designed for plus-size/curvy bodies (larger sizing, extended sizes, curvy fit indicators, plus-size model)

3. suggested_item_name: A concise English product name for FashionGo listing (e.g. "Floral Print Maxi Dress", "High Waist Wide Leg Pants", "2PC Casual Lounge Set")

4. suggested_category: One of these FashionGo categories: "Tops", "Dresses", "Bottoms", "Outerwear", "Activewear", "Swimwear", "Sets", "Accessories", "Plus Size"

5. color: Main color(s) detected

6. pattern: "Solid", "Floral", "Striped", "Plaid", "Animal Print", "Graphic", "Abstract", "Tie Dye", "Color Block"

7. material_guess: Best guess of material from visual (e.g. "Cotton", "Polyester", "Denim", "Linen", "Knit", "Satin", "Chiffon")

8. style_tags: Array of style keywords (e.g. ["casual", "boho", "summer", "office"])

Return ONLY valid JSON, no markdown:
{
  "product_type": "...",
  "is_plus_size": false,
  "suggested_item_name": "...",
  "suggested_category": "...",
  "color": "...",
  "pattern": "...",
  "material_guess": "...",
  "style_tags": ["..."]
}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analyze this fashion product image:" },
              { type: "image_url", image_url: { url: resolvedImageUrl } },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      console.error(`AI gateway error: status=${res.status}, body=${errorBody}`);

      if (res.status === 429) {
        return jsonResponse({ error: "AI 요청 제한 초과. 잠시 후 다시 시도해주세요." }, 429);
      }

      if (res.status === 402) {
        return jsonResponse({ error: "AI 크레딧 부족." }, 402);
      }

      if (res.status === 400 && errorBody.includes("Received 404 status code when fetching image from URL")) {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: "AI provider could not fetch the image",
          analysis: null,
        });
      }

      throw new Error(`AI analysis failed: ${res.status} - ${errorBody.slice(0, 200)}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    if (!content) {
      return jsonResponse({
        success: false,
        skipped: true,
        reason: "AI returned empty content",
        analysis: null,
      });
    }

    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const analysis = JSON.parse(jsonStr);

    return jsonResponse({ success: true, analysis });
  } catch (error: any) {
    console.error("analyze-product-image error:", error);
    return jsonResponse({ error: error.message }, 500);
  }
});