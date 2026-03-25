import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { trend_image_url, product_images } = await req.json();
    if (!trend_image_url || !product_images || !Array.isArray(product_images)) {
      return new Response(JSON.stringify({ error: 'trend_image_url and product_images[] are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build multimodal content with actual image references
    const content: any[] = [
      {
        type: "text",
        text: `You are a fashion product similarity expert. Look at the REFERENCE image first, then compare each PRODUCT image to it.

Score each product image from 0-100 based on visual similarity to the reference:
- 90-100: Nearly identical style, color, and silhouette
- 75-89: Same category and very similar style
- 55-74: Same general category but different style
- 30-54: Different category but some visual overlap
- 0-29: Completely different product type

CRITICAL: A sneaker reference should score highest with other sneakers, a dress with dresses, etc.
Consider: product type, silhouette shape, color palette, texture, and overall aesthetic.

REFERENCE TREND IMAGE:`
      },
      {
        type: "image_url",
        image_url: { url: trend_image_url }
      },
      {
        type: "text",
        text: `\n\nNow score each of these ${product_images.length} product images (return ONLY a JSON array of ${product_images.length} numbers):\n`
      }
    ];

    // Add each product image
    for (let i = 0; i < product_images.length; i++) {
      content.push({
        type: "text",
        text: `Product ${i + 1}:`
      });
      content.push({
        type: "image_url",
        image_url: { url: product_images[i] }
      });
    }

    content.push({
      type: "text",
      text: `\n\nReturn ONLY a JSON array of ${product_images.length} integer scores (0-100). Example: [85, 42, 91, 33, 78]`
    });

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        temperature: 0.1,
        max_tokens: 256,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Lovable AI error [${response.status}]: ${errorText}`);
    }

    const result = await response.json();
    const responseContent = result.choices?.[0]?.message?.content || '';

    // Parse the JSON array from the response
    const jsonMatch = responseContent.match(/\[[\d\s,]+\]/);
    if (!jsonMatch) {
      throw new Error(`Could not parse similarity scores: ${responseContent.substring(0, 200)}`);
    }

    const scores: number[] = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ scores }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('ai-image-similarity error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
