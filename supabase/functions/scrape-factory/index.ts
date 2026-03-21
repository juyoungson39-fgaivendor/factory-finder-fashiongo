import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function needsJsRendering(url: string): boolean {
  return ["1688.com", "alibaba.com", "taobao.com", "tmall.com"].some((d) => url.includes(d));
}

const CAPTCHA_PATTERNS = [
  "slide to verify", "unusual traffic", "punish-component",
  "验证码", "请滑动", "网络异常", "安全验证", "人机验证",
  "captcha", "robot check", "access denied",
];

function isCaptchaContent(text: string): boolean {
  const lower = text.toLowerCase();
  return CAPTCHA_PATTERNS.some((p) => lower.includes(p));
}

// Strategy 1: Firecrawl direct scrape
async function scrapeWithFirecrawl(url: string): Promise<{ markdown: string; captcha: boolean }> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");

  for (let attempt = 1; attempt <= 2; attempt++) {
    console.log(`Firecrawl attempt ${attempt} for: ${url}`);
    const body: any = {
      url,
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: attempt === 1 ? 15000 : 20000,
      ...(attempt === 2 ? { location: { country: "CN", languages: ["zh"] } } : {}),
    };

    const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) { console.warn(`Attempt ${attempt} failed:`, data.error || response.status); continue; }

    const md = data.data?.markdown || data.markdown || "";
    if (isCaptchaContent(md) || md.length < 200) {
      console.warn(`Attempt ${attempt}: CAPTCHA or insufficient (${md.length} chars)`);
      continue;
    }
    return { markdown: md.substring(0, 15000), captcha: false };
  }
  return { markdown: "", captcha: true };
}

// Strategy 2: Firecrawl web search to find factory info from indexed pages
async function searchFactoryInfo(url: string): Promise<string | null> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return null;

  // Extract shop identifier from URL
  const shopMatch = url.match(/shop([a-z0-9]+)\./i) || url.match(/\/company\/([^/?]+)/i);
  const shopId = shopMatch?.[1] || "";

  // Build search queries to find this factory from other indexed sources
  const queries = [
    `site:1688.com ${shopId} 公司 联系`,
    `1688 ${shopId} supplier company profile`,
  ];

  let combinedContent = "";

  for (const query of queries) {
    try {
      console.log(`Search fallback: "${query}"`);
      const response = await fetch("https://api.firecrawl.dev/v1/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          limit: 3,
          scrapeOptions: { formats: ["markdown"] },
        }),
      });

      const data = await response.json();
      if (!response.ok) continue;

      const results = data.data || data.results || [];
      for (const r of results) {
        const md = r.markdown || r.content || "";
        if (md.length > 100 && !isCaptchaContent(md)) {
          combinedContent += `\n[Source: ${r.url || "search"}]\n${md.substring(0, 5000)}\n`;
        }
      }
    } catch (e) {
      console.warn("Search query failed:", e);
    }

    if (combinedContent.length > 2000) break;
  }

  return combinedContent.length > 200 ? combinedContent.substring(0, 15000) : null;
}

// Build alternative URLs for 1688 shops (company info page has more data)
function get1688CompanyUrls(url: string): string[] {
  const urls: string[] = [];
  const shopMatch = url.match(/(https?:\/\/shop[^/]+\.1688\.com)/i);
  if (shopMatch) {
    const base = shopMatch[1];
    urls.push(`${base}/page/companyinfo.htm`);
    urls.push(`${base}/page/contactinfo.htm`);
  }
  return urls;
}

// Build alternative URLs for Alibaba.com suppliers
function getAlibabaCompanyUrls(url: string): string[] {
  const urls: string[] = [];
  // Match alibaba.com company URLs like https://company.alibaba.com or https://www.alibaba.com/company/xxx
  const companyMatch = url.match(/(https?:\/\/[^/]+\.alibaba\.com)/i);
  if (companyMatch) {
    const base = companyMatch[1];
    urls.push(`${base}/company_profile.html`);
    urls.push(`${base}/contactinfo.html`);
  }
  return urls;
}

// Get platform-specific alternative URLs
function getPlatformCompanyUrls(url: string): { urls: string[]; platform: string } {
  if (url.includes("1688.com")) {
    return { urls: get1688CompanyUrls(url), platform: "1688" };
  }
  if (url.includes("alibaba.com")) {
    return { urls: getAlibabaCompanyUrls(url), platform: "alibaba" };
  }
  return { urls: [], platform: "other" };
}

// Download screenshot URL to base64
async function downloadScreenshotToBase64(screenshotUrl: string): Promise<string | null> {
  try {
    console.log("Downloading screenshot from URL...");
    const imgRes = await fetch(screenshotUrl);
    if (!imgRes.ok) {
      console.warn("Failed to download screenshot:", imgRes.status);
      return null;
    }
    const arrayBuf = await imgRes.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    console.log(`Screenshot converted to base64 (${base64.length} chars)`);
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.warn("Download error:", e);
    return null;
  }
}

// Strategy 3: Auto screenshot capture via Firecrawl
// Captures ALL available pages (company info + main) and returns multiple screenshots
async function captureScreenshots(url: string): Promise<{ images: string[]; sources: string[]; labels: string[] }> {
  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) return { images: [], sources: [], labels: [] };

  const { urls: companyUrls, platform } = getPlatformCompanyUrls(url);
  const urlsToTry = [...companyUrls, url];
  const uniqueUrls = [...new Set(urlsToTry)];

  const images: string[] = [];
  const sources: string[] = [];
  const labels: string[] = [];

  for (const targetUrl of uniqueUrls) {
    if (images.length >= 3) break; // max 3 screenshots to avoid payload limits
    console.log(`Auto screenshot capture for: ${targetUrl}`);
    try {
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          formats: ["screenshot@fullPage"],
          waitFor: 10000,
          location: { country: "CN", languages: ["zh"] },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        console.warn(`Screenshot failed for ${targetUrl}:`, data.error || response.status);
        continue;
      }

      const screenshot = data.data?.screenshot || data.screenshot;
      if (!screenshot) { console.warn(`No screenshot for ${targetUrl}`); continue; }

      const md = data.data?.markdown || "";
      if (md && isCaptchaContent(md)) {
        console.warn(`Screenshot of ${targetUrl} is CAPTCHA page, skipping`);
        continue;
      }

      console.log(`Screenshot OK from ${targetUrl}`);
      let base64: string | null = null;
      if (screenshot.startsWith("http")) {
        base64 = await downloadScreenshotToBase64(screenshot);
      } else {
        base64 = screenshot.startsWith("data:") ? screenshot : `data:image/png;base64,${screenshot}`;
      }

      if (base64) {
        images.push(base64);
        sources.push(targetUrl);
        // Generate label based on URL pattern
        if (targetUrl.includes("companyinfo") || targetUrl.includes("company_profile")) {
          labels.push("회사소개");
        } else if (targetUrl.includes("contactinfo")) {
          labels.push("연락처");
        } else {
          labels.push("메인");
        }
      }
    } catch (e) {
      console.warn(`Screenshot error for ${targetUrl}:`, e);
    }
  }

  console.log(`Captured ${images.length} screenshots total`);
  return { images, sources, labels };
}

// Strategy 4: Direct fetch (non-JS sites)
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
  if (html.includes("punish-component") || html.includes("slide to verify") || html.length < 3000) {
    throw new Error("CAPTCHA_BLOCKED");
  }

  let embeddedData = "";
  const jsonPatterns = [/window\.__INIT_DATA__\s*=\s*(\{[\s\S]*?\});/, /window\.rawData\s*=\s*(\{[\s\S]*?\});/];
  for (const pattern of jsonPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      try { JSON.parse(match[1]); embeddedData = `\n[Embedded]:\n${match[1].substring(0, 5000)}`; break; } catch {}
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

function buildSystemPrompt(url: string, scoringPrompt: string, inputMode: "text" | "screenshot" | "search"): string {
  const is1688 = url.includes("1688.com");
  const isAlibaba = url.includes("alibaba.com");

  let platformHints = "";
  if (is1688) {
    platformHints = "This is a 1688.com (Chinese wholesale) supplier page. Key data points: Company name (公司名称), 入驻年限, 回头率, 履约率, 创立时间, service scores (1-5), address, 粉丝数. Country is always China.";
  } else if (isAlibaba) {
    platformHints = "This is Alibaba.com. Look for: company name, location, year established, main products, MOQ, lead time, certifications.";
  }

  const inputDesc = {
    text: "Extract from the provided webpage text content.",
    screenshot: "The user has provided a full-page SCREENSHOT. Carefully read all visible text, tables, labels, badges, addresses, contact blocks, company profile sections, product categories, MOQ/lead time fields, and footer details from the image.",
    search: "The data below is collected from web search results about this supplier. Consolidate all information found across multiple sources into a single profile.",
  }[inputMode];

  const schemaLines = [
    '  "name": "company name (keep Chinese if from Chinese site)",',
    '  "country": "country",',
    '  "city": "city",',
    '  "description": "company description in Korean (2-3 sentences)",',
    '  "main_products": "comma-separated product categories",',
    '  "moq": "minimum order quantity",',
    '  "lead_time": "lead time",',
    '  "contact_name": "contact person",',
    '  "contact_email": "email",',
    '  "contact_phone": "phone",',
    '  "contact_wechat": "WeChat ID",',
    `  "certifications": "certifications"${scoringPrompt ? "," : ""}`,
    ...(scoringPrompt ? ['  "scores": []'] : []),
  ];

  const screenshotGuidance = inputMode === "screenshot"
    ? [
        "For screenshot input, scan the ENTIRE image from top to bottom before answering.",
        "Prefer exact visible values over inference.",
        "If one field appears in multiple places, choose the most specific business/company value.",
        "Use visible Chinese text to infer structured fields when possible:",
        "- address/company location -> city, country",
        "- 主营 / main products / product tags -> main_products",
        "- MOQ / 起订量 -> moq",
        "- 发货 / lead time / 交期 -> lead_time",
        "- 联系人 / contact / 手机 / 电话 / 邮箱 / 微信 -> contact fields",
        "- 认证 / 资质 / certificates -> certifications",
      ]
    : [];

  return [
    "You are a data extraction assistant for Asian fashion suppliers.",
    platformHints,
    inputDesc,
    "",
    "Return ONLY valid JSON (no markdown code blocks) with ALL these fields (use \"\" if not found):",
    "{",
    ...schemaLines,
    "}",
    "",
    ...screenshotGuidance,
    screenshotGuidance.length ? "" : "",
    `CRITICAL: Extract ALL available data. DO NOT return empty fields if the data is visible.${scoringPrompt}`,
  ].join("\n");
}

async function callAI(messages: any[], LOVABLE_API_KEY: string) {
  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, temperature: 0.1 }),
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
  return JSON.parse(jsonStr);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, scoring_criteria, screenshot_base64, agent_mode } = await req.json();
    if (!url && !screenshot_base64) {
      return new Response(JSON.stringify({ error: "URL or screenshot is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let scoringPrompt = "";
    if (scoring_criteria?.length) {
      const list = scoring_criteria
        .map((c: any) => `- "${c.name}" (id: ${c.id}, max: ${c.max_score}): ${c.description || "N/A"}`)
        .join("\n");
      scoringPrompt = `\n\nAlso score this vendor on:\n${list}\nInclude "scores": [{"criteria_id":"id","score":N,"notes":"Korean reasoning"}]`;
    }

    // Track agent steps for UI
    const steps: { step: string; status: string; detail?: string }[] = [];

    let pageContent: string | null = null;
    let captchaBlocked = false;
    let inputMode: "text" | "screenshot" | "search" = "text";
    let autoScreenshots: string[] = [];
    let autoScreenshotSources: string[] = [];

    // === STEP 1: Try direct scraping ===
    if (!screenshot_base64 && url) {
      steps.push({ step: "direct_scrape", status: "running" });
      try {
        if (needsJsRendering(url) && Deno.env.get("FIRECRAWL_API_KEY")) {
          const result = await scrapeWithFirecrawl(url);
          if (result.captcha) {
            captchaBlocked = true;
            steps[steps.length - 1] = { step: "direct_scrape", status: "blocked", detail: "CAPTCHA 감지" };
          } else {
            pageContent = result.markdown;
            steps[steps.length - 1] = { step: "direct_scrape", status: "success" };
          }
        } else {
          pageContent = await scrapeWithFetch(url);
          steps[steps.length - 1] = { step: "direct_scrape", status: "success" };
        }
      } catch (e: any) {
        captchaBlocked = true;
        steps[steps.length - 1] = { step: "direct_scrape", status: "blocked", detail: e.message };
      }

      // === STEP 2: If blocked and agent_mode, try web search fallback ===
      if (captchaBlocked && agent_mode !== false) {
        steps.push({ step: "web_search", status: "running" });
        try {
          const searchContent = await searchFactoryInfo(url);
          if (searchContent) {
            pageContent = searchContent;
            captchaBlocked = false;
            inputMode = "search";
            steps[steps.length - 1] = { step: "web_search", status: "success", detail: "검색 결과에서 정보 수집 완료" };
          } else {
            steps[steps.length - 1] = { step: "web_search", status: "failed", detail: "검색 결과 불충분" };
          }
        } catch (e: any) {
          steps[steps.length - 1] = { step: "web_search", status: "failed", detail: e.message };
        }
      }

      // === STEP 3: If still blocked, auto-capture screenshots via Firecrawl ===
      if (captchaBlocked && agent_mode !== false && Deno.env.get("FIRECRAWL_API_KEY")) {
        steps.push({ step: "auto_screenshot", status: "running" });
        try {
          const result = await captureScreenshots(url);
          if (result.images.length > 0) {
            inputMode = "screenshot";
            captchaBlocked = false;
            autoScreenshots = result.images;
            autoScreenshotSources = result.sources;
            const detail = `${result.images.length}개 페이지 캡처 완료 (${result.labels.join(", ")})`;
            steps[steps.length - 1] = { step: "auto_screenshot", status: "success", detail };
          } else {
            steps[steps.length - 1] = { step: "auto_screenshot", status: "failed", detail: "스크린샷 캡처 실패" };
          }
        } catch (e: any) {
          steps[steps.length - 1] = { step: "auto_screenshot", status: "failed", detail: e.message };
        }
      }
    }

    // Use screenshot if provided
    if (screenshot_base64) {
      inputMode = "screenshot";
      captchaBlocked = false;
      steps.push({ step: "screenshot_analysis", status: "running" });
    }

    // If still blocked after all strategies, return with steps
    if (captchaBlocked && !screenshot_base64) {
      return new Response(
        JSON.stringify({
          error: "CAPTCHA_BLOCKED",
          message: "모든 자동 수집 방법이 차단되었습니다. 페이지 스크린샷을 업로드해주세요.",
          steps,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // === STEP 3: AI Extraction ===
    steps.push({ step: "ai_extraction", status: "running" });
    const systemPrompt = buildSystemPrompt(url || "", scoringPrompt, inputMode);
    const messages: any[] = [{ role: "system", content: systemPrompt }];

    const allScreenshots = screenshot_base64 ? [screenshot_base64] : autoScreenshots;
    if (inputMode === "screenshot" && allScreenshots.length > 0) {
      const contentParts: any[] = [
        { type: "text", text: `Extract all factory/supplier information from these ${allScreenshots.length} screenshot(s) of different pages from the same supplier${url ? ` (URL: ${url})` : ""}. Combine information from ALL images into a single complete profile.${autoScreenshotSources.length ? ` Pages: ${autoScreenshotSources.join(", ")}` : ""}${scoringPrompt ? " Also evaluate scores." : ""}` },
      ];
      for (const img of allScreenshots) {
        const imgUrl = img.startsWith("data:") ? img : `data:image/png;base64,${img}`;
        contentParts.push({ type: "image_url", image_url: { url: imgUrl } });
      }
      messages.push({ role: "user", content: contentParts });
    } else {
      messages.push({
        role: "user",
        content: `Extract factory info${scoringPrompt ? " and scores" : ""} from (URL: ${url}):\n\n${pageContent}`,
      });
    }

    const extracted = await callAI(messages, LOVABLE_API_KEY);
    steps[steps.length - 1] = { step: "ai_extraction", status: "success" };

    if (inputMode === "screenshot") {
      steps[steps.length - 2] = { ...steps[steps.length - 2], status: "success" };
    }

    // Build screenshot thumbnails for frontend (truncate base64 for small previews)
    const screenshotThumbnails = autoScreenshots.map((img, i) => ({
      label: autoScreenshotSources[i]?.includes("companyinfo") || autoScreenshotSources[i]?.includes("company_profile")
        ? "회사소개"
        : autoScreenshotSources[i]?.includes("contactinfo")
        ? "연락처"
        : "메인",
      url: img.substring(0, 200000), // cap to avoid huge payloads
      source_url: autoScreenshotSources[i] || "",
    }));

    const detectedPlatform = url?.includes("1688.com") ? "1688" : url?.includes("alibaba.com") ? "alibaba" : "other";

    return new Response(JSON.stringify({
      success: true,
      data: extracted,
      steps,
      source: inputMode,
      platform: detectedPlatform,
      screenshots: screenshotThumbnails,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("scrape-factory error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
