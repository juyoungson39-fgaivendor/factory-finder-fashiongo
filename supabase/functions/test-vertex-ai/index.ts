import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getAccessToken } from "../_shared/google-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Hardcoded test data
const TEST_SYSTEM_PROMPT = `You are a vendor evaluation specialist for the North American wholesale fashion market.
Score this factory/supplier based on the available information.

Scoring Criteria:
- "재고 보유 여부" (id: "test-stock", max_score: 10, weight: 2.5): Ready-to-ship 재고 보유 수준. 즉시 출하 가능한 SKU 비율
- "북미 타겟 상품력" (id: "test-market", max_score: 10, weight: 2.5): 북미 트렌드/사이즈/스타일 적합성
- "MOQ 유연성" (id: "test-moq", max_score: 10, weight: 1.5): 소량 주문 대응력. 색상/사이즈별 최소 수량 유연성

Return ONLY valid JSON:
{"overall_score": 0-100, "reasoning_ko": "Korean explanation", "strengths": [...], "weaknesses": [...], "scores": [{"criteria_id": "id", "score": 0, "notes": "reason in Korean"}]}`;

const TEST_FACTORY = {
  name: "Guangzhou Meili Clothing Co.",
  country: "China",
  city: "Guangzhou",
  main_products: ["Women's knit dress", "sweater"],
  moq: "500",
  lead_time: "25-30 days",
  certifications: ["ISO 9001"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const PROJECT = Deno.env.get("GOOGLE_CLOUD_PROJECT");
  const LOCATION = Deno.env.get("GOOGLE_CLOUD_LOCATION") || "us-central1";
  const SERVICE_ACCOUNT_KEY = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  const MODEL = Deno.env.get("VERTEX_AI_MODEL") || "gemini-2.5-flash";

  // Validate env vars
  if (!PROJECT || !SERVICE_ACCOUNT_KEY) {
    return new Response(
      JSON.stringify({
        success: false,
        error:
          "GOOGLE_CLOUD_PROJECT 및 GOOGLE_SERVICE_ACCOUNT_KEY 환경변수를 설정하세요",
        step: "env_check",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Step 1: Auth
  let accessToken: string;
  try {
    accessToken = await getAccessToken(SERVICE_ACCOUNT_KEY);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "서비스 계정 키를 확인하세요",
        step: "auth",
        details: message,
      }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Step 2: Call Vertex AI
  const url = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${LOCATION}/publishers/google/models/${MODEL}:generateContent`;

  let apiResponse: Response;
  try {
    apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: TEST_SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Evaluate this factory:\n${JSON.stringify(TEST_FACTORY)}\n\nProduct being searched: women's knit dress`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Vertex AI 호출 실패 (timeout 또는 네트워크 오류)",
        step: "api_call",
        details: message,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Handle API error responses
  if (!apiResponse.ok) {
    const errorBody = await apiResponse.text();
    const errorMessages: Record<number, string> = {
      401: "서비스 계정 키를 확인하세요",
      403: "Vertex AI API 활성화 또는 IAM 역할을 확인하세요",
      404: "리전 또는 모델명을 확인하세요",
      429: "Vertex AI 할당량 초과",
    };
    return new Response(
      JSON.stringify({
        success: false,
        error:
          errorMessages[apiResponse.status] ||
          `Unexpected error (${apiResponse.status})`,
        step: "api_call",
        details: errorBody,
      }),
      {
        status: apiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Step 3: Parse response
  let scoringResult: unknown;
  try {
    const data = await apiResponse.json();
    const text = data.candidates[0].content.parts[0].text;
    scoringResult = JSON.parse(text);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Vertex AI 응답 파싱 실패",
        step: "parse",
        details: message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Success
  const latencyMs = Date.now() - startTime;
  return new Response(
    JSON.stringify({
      success: true,
      model: MODEL,
      location: LOCATION,
      auth: "ok",
      scoring_result: scoringResult,
      latency_ms: latencyMs,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
