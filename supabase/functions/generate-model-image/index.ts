import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FAL_BASE = "https://queue.fal.run/fal-ai/fashn/tryon/v1.6";

async function pollForResult(statusUrl: string, falKey: string, maxWait = 120_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Key ${falKey}` },
    });
    const body = await res.json();

    if (body.status === "COMPLETED") {
      // Fetch the actual result
      const responseUrl = statusUrl.replace("/status", "/response");
      const resultRes = await fetch(responseUrl, {
        headers: { Authorization: `Key ${falKey}` },
      });
      return await resultRes.json();
    }

    if (body.status === "FAILED") {
      throw new Error(body.error || "fal.ai processing failed");
    }

    // Wait before polling again
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("fal.ai processing timed out");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FAL_KEY = Deno.env.get("FAL_KEY");
    if (!FAL_KEY) {
      throw new Error("FAL_KEY is not configured");
    }

    const { imageBase64, modelImageUrl } = await req.json();
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "imageBase64 is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Garment image: use the base64 data URL directly
    const garmentImage = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:image/png;base64,${imageBase64}`;

    // Build request body for FASHN virtual try-on v1.6
    const falBody: Record<string, unknown> = {
      garment_image: garmentImage,
      category: "auto",
      mode: "balanced",
      garment_photo_type: "auto",
      num_samples: 1,
    };

    // If a model image URL is provided (from vendor model settings), use it
    if (modelImageUrl) {
      falBody.model_image = modelImageUrl;
    }

    // Submit to fal.ai queue
    const submitRes = await fetch(FAL_BASE, {
      method: "POST",
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falBody),
    });

    if (!submitRes.ok) {
      const errText = await submitRes.text();
      console.error("fal.ai submit error:", submitRes.status, errText);
      if (submitRes.status === 422) {
        throw new Error("이미지 형식이 올바르지 않습니다. 다른 이미지를 시도해 주세요.");
      }
      throw new Error(`fal.ai submit error: ${submitRes.status}`);
    }

    const submitData = await submitRes.json();

    // If result is already available (synchronous response)
    if (submitData.images && submitData.images.length > 0) {
      return new Response(
        JSON.stringify({ success: true, generatedImageUrl: submitData.images[0].url }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Otherwise poll the queue
    const statusUrl = submitData.status_url;
    if (!statusUrl) {
      throw new Error("No status_url returned from fal.ai");
    }

    const result = await pollForResult(statusUrl, FAL_KEY);

    const generatedImageUrl = result.images?.[0]?.url;
    if (!generatedImageUrl) {
      throw new Error("fal.ai에서 이미지가 생성되지 않았습니다");
    }

    return new Response(
      JSON.stringify({ success: true, generatedImageUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-model-image error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
