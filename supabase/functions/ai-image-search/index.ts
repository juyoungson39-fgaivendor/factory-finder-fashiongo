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
    const { image_base64, direct_query, region, custom_keywords, moq_range, category_filter, scoring_criteria, user_id } = await req.json();
    if (!image_base64 && !direct_query) {
      return new Response(JSON.stringify({ error: "Image or search query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let imageAnalysis: any = null;
    let searchQueries: string[] = [];

    if (image_base64) {
      // Step 1: Analyze image with Gemini vision
      console.log("Step 1: Analyzing image with AI...");
      const analysisRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
              content: `You are a fashion product analyst. Analyze the image and extract search keywords for finding similar products on Alibaba.com.
Return ONLY valid JSON:
{
  "product_type": "e.g. women's dress, men's jacket",
  "style_keywords": ["keyword1", "keyword2", "keyword3"],
  "material": "e.g. cotton, polyester, silk",
  "color": "main color",
  "category": "e.g. Women's Clothing, Men's Clothing, Accessories",
  "search_queries": ["alibaba search query 1", "alibaba search query 2", "alibaba search query 3"],
  "description_ko": "Korean description of the product style"
}`
            },
            {
              role: "user",
              content: [
                { type: "text", text: "Analyze this fashion product image and extract search keywords for Alibaba:" },
                { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } }
              ]
            }
          ],
          temperature: 0.2,
        }),
      });

      if (!analysisRes.ok) {
        const errText = await analysisRes.text();
        console.error("AI analysis error:", analysisRes.status, errText);
        if (analysisRes.status === 429) {
          return new Response(JSON.stringify({ error: "AI 요청 제한 초과. 잠시 후 다시 시도해주세요." }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (analysisRes.status === 402) {
          return new Response(JSON.stringify({ error: "AI 크레딧 부족. 크레딧을 충전해주세요." }), {
            status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        throw new Error(`AI analysis failed: ${analysisRes.status}`);
      }

      const analysisData = await analysisRes.json();
      const analysisContent = analysisData.choices?.[0]?.message?.content || "";
      const jsonMatch = analysisContent.match(/```json\s*([\s\S]*?)```/) || analysisContent.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : analysisContent;
      imageAnalysis = JSON.parse(jsonStr);
      console.log("Image analysis:", JSON.stringify(imageAnalysis));
      searchQueries = imageAnalysis.search_queries || [`${imageAnalysis.product_type} ${imageAnalysis.material}`];
    } else if (direct_query) {
      // Text-based search mode
      searchQueries = [direct_query];
      imageAnalysis = {
        product_type: direct_query,
        style_keywords: direct_query.split(/[,\s]+/).filter(Boolean),
        material: "",
        color: "",
        category: category_filter || "",
        description_ko: `직접 검색: ${direct_query}`,
      };
    }

    // Append additional filters to search queries
    const regionMap: Record<string, string> = {
      guangdong: "Guangdong", zhejiang: "Zhejiang", jiangsu: "Jiangsu",
      fujian: "Fujian", shandong: "Shandong", shanghai: "Shanghai", hebei: "Hebei",
    };
    const categoryMap: Record<string, string> = {
      "womens-clothing": "women clothing", "mens-clothing": "men clothing",
      "kids-clothing": "kids clothing", accessories: "accessories",
      shoes: "shoes", bags: "bags", activewear: "activewear sportswear",
    };

    const extraTerms: string[] = [];
    if (region && region !== "all") extraTerms.push(regionMap[region] || region);
    if (category_filter && category_filter !== "all") extraTerms.push(categoryMap[category_filter] || category_filter);
    if (custom_keywords) extraTerms.push(custom_keywords);

    if (extraTerms.length > 0) {
      searchQueries = searchQueries.map(q => `${q} ${extraTerms.join(" ")}`);
    }

    // Step 2: Search Alibaba for each query
    console.log("Step 2: Searching Alibaba...");
    const factories: any[] = [];

    for (const query of searchQueries.slice(0, 2)) {
      try {
        const searchUrl = `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(query)}&viewtype=G`;
        const searchRes = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        if (searchRes.ok) {
          const html = await searchRes.text();
          const textContent = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .substring(0, 12000);

          // Use AI to extract factory/supplier info from search results
          const extractRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  content: `You are an Alibaba product search result parser. Extract supplier/factory information from Alibaba search results.
Return ONLY valid JSON array of up to 5 suppliers:
[{
  "name": "supplier/factory name",
  "country": "China",
  "city": "city or province",
  "description": "brief description",
  "main_products": ["product1", "product2"],
  "moq": "minimum order quantity",
  "lead_time": "estimated lead time",
  "source_url": "alibaba.com supplier URL if found",
  "price_range": "price range if available",
  "years_in_business": "years if found",
  "certifications": ["cert1", "cert2"]
}]
If no suppliers are found, return an empty array [].`
                },
                {
                  role: "user",
                  content: `Extract supplier information from these Alibaba search results for query "${query}":\n\n${textContent}`
                }
              ],
              temperature: 0.1,
            }),
          });

          if (extractRes.ok) {
            const extractData = await extractRes.json();
            const extractContent = extractData.choices?.[0]?.message?.content || "";
            const extractMatch = extractContent.match(/```json\s*([\s\S]*?)```/) || extractContent.match(/\[[\s\S]*\]/);
            const extractStr = extractMatch ? (extractMatch[1] || extractMatch[0]) : extractContent;
            try {
              const suppliers = JSON.parse(extractStr);
              if (Array.isArray(suppliers)) {
                factories.push(...suppliers);
              }
            } catch (e) {
              console.error("Failed to parse suppliers:", e);
            }
          }
        }
      } catch (e) {
        console.error(`Search error for query "${query}":`, e);
      }
    }

    // Deduplicate by name
    const uniqueFactories = factories.reduce((acc: any[], f: any) => {
      if (f.name && !acc.find(a => a.name.toLowerCase() === f.name.toLowerCase())) {
        acc.push(f);
      }
      return acc;
    }, []);

    console.log(`Found ${uniqueFactories.length} unique factories`);

    // Step 3: Score each factory with AI
    console.log("Step 3: Scoring factories...");
    let scoringCriteriaPrompt = "";
    if (scoring_criteria && Array.isArray(scoring_criteria) && scoring_criteria.length > 0) {
      const criteriaList = scoring_criteria.map((c: any) =>
        `- "${c.name}" (id: ${c.id}, max_score: ${c.max_score}, weight: ${c.weight}): ${c.description || "No description"}`
      ).join("\n");
      scoringCriteriaPrompt = `\nScoring Criteria:\n${criteriaList}`;
    }

    const scoredFactories = [];
    for (const factory of uniqueFactories.slice(0, 8)) {
      try {
        const scoreRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                content: `You are a vendor evaluation specialist for the North American wholesale fashion market.
Score this factory/supplier based on the available information. Consider factors like product quality indicators, MOQ suitability, certifications, experience, and reliability signals.
${scoringCriteriaPrompt}

Return ONLY valid JSON:
{
  "overall_score": 0-100,
  "reasoning_ko": "Korean explanation of scoring",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "scores": [{ "criteria_id": "id", "score": 0, "notes": "reason in Korean" }]
}`
              },
              {
                role: "user",
                content: `Evaluate this factory:\n${JSON.stringify(factory)}\n\nProduct being searched: ${imageAnalysis.product_type}, Style: ${imageAnalysis.style_keywords?.join(", ")}`
              }
            ],
            temperature: 0.2,
          }),
        });

        if (scoreRes.ok) {
          const scoreData = await scoreRes.json();
          const scoreContent = scoreData.choices?.[0]?.message?.content || "";
          const scoreMatch = scoreContent.match(/```json\s*([\s\S]*?)```/) || scoreContent.match(/\{[\s\S]*\}/);
          const scoreStr = scoreMatch ? (scoreMatch[1] || scoreMatch[0]) : scoreContent;
          const scoreResult = JSON.parse(scoreStr);
          scoredFactories.push({
            ...factory,
            ...scoreResult,
          });
        }
      } catch (e) {
        console.error(`Scoring error for ${factory.name}:`, e);
        scoredFactories.push({ ...factory, overall_score: 0, reasoning_ko: "스코어링 실패" });
      }
    }

    // Sort by score descending
    scoredFactories.sort((a, b) => (b.overall_score || 0) - (a.overall_score || 0));

    // Step 4: Auto-add factories with score >= 60 to user's factory list
    const autoAdded: string[] = [];
    if (user_id) {
      for (const factory of scoredFactories) {
        if ((factory.overall_score || 0) >= 60) {
          try {
            const { data, error } = await supabase.from("factories").insert({
              name: factory.name,
              country: factory.country || "China",
              city: factory.city || "",
              description: factory.description || "",
              main_products: Array.isArray(factory.main_products) ? factory.main_products : factory.main_products?.split(",").map((s: string) => s.trim()) || [],
              moq: factory.moq || "",
              lead_time: factory.lead_time || "",
              source_url: factory.source_url || "",
              source_platform: "alibaba",
              certifications: Array.isArray(factory.certifications) ? factory.certifications : [],
              overall_score: factory.overall_score || 0,
              status: "ai_discovered",
              user_id: user_id,
              scraped_data: {
                ai_search_source: "image_search",
                image_analysis: imageAnalysis,
                ai_reasoning: factory.reasoning_ko,
                strengths: factory.strengths,
                weaknesses: factory.weaknesses,
                price_range: factory.price_range,
              },
            }).select("id").single();

            if (!error && data) {
              autoAdded.push(data.id);
              factory.added_to_list = true;
              factory.factory_id = data.id;

              // Insert individual scores if criteria provided
              if (factory.scores && Array.isArray(factory.scores)) {
                for (const s of factory.scores) {
                  await supabase.from("factory_scores").insert({
                    factory_id: data.id,
                    criteria_id: s.criteria_id,
                    score: s.score,
                    notes: s.notes,
                  });
                }
              }
            } else if (error) {
              console.error("Insert factory error:", error);
            }
          } catch (e) {
            console.error("Auto-add error:", e);
          }
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      image_analysis: imageAnalysis,
      factories: scoredFactories,
      auto_added_count: autoAdded.length,
      auto_added_ids: autoAdded,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("ai-image-search error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
