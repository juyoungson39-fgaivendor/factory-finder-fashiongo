import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Detect if URL needs JS rendering (SPA sites)
function needsJsRendering(url: string): boolean {
  const jsRenderedDomains = ["1688.com", "alibaba.com", "taobao.com", "tmall.com"];
  return jsRenderedDomains.some((d) => url.includes(d));
}

// Scrape using Firecrawl (handles JS-rendered pages)
async function scrapeWithFirecrawl(url: string): Promise<string> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  console.log("Using Firecrawl for JS-rendered page:", url);

  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "html"],
      onlyMainContent: false,
      waitFor: 8000,
      location: { country: "CN", languages: ["zh-CN", "en"] },
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error("Firecrawl error:", JSON.stringify(data));
    throw new Error(`Firecrawl failed: ${data.error || response.status}`);
  }

  // Prefer markdown for cleaner AI parsing, fall back to stripped HTML
  const markdown = data.data?.markdown || data.markdown || "";
  const html = data.data?.html || data.html || "";

  if (markdown && markdown.length > 100) {
    console.log(`Firecrawl returned ${markdown.length} chars of markdown`);
    return markdown.substring(0, 15000);
  }

  // Fallback: strip HTML
  const stripped = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  console.log(`Firecrawl HTML fallback: ${stripped.length} chars`);
  return stripped.substring(0, 15000);
}

// Scrape using simple fetch (for static pages)
async function scrapeWithFetch(url: string): Promise<string> {
  console.log("Using simple fetch for:", url);
  const pageRes = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!pageRes.ok) throw new Error(`Failed to fetch URL: ${pageRes.status}`);

  const html = await pageRes.text();

  // Try to extract embedded JSON data (common in Chinese e-commerce sites)
  let embeddedData = "";
  const jsonPatterns = [
    /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});/,
    /window\.rawData\s*=\s*(\{[\s\S]*?\});/,
    /var\s+data\s*=\s*(\{[\s\S]*?\});/,
    /"offerDetail"\s*:\s*(\{[\s\S]*?\})\s*[,;]/,
  ];
  for (const pattern of jsonPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        const parsed = JSON.parse(match[1]);
        embeddedData = `\n[Embedded JSON Data]:\n${JSON.stringify(parsed).substring(0, 5000)}`;
        break;
      } catch {
        // Not valid JSON, continue
      }
    }
  }

  // Also extract meta tags
  const metaTags: string[] = [];
  const metaRegex = /<meta[^>]+(name|property|itemprop)="([^"]*)"[^>]+content="([^"]*)"/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(html)) !== null) {
    metaTags.push(`${metaMatch[2]}: ${metaMatch[3]}`);
  }
  const metaStr = metaTags.length > 0 ? `\n[Meta Tags]:\n${metaTags.join("\n")}` : "";

  const textContent = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 8000);

  return `${textContent}${metaStr}${embeddedData}`;
}

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

    // Choose scraping method based on URL
    let pageContent: string;
    const useFirecrawl = needsJsRendering(url);

    if (useFirecrawl && Deno.env.get("FIRECRAWL_API_KEY")) {
      try {
        pageContent = await scrapeWithFirecrawl(url);
      } catch (e) {
        console.warn("Firecrawl failed, falling back to fetch:", e);
        pageContent = await scrapeWithFetch(url);
      }
    } else {
      pageContent = await scrapeWithFetch(url);
    }

    if (!pageContent || pageContent.length < 50) {
      throw new Error("Could not extract meaningful content from the page");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Detect platform for specialized prompts
    const is1688 = url.includes("1688.com");
    const isAlibaba = url.includes("alibaba.com");

    // Build scoring criteria section
    let scoringPrompt = "";
    if (scoring_criteria && Array.isArray(scoring_criteria) && scoring_criteria.length > 0) {
      const criteriaList = scoring_criteria
        .map(
          (c: any) =>
            `- "${c.name}" (id: ${c.id}, max_score: ${c.max_score}): ${c.description || "No description"}`
        )
        .join("\n");

      scoringPrompt = `

Additionally, score this vendor/factory on each of the following criteria.
For each criterion, provide a score (integer from 0 to the max_score) and a brief note explaining your reasoning.
Base your scoring on what you can infer from the page content. If information is insufficient, give a conservative middle score and note "정보 부족".

Scoring Criteria:
${criteriaList}

Include a "scores" array in your JSON response with objects like:
{ "criteria_id": "the-id", "score": 7, "notes": "reasoning in Korean" }`;
    }

    // Platform-specific extraction hints
    let platformHints = "";
    if (is1688) {
      platformHints = `
This is a 1688.com (Chinese wholesale) supplier page. Key data points to look for:
- Company name (公司名称): Usually in the page header, e.g. "广州XX服装贸易有限公司"
- Business metrics: 入驻年限 (years on platform), 回头率 (repeat buyer rate), 履约率 (fulfillment rate)
- Service scores: 综合服务分, 售后体验, 商品体验, 物流体验, 咨询体验 (each scored 1-5)
- Address (地址): Province + City, e.g. "广东海珠区..."
- Followers count (粉丝数)
- Founding date (成立时间)
- Company description
- Main product categories from product listings
- For country, it's always "China" for 1688.com
- Extract the city from the address (e.g. "广东海珠区" → city: "广州", country: "China")
- The "contact_wechat" field can store the WeChat ID if visible
`;
    } else if (isAlibaba) {
      platformHints = `
This is an Alibaba.com international supplier page. Look for:
- Company name, location, established year
- Main products, MOQ, lead time
- Gold Supplier status, Trade Assurance, verified info
- Response rate, on-time delivery rate
- Company certifications (ISO, BSCI, etc.)
`;
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a data extraction and vendor evaluation assistant specializing in Asian suppliers for the North American wholesale fashion market (FashionGo).
${platformHints}
Extract factory/supplier information from the provided webpage content. Return ONLY valid JSON with these fields (use empty string "" if not found, do NOT omit fields):
{
  "name": "factory/company name (keep original Chinese name if from Chinese site)",
  "country": "country (e.g. China)",
  "city": "city name in English or Chinese",
  "description": "company description in Korean (translate if needed, 2-3 sentences)",
  "main_products": "comma-separated list of main product categories",
  "moq": "minimum order quantity if found",
  "lead_time": "production/delivery lead time if found",
  "contact_name": "contact person name",
  "contact_email": "email address",
  "contact_phone": "phone number",
  "contact_wechat": "WeChat ID if found",
  "certifications": "comma-separated certifications",
  "platform_metrics": {
    "years_on_platform": "",
    "repeat_buyer_rate": "",
    "fulfillment_rate": "",
    "overall_service_score": "",
    "followers": "",
    "founding_date": ""
  }${scoringPrompt ? ',\n  "scores": []' : ""}
}

IMPORTANT:
- Extract ALL available data, even partial information is valuable
- For Chinese pages, keep company names in Chinese but translate descriptions to Korean
- Do NOT return empty JSON if there's any usable content
- If the page shows product images/listings, list the product categories in main_products${scoringPrompt}`,
          },
          {
            role: "user",
            content: `Extract factory information${scoringPrompt ? " and evaluate scores" : ""} from this page (URL: ${url}):\n\n${pageContent}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI error:", aiRes.status, errText);
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "AI rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI request failed: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
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
