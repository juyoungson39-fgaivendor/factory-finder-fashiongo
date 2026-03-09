import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { factory_id, factory_name, source_url, main_products, matched_keywords } = await req.json();

    if (!factory_id) {
      return new Response(JSON.stringify({ error: "factory_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to scrape vendor page from FashionGo if source_url exists
    let scrapedContent = "";

    // Build search URLs for the vendor
    const searchUrls: string[] = [];
    if (source_url) {
      searchUrls.push(source_url);
    }
    if (factory_name) {
      searchUrls.push(`https://www.fashiongo.net/search?q=${encodeURIComponent(factory_name)}`);
      searchUrls.push(`https://www.fashiongo.net/search?q=${encodeURIComponent(factory_name)}&sort=BestSeller`);
    }
    if (main_products && main_products.length > 0) {
      // Search for vendor's main products on FashionGo
      const topProducts = main_products.slice(0, 3);
      for (const product of topProducts) {
        searchUrls.push(`https://www.fashiongo.net/search?q=${encodeURIComponent(product)}&sort=BestSeller`);
      }
    }

    for (const url of searchUrls.slice(0, 5)) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });
        if (res.ok) {
          const html = await res.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 5000);
          scrapedContent += `[Source: ${url}]\n${text}\n\n---\n\n`;
        }
      } catch (e) {
        console.error(`Failed to scrape ${url}:`, e);
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const contextInfo = `
Factory Name: ${factory_name || "Unknown"}
Main Products: ${(main_products || []).join(", ")}
Matched Trend Keywords: ${(matched_keywords || []).join(", ")}
Source URL: ${source_url || "N/A"}
`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a fashion wholesale product specialist. Based on scraped FashionGo data and factory information, generate a list of the vendor's best-selling / most relevant products that should be listed on FashionGo.

Return ONLY valid JSON:
{
  "products": [
    {
      "name": "Product name in English",
      "category": "One of: Tops, Dresses, Bottoms, Outerwear, Activewear, Accessories, Shoes, Plus Size, Swimwear, Sets",
      "wholesalePrice": "estimated price like 12.99",
      "retailPrice": "estimated retail price like 29.99",
      "sizes": "S, M, L, XL",
      "colors": "Black, White, Navy"
    }
  ],
  "vendor_summary": "벤더의 베스트 상품 요약을 한국어로 1-2문장"
}

Generate 3-8 realistic product entries based on:
1. The vendor's main product categories
2. Current trend keywords that match
3. Scraped product data from FashionGo
Make product names specific and market-ready. Estimate realistic wholesale prices for the North American market.`
          },
          {
            role: "user",
            content: `Generate best-selling product list for this vendor:\n\n${contextInfo}\n\nScraped FashionGo Data:\n${scrapedContent.substring(0, 12000)}`
          }
        ],
        temperature: 0.3,
      }),
    });

    if (!aiRes.ok) {
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const result = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("scrape-vendor-products error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
