import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function needsJsRendering(url: string): boolean {
  return ["1688.com", "alibaba.com", "taobao.com", "tmall.com"].some((d) => url.includes(d));
}

async function scrapeWithFirecrawl(url: string): Promise<{ markdown: string; screenshot?: string }> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  console.log("Using Firecrawl for:", url);
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown", "screenshot"],
      onlyMainContent: false,
      waitFor: 15000,
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(`Firecrawl failed: ${data.error || response.status}`);

  const md = data.data?.markdown || data.markdown || "";
  const screenshot = data.data?.screenshot || data.screenshot || "";

  const hasMeaningfulContent = md.length > 200 && !md.includes("unusual traffic") && !md.includes("slide to verify");

  if (hasMeaningfulContent) {
    return { markdown: md.substring(0, 15000), screenshot };
  }

  // Markdown blocked but screenshot might still work
  if (screenshot) {
    console.log("Markdown blocked by CAPTCHA, falling back to Firecrawl screenshot");
    return { markdown: "", screenshot };
  }

  throw new Error("Firecrawl returned CAPTCHA or insufficient content");
}

async function scrapeWithFetch(url: string): Promise<string> {
  const pageRes = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      Accept: "text/html",
    },
  });
  if (!pageRes.ok) throw new Error(`Failed to fetch: ${pageRes.status}`);

  const html = await pageRes.text();

  // Check for CAPTCHA
  if (html.includes("punish-component") || html.includes("slide to verify") || html.length < 3000) {
    throw new Error("CAPTCHA_BLOCKED");
  }

  let embeddedData = "";
  const jsonPatterns = [
    /window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});/,
    /window\.rawData\s*=\s*(\{[\s\S]*?\});/,
  ];
  for (const pattern of jsonPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try {
        JSON.parse(match[1]);
        embeddedData = `\n[Embedded Data]:\n${match[1].substring(0, 5000)}`;
        break;
      } catch { /* skip */ }
    }
  }

  const metaTags: string[] = [];
  const metaRegex = /<meta[^>]+(name|property)="([^"]*)"[^>]+content="([^"]*)"/gi;
  let m;
  while ((m = metaRegex.exec(html)) !== null) metaTags.push(`${m[2]}: ${m[3]}`);

  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 8000);

  return `${text}${metaTags.length ? "\n[Meta]:\n" + metaTags.join("\n") : ""}${embeddedData}`;
}

function buildSystemPrompt(url: string, scoringPrompt: string, isScreenshot: boolean): string {
  const is1688 = url.includes("1688.com");
  const isAlibaba = url.includes("alibaba.com");

  let platformHints = "";
  if (is1688) {
    platformHints = `
This is a 1688.com (Chinese wholesale) supplier page.
Key data points:
- Company name (公司名称): e.g. "广州XX服装贸易有限公司"
- 入驻年限 (years), 回头率 (repeat rate), 履约率 (fulfillment rate), 创立时间 (founding date)
- Service scores: 综合服务分, 售后体验, 商品体验, 物流体验, 咨询体验 (each 1-5)
- Address (地址): extract city from province info
- 粉丝数 (followers)
- Country is always "China" for 1688.com
- Product categories from product listings/images`;
  } else if (isAlibaba) {
    platformHints = `
This is Alibaba.com. Look for: company name, location, year established, main products, MOQ, lead time, Gold Supplier status, certifications.`;
  }

  const inputType = isScreenshot
    ? "The user has provided a SCREENSHOT of the supplier page. Carefully read all visible text, numbers, and data from the image."
    : "Extract from the provided webpage text content.";

  return `You are a data extraction assistant for Asian fashion suppliers.
${platformHints}
${inputType}

Return ONLY valid JSON (no markdown code blocks) with ALL these fields (use "" if not found):
{
  "name": "company name (keep Chinese if from Chinese site)",
  "country": "country",
  "city": "city",
  "description": "company description in Korean (2-3 sentences)",
  "main_products": "comma-separated product categories",
  "moq": "minimum order quantity",
  "lead_time": "lead time",
  "contact_name": "contact person",
  "contact_email": "email",
  "contact_phone": "phone",
  "contact_wechat": "WeChat ID",
  "certifications": "certifications"${scoringPrompt ? ',\n  "scores": []' : ""}
}

CRITICAL: Extract ALL visible data. For 1688 pages, the company name, service scores, address, follower count, and founding date are always visible. DO NOT return empty fields if the data is visible in the content.${scoringPrompt}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, scoring_criteria, screenshot_base64 } = await req.json();
    if (!url && !screenshot_base64) {
      return new Response(JSON.stringify({ error: "URL or screenshot is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build scoring prompt
    let scoringPrompt = "";
    if (scoring_criteria?.length) {
      const list = scoring_criteria
        .map((c: any) => `- "${c.name}" (id: ${c.id}, max: ${c.max_score}): ${c.description || "N/A"}`)
        .join("\n");
      scoringPrompt = `\n\nAlso score this vendor on:\n${list}\nInclude "scores": [{"criteria_id":"id","score":N,"notes":"Korean reasoning"}]`;
    }

    let pageContent: string | null = null;
    let captchaBlocked = false;
    let firecrawlScreenshot: string | null = null;

    // If screenshot provided, use vision directly
    if (!screenshot_base64 && url) {
      // Try scraping
      try {
        if (needsJsRendering(url) && Deno.env.get("FIRECRAWL_API_KEY")) {
          const result = await scrapeWithFirecrawl(url);
          pageContent = result.markdown || null;
          firecrawlScreenshot = result.screenshot || null;

          // If no meaningful markdown but we have a screenshot, use it
          if (!pageContent && firecrawlScreenshot) {
            console.log("Using Firecrawl screenshot as fallback for vision extraction");
          }
        } else {
          pageContent = await scrapeWithFetch(url);
        }
      } catch (e: any) {
        console.warn("Scraping failed:", e.message);
        if (e.message === "CAPTCHA_BLOCKED" || e.message.includes("CAPTCHA") || e.message.includes("insufficient")) {
          captchaBlocked = true;
        }
        // Try fallback
        if (!captchaBlocked) {
          try {
            pageContent = await scrapeWithFetch(url);
          } catch {
            captchaBlocked = true;
          }
        }
      }
    }

    // Determine the effective screenshot: user-provided > firecrawl-captured
    const effectiveScreenshot = screenshot_base64 || firecrawlScreenshot;

    // If captcha blocked and no screenshot at all, return special error
    if (captchaBlocked && !effectiveScreenshot) {
      return new Response(
        JSON.stringify({
          error: "CAPTCHA_BLOCKED",
          message: "이 사이트는 봇 차단이 활성화되어 있습니다. 페이지 스크린샷을 업로드해주세요.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use vision if we have a screenshot and no meaningful text content
    const useVision = !!effectiveScreenshot && (!pageContent || pageContent.length < 200);
    const systemPrompt = buildSystemPrompt(url || "", scoringPrompt, useVision);

    // Build messages
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (screenshot_base64) {
      // Use vision with screenshot
      console.log("Using Gemini Vision with screenshot");
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract all factory/supplier information from this screenshot${url ? ` (URL: ${url})` : ""}. Read every visible text, number, and data point carefully.${scoringPrompt ? " Also evaluate scores." : ""}`,
          },
          {
            type: "image_url",
            image_url: {
              url: screenshot_base64.startsWith("data:")
                ? screenshot_base64
                : `data:image/png;base64,${screenshot_base64}`,
            },
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Extract factory info${scoringPrompt ? " and scores" : ""} from (URL: ${url}):\n\n${pageContent}`,
      });
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        temperature: 0.1,
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
