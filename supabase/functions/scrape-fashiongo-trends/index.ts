import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { categories, prompt } = await req.json();
    
    // Scrape FashionGo trending/best sellers pages
    const urls = [
      "https://www.fashiongo.net/trending",
      "https://www.fashiongo.net/Best-Sellers",
      "https://www.fashiongo.net/newarrivals",
    ];

    // Extract search terms from prompt or categories
    const searchTerms: string[] = [];
    if (prompt && typeof prompt === 'string') {
      // Extract key terms from the prompt for targeted search
      const terms = prompt.match(/[a-zA-Z]+(?:\s+[a-zA-Z]+)?/g) || [];
      searchTerms.push(...terms.filter(t => t.length > 3).slice(0, 5));
    }
    if (categories && Array.isArray(categories)) {
      searchTerms.push(...categories);
    }

    searchTerms.forEach((term: string) => {
      urls.push(`https://www.fashiongo.net/search?q=${encodeURIComponent(term)}`);
    });

    const scrapedTexts: string[] = [];

    for (const url of urls) {
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
          scrapedTexts.push(`[Source: ${url}]\n${text}`);
        }
      } catch (e) {
        console.error(`Failed to scrape ${url}:`, e);
      }
    }

    if (scrapedTexts.length === 0) {
      return new Response(JSON.stringify({ error: "Failed to scrape any FashionGo pages" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const combinedText = scrapedTexts.join("\n\n---\n\n").substring(0, 15000);

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
            content: `You are a fashion trend analyst specializing in the North American wholesale fashion market (FashionGo platform).

${prompt ? `The user is looking for: "${prompt}"

Based on this specific request, ` : ''}Analyze the provided FashionGo webpage content and extract current trending information. Return ONLY valid JSON:
{
  "trend_keywords": ["keyword1", "keyword2", ...],
  "trend_categories": ["category1", "category2", ...],
  "trending_styles": [
    {
      "name": "style name",
      "description": "brief description in Korean",
      "keywords": ["related", "search", "terms"],
      "estimated_demand": "high|medium|low"
    }
  ],
  "season_info": "current season/trend context in Korean",
  "analysis_summary": "overall trend analysis summary in Korean (2-3 sentences)"
}

Focus on:
- Product types, styles, materials that are trending${prompt ? ' and relevant to the user request' : ''}
- Color trends
- Category popularity
- Seasonal trends
- Price range trends
Return 10-20 trend keywords and 5-10 categories. All descriptions in Korean.`
          },
          {
            role: "user",
            content: `Analyze FashionGo trends from this data:\n\n${combinedText}`
          }
        ],
        temperature: 0.2,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const trends = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, data: trends }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("scrape-fashiongo-trends error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
