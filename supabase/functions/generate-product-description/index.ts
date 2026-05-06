import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM_PROMPT =
  "당신은 패션 카피라이터입니다. 입력된 이미지/카테고리/소재/색상을 보고 " +
  "한국 도매 사이트에 노출할 상품설명을 한국어로 2~4문장, 60~150자로 작성하세요.\n" +
  "- 과장 표현(최고/완벽 등) 금지\n" +
  "- 핏, 디테일, 스타일링 키워드 중심\n" +
  "- 마지막에 마침표로 끝낼 것\n" +
  "오직 설명 본문만 반환하세요. 따옴표·머리말·접두사 없이.";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Input
    const body = await req.json().catch(() => ({}));
    const { image_url, category, material, color_size } = body ?? {};
    if (!image_url || typeof image_url !== "string") {
      return json({ error: "image_url is required" }, 400);
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);
    }

    const userText =
      `카테고리: ${category ?? "(미지정)"}\n` +
      `소재: ${material ?? "(미지정)"}\n` +
      `색상/사이즈: ${color_size ?? "(미지정)"}\n\n` +
      "위 정보와 첨부 이미지를 보고 상품설명을 작성하세요.";

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "url", url: image_url } },
              { type: "text", text: userText },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("Anthropic error:", resp.status, errText);
      return json(
        { error: `Anthropic API ${resp.status}: ${errText.slice(0, 300)}` },
        resp.status >= 500 ? 502 : resp.status,
      );
    }

    const data = await resp.json();
    const description: string =
      (data?.content ?? [])
        .filter((b: any) => b?.type === "text")
        .map((b: any) => b.text)
        .join("\n")
        .trim() ?? "";

    if (!description) {
      return json({ error: "Empty description from model" }, 502);
    }

    return json({ description });
  } catch (e) {
    console.error("generate-product-description error:", e);
    return json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
});
