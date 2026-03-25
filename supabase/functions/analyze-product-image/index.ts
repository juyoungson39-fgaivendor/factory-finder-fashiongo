import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_url, image_base64 } = await req.json();

    if (!image_url && !image_base64) {
      return new Response(JSON.stringify({ error: "image_url 또는 image_base64가 필요합니다" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build image content for vision
    let imageContent: any;
    if (image_base64) {
      imageContent = { type: "image_url", image_url: { url: image_base64.startsWith("data:") ? image_base64 : `data:image/jpeg;base64,${image_base64}` } };
    } else {
      imageContent = { type: "image_url", image_url: { url: image_url } };
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
              imageContent,
            ],
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      if (res.status === 429) {
        return new Response(JSON.stringify({ error: "AI 요청 제한 초과. 잠시 후 다시 시도해주세요." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (res.status === 402) {
        return new Response(JSON.stringify({ error: "AI 크레딧 부족." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI analysis failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const analysis = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("analyze-product-image error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
