import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Try multiple HF API URL formats for CLIP
const HF_API_URLS = [
  "https://router.huggingface.co/hf-inference/models/openai/clip-vit-base-patch32",
  "https://api-inference.huggingface.co/models/sentence-transformers/clip-ViT-B-32",
  "https://api-inference.huggingface.co/models/google/vit-base-patch16-224",
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const HF_TOKEN = Deno.env.get('HUGGINGFACE_API_TOKEN');
    if (!HF_TOKEN) {
      throw new Error('HUGGINGFACE_API_TOKEN is not configured');
    }

    const { image_url } = await req.json();
    if (!image_url) {
      return new Response(JSON.stringify({ error: 'image_url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Download image
    const imageResponse = await fetch(image_url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch image: ${imageResponse.status}`);
    }
    const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Try each API URL until one works
    let embedding: number[] | null = null;
    let lastError = '';

    for (const apiUrl of HF_API_URLS) {
      try {
        console.log(`Trying HF API: ${apiUrl}`);
        const hfResponse = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${HF_TOKEN}`,
            'Content-Type': contentType,
          },
          body: imageBytes,
        });

        if (hfResponse.ok) {
          const result = await hfResponse.json();
          // Handle different response formats
          if (Array.isArray(result)) {
            // Could be [[...]] or [...] 
            embedding = Array.isArray(result[0]) ? result[0] : result;
          } else if (result && typeof result === 'object') {
            embedding = result.embedding || result;
          }
          if (embedding && embedding.length > 0) {
            console.log(`Success with ${apiUrl}, embedding dim: ${embedding.length}`);
            break;
          }
        } else {
          const errText = await hfResponse.text().catch(() => 'unknown');
          lastError = `${apiUrl} returned ${hfResponse.status}: ${errText.substring(0, 200)}`;
          console.log(lastError);
        }
      } catch (e) {
        lastError = `${apiUrl} error: ${e.message}`;
        console.log(lastError);
      }
    }

    if (!embedding || embedding.length === 0) {
      throw new Error(`All HF API endpoints failed. Last error: ${lastError}`);
    }

    return new Response(JSON.stringify({ embedding }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('clip-embedding error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
