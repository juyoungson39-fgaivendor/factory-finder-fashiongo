import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const FASHION_HASHTAGS = [
  "WomensBoutique",
  "OnlineBoutique",
  "BoutiqueLife",
  "ShopSmall",
  "SupportSmallBusiness",
  "WomensOOTD",
  "NewArrivals",
  "BoutiqueFinds",
  "FashionForWomen",
  "StyleInspo",
  "WomensClothing",
  "BoutiqueStyle",
];

interface ApifyPost {
  id?: string;
  shortCode?: string;
  url?: string;
  ownerUsername?: string;
  caption?: string;
  likesCount?: number;
  commentsCount?: number;
  videoViewCount?: number;
  timestamp?: string;
  displayUrl?: string;
  images?: string[];
  _search_tag?: string;
}

interface AnalyzedTrend {
  trend_name: string;
  trend_keywords: string[];
  trend_categories: string[];
  trend_score: number;
  summary_ko: string;
  trending_styles: string[];
}

/** Strip invalid Unicode surrogates and null bytes that break PostgreSQL JSONB */
function sanitizeText(str: string): string {
  if (!str) return "";
  let result = "";
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code === 0) continue;
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = i + 1 < str.length ? str.charCodeAt(i + 1) : 0;
      if (next >= 0xDC00 && next <= 0xDFFF) {
        result += str[i] + str[i + 1];
        i++;
      }
      continue;
    }
    if (code >= 0xDC00 && code <= 0xDFFF) continue;
    result += str[i];
  }
  return result;
}

/** Deep-sanitize all string values in an object for JSONB safety */
function sanitizeObject(obj: any): any {
  if (typeof obj === "string") return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeObject);
  if (obj && typeof obj === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeObject(v);
    }
    return out;
  }
  return obj;
}

async function scrapeInstagramApify(
  token: string,
  limit: number
): Promise<ApifyPost[]> {
  const posts: ApifyPost[] = [];

  for (const tag of FASHION_HASHTAGS) {
    try {
      const runRes = await fetch(
        "https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=" +
          token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hashtags: [tag],
            resultsLimit: Math.ceil(limit / FASHION_HASHTAGS.length),
          }),
        }
      );
      if (runRes.ok) {
        const items = await runRes.json();
        if (Array.isArray(items)) {
          posts.push(...items.map((item: any) => ({ ...item, _search_tag: tag })));
        }
      }
    } catch (e) {
      console.error(`Apify scrape failed for #${tag}:`, e);
    }
  }
  return posts;
}

async function scrapeTiktokApify(
  token: string,
  limit: number
): Promise<ApifyPost[]> {
  const posts: ApifyPost[] = [];

  for (const tag of FASHION_HASHTAGS) {
    try {
      const runRes = await fetch(
        "https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=" +
          token,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hashtags: [tag],
            resultsPerPage: Math.ceil(limit / FASHION_HASHTAGS.length),
          }),
        }
      );
      if (runRes.ok) {
        const items = await runRes.json();
        if (Array.isArray(items)) {
          posts.push(
            ...items.map((i: any) => ({
              id: i.id,
              url: i.webVideoUrl || i.url,
              ownerUsername: i.authorMeta?.name || i.author?.uniqueId,
              caption: i.text || i.desc,
              likesCount: i.diggCount || i.stats?.diggCount,
              commentsCount: i.commentCount || i.stats?.commentCount,
              videoViewCount: i.playCount || i.stats?.playCount,
              timestamp: i.createTimeISO || i.createTime,
              displayUrl: i.videoMeta?.coverUrl || i.covers?.default,
              _search_tag: tag,
            }))
          );
        }
      }
    } catch (e) {
      console.error(`Apify TikTok scrape failed for #${tag}:`, e);
    }
  }
  return posts;
}

async function analyzeWithGPT(
  apiKey: string,
  posts: ApifyPost[],
  platform: string
): Promise<(ApifyPost & AnalyzedTrend)[]> {
  const results: (ApifyPost & AnalyzedTrend)[] = [];

  const batchSize = 5;
  for (let i = 0; i < posts.length; i += batchSize) {
    const batch = posts.slice(i, i + batchSize);
    const prompt = batch
      .map(
        (p, idx) =>
          `[Post ${idx + 1}] Platform: ${platform}\nCaption: ${(p.caption || "").substring(0, 500)}\nLikes: ${p.likesCount || 0}, Views: ${p.videoViewCount || 0}`
      )
      .join("\n\n");

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a fashion trend analyst. For each post, extract:
- trend_name: short trend name in English
- trend_keywords: 3-5 relevant keywords
- trend_categories: from [Shoes, Tops, Bottoms, Accessories, Outerwear, Dresses]
- trend_score: 0-100 relevance score
- summary_ko: 1-2 sentence Korean summary
- trending_styles: style names

Return ONLY a JSON array of objects. One object per post.`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        }),
      });

      if (!res.ok) {
        console.error("GPT error:", res.status);
        continue;
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch =
        content.match(/```json\s*([\s\S]*?)```/) ||
        content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch
        ? jsonMatch[1] || jsonMatch[0]
        : content;
      const analyzed: AnalyzedTrend[] = JSON.parse(jsonStr);

      batch.forEach((post, idx) => {
        if (analyzed[idx]) {
          results.push({ ...post, ...analyzed[idx] });
        }
      });
    } catch (e) {
      console.error("GPT analysis error:", e);
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { source = "all", limit = 20, user_id } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const apifyToken = Deno.env.get("APIFY_API_TOKEN");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    let allPosts: (ApifyPost & { _platform: string })[] = [];

    if (!apifyToken) {
      return new Response(
        JSON.stringify({
          error: "APIFY_API_TOKEN not configured",
          hint: "Set APIFY_API_TOKEN secret to enable SNS scraping",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Collect posts
    if (source === "instagram" || source === "all") {
      const igPosts = await scrapeInstagramApify(apifyToken, limit);
      allPosts.push(...igPosts.map((p) => ({ ...p, _platform: "instagram" })));
    }
    if (source === "tiktok" || source === "all") {
      const ttPosts = await scrapeTiktokApify(apifyToken, limit);
      allPosts.push(...ttPosts.map((p) => ({ ...p, _platform: "tiktok" })));
    }

    if (allPosts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No posts collected", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze with GPT if available
    let analyzed: (ApifyPost & AnalyzedTrend & { _platform: string })[] = [];
    if (openaiKey) {
      const igPosts = allPosts.filter((p) => p._platform === "instagram");
      const ttPosts = allPosts.filter((p) => p._platform === "tiktok");

      const igAnalyzed = igPosts.length > 0
        ? await analyzeWithGPT(openaiKey, igPosts, "instagram")
        : [];
      const ttAnalyzed = ttPosts.length > 0
        ? await analyzeWithGPT(openaiKey, ttPosts, "tiktok")
        : [];

      analyzed = [
        ...igAnalyzed.map((p) => ({ ...p, _platform: "instagram" })),
        ...ttAnalyzed.map((p) => ({ ...p, _platform: "tiktok" })),
      ];
    } else {
      // Without GPT, use basic extraction
      analyzed = allPosts.map((p) => ({
        ...p,
        trend_name: (p.caption || "").substring(0, 50),
        trend_keywords: (p.caption || "")
          .match(/#\w+/g)
          ?.map((t) => t.replace("#", ""))
          .slice(0, 5) || [],
        trend_categories: ["Tops"],
        trend_score: Math.min(100, (p.likesCount || 0) / 100),
        summary_ko: "GPT 미연동 - 기본 수집",
        trending_styles: [],
      }));
    }

    // Deduplicate by post_id + platform
    const { data: existing } = await supabase
      .from("trend_analyses")
      .select("source_data")
      .eq("user_id", user_id);

    const existingPostIds = new Set<string>();
    if (existing) {
      for (const row of existing) {
        const sd = row.source_data as any;
        if (sd?.post_id && sd?.platform) {
          existingPostIds.add(`${sd.platform}:${sd.post_id}`);
        }
      }
    }

    const inserts = [];
    for (const post of analyzed) {
      const postId = post.id || post.shortCode || "";
      const key = `${post._platform}:${postId}`;
      if (existingPostIds.has(key)) continue;

      const sourceData = sanitizeObject({
        platform: post._platform,
        post_id: postId,
        image_url: post.displayUrl || "",
        permalink: post.url || "",
        author: post.ownerUsername || "",
        caption: (post.caption || "").substring(0, 2000),
        like_count: post.likesCount || 0,
        view_count: post.videoViewCount || 0,
        posted_at: post.timestamp || null,
        trend_name: post.trend_name || "",
        trend_score: post.trend_score || 0,
        summary_ko: post.summary_ko || "",
        trending_styles: post.trending_styles || [],
        collected_at: new Date().toISOString(),
        search_hashtags: post._search_tag ? [`#${post._search_tag}`] : [],
      });

      inserts.push({
        user_id,
        trend_keywords: (post.trend_keywords || []).map((k: string) => sanitizeText(k)),
        trend_categories: post.trend_categories || [],
        status: "analyzed",
        source_data: sourceData,
      });
    }

    let insertedCount = 0;
    if (inserts.length > 0) {
      const { error: insertErr, data: insertedData } = await supabase
        .from("trend_analyses")
        .insert(inserts)
        .select("id");

      if (insertErr) throw insertErr;
      insertedCount = insertedData?.length || 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        collected: allPosts.length,
        analyzed: analyzed.length,
        inserted: insertedCount,
        skipped_duplicates: analyzed.length - insertedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("collect-sns-trends error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
