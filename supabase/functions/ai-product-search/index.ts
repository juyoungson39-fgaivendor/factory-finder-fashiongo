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
    const { image_base64, direct_query, vendor_products } = await req.json();

    if (!image_base64 && !direct_query) {
      return new Response(JSON.stringify({ error: "이미지 또는 검색어가 필요합니다" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Step 1: Analyze image or use query
    let imageAnalysis: any = null;
    let searchDescription = "";

    if (image_base64) {
      console.log("Step 1: Analyzing image...");
      const analysisRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are a fashion product analyst. Analyze the image and extract detailed product characteristics.
Return ONLY valid JSON:
{
  "product_type": "e.g. women's dress, men's jacket",
  "style_keywords": ["keyword1", "keyword2", "keyword3"],
  "material": "e.g. cotton, polyester, silk",
  "color": "main color",
  "category": "e.g. Tops, Dresses, Bottoms, Outerwear, Activewear, Accessories",
  "pattern": "e.g. solid, floral, striped, graphic",
  "fit": "e.g. relaxed, slim, oversized",
  "description_ko": "Korean description of the product style",
  "search_description": "Detailed English description for matching similar products"
}`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analyze this fashion product image:" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
              ],
            },
          ],
          temperature: 0.2,
        }),
      });

      if (!analysisRes.ok) {
        const status = analysisRes.status;
        if (status === 429) {
          return new Response(JSON.stringify({ error: "AI 요청 제한 초과. 잠시 후 다시 시도해주세요." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (status === 402) {
          return new Response(JSON.stringify({ error: "AI 크레딧 부족. 크레딧을 충전해주세요." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI analysis failed: ${status}`);
      }

      const analysisData = await analysisRes.json();
      const content = analysisData.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      imageAnalysis = JSON.parse(jsonStr);
      searchDescription = imageAnalysis.search_description || `${imageAnalysis.product_type} ${imageAnalysis.material} ${imageAnalysis.color}`;
    } else {
      searchDescription = direct_query;
      imageAnalysis = {
        product_type: direct_query,
        style_keywords: direct_query.split(/[,\s]+/).filter(Boolean),
        material: "",
        color: "",
        category: "",
        description_ko: `직접 검색: ${direct_query}`,
      };
    }

    // Step 2: Match against vendor products
    console.log("Step 2: Matching against vendor products...");

    const productCatalog = JSON.stringify(vendor_products);

    const matchRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a fashion product matching specialist. Given a search description and a catalog of vendor products, find the most similar/relevant products.

Score each product 0-100 based on:
- Category match (same type of garment)
- Style similarity (silhouette, design details)
- Material/fabric match
- Color compatibility
- Overall fashion context fit

Return ONLY valid JSON:
{
  "matches": [
    {
      "vendor_id": "vendor id from catalog",
      "product_index": 0,
      "match_score": 85,
      "reason_ko": "Korean explanation of why this matches"
    }
  ]
}

Include ALL products with match_score >= 30. Sort by match_score descending.`,
          },
          {
            role: "user",
            content: `Search description: ${searchDescription}

Product catalog by vendor:
${productCatalog}`,
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!matchRes.ok) throw new Error(`Matching failed: ${matchRes.status}`);

    const matchData = await matchRes.json();
    const matchContent = matchData.choices?.[0]?.message?.content || "";
    const matchJsonMatch = matchContent.match(/```json\s*([\s\S]*?)```/) || matchContent.match(/\{[\s\S]*\}/);
    const matchStr = matchJsonMatch ? (matchJsonMatch[1] || matchJsonMatch[0]) : matchContent;
    const matchResult = JSON.parse(matchStr);

    return new Response(JSON.stringify({
      success: true,
      image_analysis: imageAnalysis,
      matches: matchResult.matches || [],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("ai-product-search error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
