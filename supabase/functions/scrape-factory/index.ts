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
    const { url, scoring_criteria } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ error: "URL is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the page HTML
    const pageRes = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!pageRes.ok) {
      throw new Error(`Failed to fetch URL: ${pageRes.status}`);
    }

    const html = await pageRes.text();
    
    // Extract text content (strip HTML tags), limit to ~8000 chars
    const textContent = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build scoring criteria section for prompt
    let scoringPrompt = "";
    if (scoring_criteria && Array.isArray(scoring_criteria) && scoring_criteria.length > 0) {
      const criteriaList = scoring_criteria.map((c: any) => 
        `- "${c.name}" (id: ${c.id}, max_score: ${c.max_score}): ${c.description || "No description"}`
      ).join("\n");
      
      scoringPrompt = `

Additionally, score this vendor/factory on each of the following criteria. 
For each criterion, provide a score (integer from 0 to the max_score) and a brief note explaining your reasoning.
Base your scoring on what you can infer from the page content. If information is insufficient for a criterion, give a conservative middle score and note "정보 부족".

Scoring Criteria:
${criteriaList}

Include a "scores" array in your JSON response with objects like:
{ "criteria_id": "the-id", "score": 7, "notes": "reasoning in Korean" }`;
    }

    // Use AI to extract structured data + scoring
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
            content: `You are a data extraction and vendor evaluation assistant specializing in Asian suppliers for the North American wholesale fashion market (FashionGo).

Extract factory/supplier information from the provided webpage text. Return ONLY valid JSON with these fields (use empty string if not found):
{
  "name": "factory/company name",
  "country": "country",
  "city": "city or province",
  "description": "brief description of the company",
  "main_products": "comma-separated list of main products",
  "moq": "minimum order quantity",
  "lead_time": "production lead time",
  "contact_name": "contact person name",
  "contact_email": "email",
  "contact_phone": "phone number",
  "certifications": "comma-separated certifications"${scoringPrompt ? ',\n  "scores": []' : ""}
}${scoringPrompt}`
          },
          {
            role: "user",
            content: `Extract factory information${scoringPrompt ? " and evaluate scores" : ""} from this page (URL: ${url}):\n\n${textContent}`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    
    // Parse JSON from AI response (handle markdown code blocks)
    const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
    const extracted = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ success: true, data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("scrape-factory error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
