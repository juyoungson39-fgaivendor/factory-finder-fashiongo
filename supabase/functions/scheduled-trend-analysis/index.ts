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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active schedules
    const { data: schedules, error: schedError } = await supabase
      .from("trend_schedules")
      .select("*")
      .eq("is_active", true);

    if (schedError) throw schedError;
    if (!schedules || schedules.length === 0) {
      return new Response(JSON.stringify({ message: "No active schedules" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const results = [];

    for (const schedule of schedules) {
      try {
        // Step 1: Scrape trends
        const urls = [
          "https://www.fashiongo.net/trending",
          "https://www.fashiongo.net/Best-Sellers",
          "https://www.fashiongo.net/newarrivals",
        ];

        if (schedule.extra_categories && Array.isArray(schedule.extra_categories)) {
          schedule.extra_categories.forEach((cat: string) => {
            urls.push(`https://www.fashiongo.net/search?q=${encodeURIComponent(cat)}`);
          });
        }

        const scrapedTexts: string[] = [];
        for (const url of urls) {
          try {
            const res = await fetch(url, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
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
          results.push({ user_id: schedule.user_id, status: "error", message: "No pages scraped" });
          continue;
        }

        const combinedText = scrapedTexts.join("\n\n---\n\n").substring(0, 15000);

        // AI trend analysis
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
                content: `You are a fashion trend analyst for the North American wholesale fashion market (FashionGo). Analyze the provided content and return ONLY valid JSON:
{
  "trend_keywords": ["keyword1", "keyword2", ...],
  "trend_categories": ["category1", ...],
  "trending_styles": [{"name":"style","description":"한국어 설명","keywords":["terms"],"estimated_demand":"high|medium|low"}],
  "season_info": "현재 시즌 정보 (한국어)",
  "analysis_summary": "전체 트렌드 요약 (한국어, 2-3문장)"
}
Return 10-20 trend keywords and 5-10 categories.`
              },
              { role: "user", content: `Analyze FashionGo trends:\n\n${combinedText}` }
            ],
            temperature: 0.2,
          }),
        });

        if (!aiRes.ok) throw new Error(`AI failed: ${aiRes.status}`);

        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        const trendData = JSON.parse(jsonStr);

        // Save analysis
        const { data: analysis, error: insertErr } = await supabase.from("trend_analyses").insert({
          user_id: schedule.user_id,
          trend_keywords: trendData.trend_keywords || [],
          trend_categories: trendData.trend_categories || [],
          source_data: trendData,
          status: "analyzed",
        }).select().single();

        if (insertErr) throw insertErr;

        // Step 2: Match with factories
        const { data: factories } = await supabase
          .from("factories")
          .select("id, name, main_products, description, overall_score, status")
          .eq("user_id", schedule.user_id)
          .order("overall_score", { ascending: false });

        if (factories && factories.length > 0 && analysis) {
          const factoryList = factories.map(f => ({
            id: f.id, name: f.name,
            products: f.main_products?.join(", ") || "",
            description: f.description || "", score: f.overall_score, status: f.status,
          }));

          const matchAiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  content: `Match trending keywords to factory products. Return ONLY valid JSON:
{"matches":[{"factory_id":"uuid","factory_name":"name","matched_keywords":["kw"],"match_score":85,"reasoning":"한국어 매칭 이유"}]}
Only include factories with match_score >= 30. Sort by match_score desc.`
                },
                {
                  role: "user",
                  content: `Keywords: ${trendData.trend_keywords.join(", ")}\nCategories: ${(trendData.trend_categories || []).join(", ")}\nFactories:\n${JSON.stringify(factoryList)}`
                }
              ],
              temperature: 0.1,
            }),
          });

          if (matchAiRes.ok) {
            const matchData = await matchAiRes.json();
            const matchContent = matchData.choices?.[0]?.message?.content || "";
            const matchJsonMatch = matchContent.match(/```json\s*([\s\S]*?)```/) || matchContent.match(/\{[\s\S]*\}/);
            const matchJsonStr = matchJsonMatch ? (matchJsonMatch[1] || matchJsonMatch[0]) : matchContent;
            const matchResult = JSON.parse(matchJsonStr);

            if (matchResult.matches?.length > 0) {
              const inserts = matchResult.matches.map((m: any) => ({
                trend_analysis_id: analysis.id,
                factory_id: m.factory_id,
                matched_keywords: m.matched_keywords,
                match_score: m.match_score,
                ai_reasoning: m.reasoning,
                status: "suggested",
                user_id: schedule.user_id,
              }));
              await supabase.from("trend_matches").insert(inserts);
            }

            await supabase.from("trend_analyses").update({ status: "completed" }).eq("id", analysis.id);
          }
        }

        // Update schedule
        await supabase.from("trend_schedules").update({ last_run_at: new Date().toISOString() }).eq("id", schedule.id);
        results.push({ user_id: schedule.user_id, status: "success" });

      } catch (userErr: any) {
        console.error(`Error for user ${schedule.user_id}:`, userErr);
        results.push({ user_id: schedule.user_id, status: "error", message: userErr.message });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("scheduled-trend-analysis error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
