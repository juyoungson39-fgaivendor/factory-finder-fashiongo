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

    // Use Gemini to analyze visual similarity between trend image and product images
    const prompt = `You are an expert fashion image analyst. I will give you a reference fashion trend image URL and a list of product image URLs.

For each product image, analyze the visual similarity to the trend image based on:
- Overall style and aesthetic match
- Color palette similarity
- Silhouette/shape similarity
- Material/texture appearance

Return a JSON array of similarity scores (0-100) in the same order as the product images.
Only return the JSON array, nothing else. Example: [85, 72, 91, 45, 68]

Reference trend image: ${trend_image_url}

Product images to compare (${product_images.length} images):
${product_images.map((url: string, i: number) => `${i + 1}. ${url}`).join('\n')}

Return ONLY a JSON array of ${product_images.length} numbers (0-100 similarity scores):`;

    const response = await fetch('https://ai.lovable.dev/api/v1/chat/completions', {
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
            content: prompt,
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
    const content = result.choices?.[0]?.message?.content || '';

    // Parse the JSON array from the response
    const jsonMatch = content.match(/\[[\d\s,]+\]/);
    if (!jsonMatch) {
      throw new Error(`Could not parse similarity scores from AI response: ${content.substring(0, 200)}`);
    }

    const scores: number[] = JSON.parse(jsonMatch[0]);

    // Ensure we have the right number of scores
    if (scores.length !== product_images.length) {
      console.warn(`Expected ${product_images.length} scores, got ${scores.length}`);
    }

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
