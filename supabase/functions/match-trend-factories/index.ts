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

    const { trend_keywords, trend_categories, trend_analysis_id } = await req.json();

    if (!trend_keywords || !trend_analysis_id) {
      return new Response(JSON.stringify({ error: "trend_keywords and trend_analysis_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch user's factories
    const { data: factories, error: factError } = await supabase
      .from("factories")
      .select("id, name, main_products, description, overall_score, status")
      .order("overall_score", { ascending: false });

    if (factError) throw factError;
    if (!factories || factories.length === 0) {
      return new Response(JSON.stringify({ success: true, matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const factoryList = factories.map((f) => ({
      id: f.id,
      name: f.name,
      products: f.main_products?.join(", ") || "",
      description: f.description || "",
      score: f.overall_score,
      status: f.status,
    }));

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
            content: `You are a fashion product matching expert. Match trending keywords/categories to factory product catalogs.

For each factory that has products matching the trend keywords, create a match entry. Consider:
- Direct keyword matches in main_products
- Related/similar product categories
- Seasonal relevance

Return ONLY valid JSON:
{
  "matches": [
    {
      "factory_id": "uuid",
      "factory_name": "name",
      "matched_keywords": ["keyword1", "keyword2"],
      "match_score": 85,
      "reasoning": "매칭 이유를 한국어로 설명 (1-2 문장)"
    }
  ]
}

match_score: 0-100 based on relevance. Only include factories with score >= 30.
Sort by match_score descending.`
          },
          {
            role: "user",
            content: `Trend Keywords: ${trend_keywords.join(", ")}
Trend Categories: ${(trend_categories || []).join(", ")}

Factories:
${JSON.stringify(factoryList, null, 2)}`
          }
        ],
        temperature: 0.1,
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

    // Save matches to DB
    const matchInserts = (result.matches || []).map((m: any) => ({
      trend_analysis_id,
      factory_id: m.factory_id,
      matched_keywords: m.matched_keywords,
      match_score: m.match_score,
      ai_reasoning: m.reasoning,
      status: "suggested",
      user_id: user.id,
    }));

    if (matchInserts.length > 0) {
      const { error: insertError } = await supabase
        .from("trend_matches")
        .insert(matchInserts);
      if (insertError) {
        console.error("Insert error:", insertError);
      }
    }

    // Update analysis status
    await supabase
      .from("trend_analyses")
      .update({ status: "completed" })
      .eq("id", trend_analysis_id);

    return new Response(JSON.stringify({ success: true, matches: result.matches || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("match-trend-factories error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
