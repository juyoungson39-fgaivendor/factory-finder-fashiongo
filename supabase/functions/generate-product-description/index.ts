// Generate Korean product description from image + attributes using Lovable AI Gateway.
// Usage from client:
//   supabase.functions.invoke('generate-product-description', {
//     body: { productId, imageUrl, category, material, colorSize }
//   })
// Response: { description, source: 'ai'|'manual', cached: boolean }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `당신은 한국 패션 도매 카피라이터입니다. 입력된 이미지/카테고리/소재/색상을 종합해
한국어로 2~4문장, 60~150자 사이의 상품설명을 작성하세요.
- 과장 표현(최고/완벽/베스트 등) 사용 금지
- 핏, 디테일, 소재감, 스타일링 키워드 중심
- 마침표로 끝낼 것
- 가격, 사이즈 숫자 직접 언급 금지`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await supabase.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const { productId, imageUrl, category, material, colorSize } = body ?? {};

    if (!imageUrl) return json({ error: "imageUrl is required" }, 400);
    if (!productId) return json({ error: "productId is required" }, 400);

    // Idempotency: return existing description if already populated
    const { data: existing } = await supabase
      .from("sourceable_products")
      .select("description, description_source")
      .eq("id", productId)
      .maybeSingle();

    if (existing?.description && existing.description.trim().length > 0) {
      return json({
        description: existing.description,
        source: existing.description_source ?? "manual",
        cached: true,
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY missing" }, 500);

    const userText = `카테고리: ${category ?? "-"}\n소재: ${material ?? "-"}\n색상/사이즈: ${colorSize ?? "-"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      if (aiRes.status === 429) return json({ error: "Rate limited, try later" }, 429);
      if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: `AI model failed: ${aiRes.status}` }, 502);
    }

    const aiData = await aiRes.json();
    const description = (aiData?.choices?.[0]?.message?.content ?? "").toString().trim();
    if (!description) return json({ error: "Empty AI response" }, 502);

    const { error: upErr } = await supabase
      .from("sourceable_products")
      .update({
        description,
        description_source: "ai",
        description_generated_at: new Date().toISOString(),
      })
      .eq("id", productId);

    if (upErr) {
      console.error("DB update failed:", upErr);
      return json({ error: `DB update failed: ${upErr.message}` }, 500);
    }

    return json({ description, source: "ai", cached: false });
  } catch (e) {
    console.error("generate-product-description error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
