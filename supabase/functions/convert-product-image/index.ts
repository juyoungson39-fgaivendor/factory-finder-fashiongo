import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { productImageUrl, gender, ethnicity, bodyType, pose, productName, modelImageUrl, feedback } = await req.json();

    if (!productImageUrl) {
      return new Response(
        JSON.stringify({ error: "productImageUrl is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const genderText = gender === '여성' ? 'female' : 'male';
    const feedbackInstruction = feedback ? `\n\nUser feedback from previous generation: ${feedback}\nPlease address this feedback in the new image.` : '';

    // Build content array with both images when model reference exists
    const content: any[] = [];

    if (modelImageUrl) {
      content.push(
        {
          type: "text",
          text: `You are given two images:
1. A reference MODEL image — this is the person who should wear the clothing.
2. A PRODUCT image — this is the clothing item to put on the model.

CRITICAL REQUIREMENTS — READ CAREFULLY:
- The model's face, body type, skin tone, and pose must match the reference model image (image 1) exactly.
- **THE CLOTHING MUST BE IDENTICAL to the product image (image 2).** This is the most important requirement:
  · Same EXACT color (do not change hue, saturation, or brightness)
  · Same EXACT pattern (stripes, florals, solids, prints — copy them exactly)
  · Same EXACT style and cut (neckline, sleeve length, hem, silhouette)
  · Same EXACT fabric texture and details (buttons, zippers, embroidery, stitching)
  · Do NOT substitute, simplify, or reimagine any part of the garment
- If the product image shows a specific print or graphic, reproduce it exactly on the model.
- Clean white/light studio background, professional lighting, full body shot.
- The result should look like a real FashionGo product listing photo.
- Product name: ${productName || 'fashion item'}${feedbackInstruction}`
        },
        { type: "image_url", image_url: { url: modelImageUrl } },
        { type: "image_url", image_url: { url: productImageUrl } },
      );
    } else {
      content.push(
        {
          type: "text",
          text: `Create a professional fashion product photo showing a ${genderText} model wearing this EXACT clothing item.

Model characteristics:
- Ethnicity: ${ethnicity}
- Body type: ${bodyType}
- Pose: ${pose}
- Product: ${productName || 'fashion item'}

CRITICAL: The clothing on the model must be IDENTICAL to the garment in the provided image:
- Same exact color, pattern, style, cut, and all details
- Do NOT change any aspect of the clothing design
- Reproduce any prints, graphics, or textures exactly as shown

Clean white/light background, professional studio lighting, full body shot.
Make it look like a real FashionGo product listing photo.${feedbackInstruction}`
        },
        { type: "image_url", image_url: { url: productImageUrl } },
      );
    }

    const messages: any[] = [{ role: "user", content }];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages,
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI 크레딧이 부족합니다. 설정에서 충전해 주세요." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const imageData = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!imageData) {
      throw new Error("이미지가 생성되지 않았습니다");
    }

    return new Response(
      JSON.stringify({ success: true, imageUrl: imageData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("convert-product-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
