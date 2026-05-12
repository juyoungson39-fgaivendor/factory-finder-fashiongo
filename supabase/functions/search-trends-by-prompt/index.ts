import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are a query understanding system for a fashion sourcing platform.
Convert the user's natural language input into a JSON filter object.

Rules:
- Output keywords/categories/styles in BOTH Korean AND English when possible.
  Example: 'Y2K 크롭탑' → keywords: ['y2k', '크롭탑', 'crop top']
- Normalize all strings to lowercase except Korean (Korean keeps original).
- Categories should map to FashionGo top-level:
  Tops/Dresses/Bottoms/Outerwear/Shoes/Accessories/Bags/Activewear
  Provide both English and Korean equivalents:
  ['Tops','상의'], ['Dresses','원피스'], ['Bottoms','하의'], ['Outerwear','아우터'],
  ['Shoes','신발'], ['Accessories','액세서리'], ['Bags','가방'], ['Activewear','활동복'].
- platforms: only ['zara','amazon','shein','pinterest','tiktok','google','fashiongo','vogue','elle','wwd','hypebeast','highsnobiety','footwearnews','instagram'] are valid. null if not mentioned.
- season: only ['spring','summer','fall','winter']. null if not mentioned.
- year: integer if mentioned, else null.
- price_range: { min, max } if mentioned, else null.
- months_back: default 6 if user didn't mention any time window.
- For non-fashion input (gaming, food, etc), return empty arrays for keywords/categories/styles but still produce a valid JSON.

Output ONLY the JSON object, no prose.`;

interface ExtractedFilters {
  keywords: string[];
  categories: string[];
  styles: string[];
  platforms: string[] | null;
  season: string | null;
  year: number | null;
  price_range: { min: number; max: number } | null;
  months_back: number;
}

async function extractFilters(prompt: string): Promise<ExtractedFilters> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt || "" },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway failed (${res.status}): ${t}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const m = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
  const jsonStr = m ? (m[1] || m[0]) : content;
  const parsed = JSON.parse(jsonStr);

  return {
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(Boolean) : [],
    categories: Array.isArray(parsed.categories) ? parsed.categories.filter(Boolean) : [],
    styles: Array.isArray(parsed.styles) ? parsed.styles.filter(Boolean) : [],
    platforms: Array.isArray(parsed.platforms) && parsed.platforms.length ? parsed.platforms : null,
    season: typeof parsed.season === "string" ? parsed.season : null,
    year: typeof parsed.year === "number" ? parsed.year : null,
    price_range: parsed.price_range && typeof parsed.price_range === "object" ? parsed.price_range : null,
    months_back: typeof parsed.months_back === "number" ? parsed.months_back : 6,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, limit } = await req.json().catch(() => ({ prompt: "", limit: 100 }));
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || `Bearer ${anonKey}`;
    const supabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Step A: extract filters via LLM
    let filters: ExtractedFilters;
    try {
      filters = await extractFilters(String(prompt || ""));
    } catch (e) {
      console.error("[extract] failed:", e);
      filters = {
        keywords: [], categories: [], styles: [],
        platforms: null, season: null, year: null,
        price_range: null, months_back: 6,
      };
    }

    const hasAny =
      filters.keywords.length + filters.categories.length + filters.styles.length > 0;

    let trendIds: string[] = [];
    let totalScanned = 0;

    if (hasAny) {
      // Step B: scored SELECT via RPC
      const { data: rows, error } = await supabase.rpc("search_trends_by_prompt_sql", {
        p_keywords: filters.keywords,
        p_categories: filters.categories,
        p_styles: filters.styles,
        p_platforms: filters.platforms ?? [],
        p_months_back: filters.months_back,
        p_limit: safeLimit,
      });
      if (error) {
        console.error("[rpc] error:", error);
        throw new Error(`Trend search failed: ${error.message}`);
      }
      trendIds = (rows || []).map((r: any) => r.id);

      // Total scanned (within window) for reporting
      const sinceIso = new Date(Date.now() - filters.months_back * 30 * 86400_000).toISOString();
      const { count } = await supabase
        .from("trend_analyses")
        .select("id", { count: "exact", head: true })
        .eq("status", "analyzed")
        .gte("created_at", sinceIso);
      totalScanned = count || 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          trend_ids: trendIds,
          extracted_filters: filters,
          matched_count: trendIds.length,
          total_scanned: totalScanned,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("search-trends-by-prompt error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
