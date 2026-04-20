import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireUserAuth } from "../_shared/require-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getRetryAfterMs(response: Response, attempt: number) {
  const retryAfterHeader = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  const exponentialBackoff = Math.min(15000, Math.pow(2, attempt + 1) * 1000);
  const jitter = Math.floor(Math.random() * 1000);
  return exponentialBackoff + jitter;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUserAuth(req, corsHeaders);
  if (auth instanceof Response) return auth;

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { gender, ethnicity, bodyType, pose, vendorName } = await req.json();

    const prompt = `Generate a full-body fashion model photo for a clothing brand. The model should be:
- Gender: ${gender === "여성" ? "Female" : "Male"}
- Ethnicity: ${ethnicity}
- Body type: ${bodyType}
- Pose: ${pose}
- Brand style: ${vendorName || "Fashion"}

The model should be standing in a clean white/light gray studio background, wearing simple neutral-colored clothing (plain white t-shirt and jeans or similar basic outfit).
Professional fashion photography style, well-lit, high quality, full body visible from head to toe.
This is a reference model photo for virtual try-on, so the model's body proportions and pose should be clear and visible.`;

    let response: Response | null = null;
    let retryAfterMs = 0;
    const maxAttempts = 4;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (response.status !== 429) {
        break;
      }

      retryAfterMs = getRetryAfterMs(response, attempt);
      const isLastAttempt = attempt === maxAttempts - 1;

      if (isLastAttempt) {
        console.log(`Rate limited after ${maxAttempts} attempts; suggested retry in ${Math.round(retryAfterMs)}ms`);
        break;
      }

      console.log(`Rate limited, retrying in ${Math.round(retryAfterMs)}ms (attempt ${attempt + 1}/${maxAttempts})`);
      await sleep(retryAfterMs);
    }

    if (!response || response.status === 429) {
      return new Response(
        JSON.stringify({
          error: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          retryAfterMs: retryAfterMs || 15000,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!response.ok) {
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI 크레딧이 부족합니다. 설정에서 충전해 주세요." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-vendor-model error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
