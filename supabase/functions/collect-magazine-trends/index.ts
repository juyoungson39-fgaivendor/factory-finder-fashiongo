import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RSS_SOURCES = [
  { name: "Vogue US", url: "https://www.vogue.com/feed/rss", lang: "en" },
  { name: "Elle US", url: "https://www.elle.com/rss/all.xml/", lang: "en" },
  { name: "WWD", url: "https://wwd.com/feed/", lang: "en" },
  { name: "Hypebeast", url: "https://hypebeast.com/feed", lang: "en" },
  { name: "Highsnobiety", url: "https://www.highsnobiety.com/feed/", lang: "en" },
  { name: "Footwear News", url: "https://footwearnews.com/feed/", lang: "en" },
  { name: "패션서울", url: "http://www.fashionseoul.com/feed", lang: "ko" },
  { name: "어패럴뉴스", url: "http://www.apparelnews.co.kr/rss/rss.xml", lang: "ko" },
];

interface RssArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  magazine: string;
  lang: string;
  ogImage?: string;
}

const MAGAZINE_PLACEHOLDERS: Record<string, string> = {
  "Vogue US": "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=500&fit=crop",
  "Elle US": "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
  "WWD": "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop",
  "Hypebeast": "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400&h=500&fit=crop",
  "Highsnobiety": "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
  "Footwear News": "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop",
  "패션서울": "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&h=500&fit=crop",
  "어패럴뉴스": "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=400&h=500&fit=crop",
};
const DEFAULT_PLACEHOLDER = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop";

/**
 * Resolve a potentially relative URL to absolute using the article's base URL.
 */
function toAbsoluteUrl(src: string, baseUrl: string): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("//")) return "https:" + src;
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return "";
  }
}

/**
 * Waterfall image extraction:
 * 1. og:image
 * 2. twitter:image
 * 3. First large <img> in article/body (width >= 200)
 * 4. Empty string (caller falls back to placeholder)
 */
async function extractArticleImage(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrendBot/1.0; +https://lovable.dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);
    if (!res.ok) return "";

    const html = await res.text();

    // --- Step 1: og:image ---
    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = toAbsoluteUrl(ogMatch[1], url);
      if (abs) return abs;
    }

    // --- Step 2: twitter:image ---
    const twMatch =
      html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = toAbsoluteUrl(twMatch[1], url);
      if (abs) return abs;
    }

    // --- Step 3: First large <img> in <article> or <body> ---
    // Try <article> first, then full body
    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    const searchArea = articleMatch?.[0] || html;

    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(searchArea)) !== null) {
      const imgTag = imgMatch[0];
      const imgSrc = imgMatch[1];

      // Skip tiny images (icons, logos, tracking pixels)
      if (imgSrc.includes("1x1") || imgSrc.includes("pixel") || imgSrc.includes("spacer")) continue;
      if (imgSrc.includes(".svg")) continue;
      if (imgSrc.includes("logo") || imgSrc.includes("icon") || imgSrc.includes("favicon")) continue;

      // Check explicit width/height attributes
      const widthAttr = imgTag.match(/width=["']?(\d+)/i);
      const heightAttr = imgTag.match(/height=["']?(\d+)/i);
      if (widthAttr && parseInt(widthAttr[1]) < 200) continue;
      if (heightAttr && parseInt(heightAttr[1]) < 100) continue;

      // Skip data URIs
      if (imgSrc.startsWith("data:")) continue;

      const abs = toAbsoluteUrl(imgSrc, url);
      if (abs) return abs;
    }

    return "";
  } catch {
    return "";
  }
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return (m?.[1] || m?.[2] || "").trim();
}

/**
 * Also try to extract <media:content> or <enclosure> image from RSS item.
 */
function extractRssImage(block: string): string {
  // media:content
  const mediaMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch?.[1]) return mediaMatch[1];
  // enclosure
  const encMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
  if (encMatch?.[1]) return encMatch[1];
  // img inside description/content
  const imgMatch = block.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch?.[1] && !imgMatch[1].includes("data:")) return imgMatch[1];
  return "";
}

async function fetchRss(source: { name: string; url: string; lang: string }, limit: number): Promise<RssArticle[]> {
  try {
    console.log(`Fetching RSS: ${source.name} (${source.url})`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrendBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      console.error(`RSS fetch failed for ${source.name}: ${res.status}`);
      return [];
    }

    const xml = await res.text();
    const items: RssArticle[] = [];
    const itemBlocks = xml.split(/<item[\s>]/i).slice(1);

    for (const block of itemBlocks.slice(0, limit)) {
      const title = extractTag(block, "title");
      const link = extractTag(block, "link");
      const desc = extractTag(block, "description")
        .replace(/<[^>]+>/g, "")
        .substring(0, 1000);
      const pubDate = extractTag(block, "pubDate");

      // Try to get image from RSS itself (media:content, enclosure, inline img)
      const rssImage = extractRssImage(block);

      if (title) {
        items.push({
          title,
          link,
          description: desc,
          pubDate,
          magazine: source.name,
          lang: source.lang,
          ogImage: rssImage || undefined,
        });
      }
    }
    return items;
  } catch (e) {
    console.error(`RSS error for ${source.name}:`, e);
    return [];
  }
}

interface GptArticleAnalysis {
  fashion_relevance_score: number;
  trend_name: string;
  trend_keywords: string[];
  trend_categories: string[];
  summary_ko: string;
  trending_styles: string[];
}

async function analyzeArticlesGPT(
  apiKey: string,
  articles: RssArticle[]
): Promise<(RssArticle & GptArticleAnalysis)[]> {
  const results: (RssArticle & GptArticleAnalysis)[] = [];
  const batchSize = 10;

  for (let i = 0; i < articles.length; i += batchSize) {
    const batch = articles.slice(i, i + batchSize);
    const prompt = batch
      .map(
        (a, idx) =>
          `[Article ${idx + 1}] Magazine: ${a.magazine}\nTitle: ${a.title}\nDescription: ${a.description.substring(0, 300)}`
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
              content: `You are a fashion trend analyst. For each article, determine:
- fashion_relevance_score: 0-100 (how relevant to fashion trends)
- trend_name: short English trend name
- trend_keywords: 3-5 keywords
- trend_categories: from [Shoes, Tops, Bottoms, Accessories, Outerwear, Dresses]
- summary_ko: 1-2 sentence Korean summary
- trending_styles: style names

Return ONLY a JSON array. One object per article.`,
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
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      const analyzed: GptArticleAnalysis[] = JSON.parse(jsonStr);

      batch.forEach((article, idx) => {
        if (analyzed[idx]) {
          results.push({ ...article, ...analyzed[idx] });
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
    const { limit = 10, user_id } = await req.json();
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Fetch all RSS feeds in parallel
    const allArticles: RssArticle[] = [];
    const fetchPromises = RSS_SOURCES.map((src) => fetchRss(src, limit));
    const results = await Promise.allSettled(fetchPromises);
    results.forEach((r, i) => {
      if (r.status === "fulfilled") {
        console.log(`✅ ${RSS_SOURCES[i].name}: ${r.value.length} articles`);
        allArticles.push(...r.value);
      } else {
        console.error(`❌ ${RSS_SOURCES[i].name}: ${r.reason}`);
      }
    });

    if (allArticles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No articles fetched", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze and filter
    let filtered: (RssArticle & Partial<GptArticleAnalysis>)[] = [];

    if (openaiKey) {
      const analyzed = await analyzeArticlesGPT(openaiKey, allArticles);
      filtered = analyzed.filter((a) => (a.fashion_relevance_score || 0) >= 60);
    } else {
      filtered = allArticles.map((a) => ({
        ...a,
        fashion_relevance_score: 50,
        trend_name: a.title.substring(0, 50),
        trend_keywords: a.title
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
          .slice(0, 5),
        trend_categories: ["Tops"] as string[],
        summary_ko: "GPT 미연동 - 기본 수집",
        trending_styles: [] as string[],
      }));
    }

    // Deduplicate
    const { data: existing } = await supabase
      .from("trend_analyses")
      .select("source_data")
      .eq("user_id", user_id);

    const existingLinks = new Set<string>();
    if (existing) {
      for (const row of existing) {
        const sd = row.source_data as any;
        if (sd?.permalink && sd?.platform === "magazine") {
          existingLinks.add(sd.permalink);
        }
      }
    }

    const articlesToInsert = filtered.filter(a => !existingLinks.has(a.link));

    // --- Waterfall image extraction for each article ---
    // Batch to avoid overwhelming targets
    const ogBatchSize = 5;
    for (let i = 0; i < articlesToInsert.length; i += ogBatchSize) {
      const batch = articlesToInsert.slice(i, i + ogBatchSize);
      const imageResults = await Promise.allSettled(
        batch.map(async (a) => {
          // If RSS already provided an image, use it
          if (a.ogImage) return a.ogImage;
          // Otherwise do waterfall extraction from article page
          return await extractArticleImage(a.link);
        })
      );
      imageResults.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) {
          batch[idx].ogImage = r.value;
        }
      });
    }

    const inserts = [];
    for (const article of articlesToInsert) {
      const imageUrl = article.ogImage
        || MAGAZINE_PLACEHOLDERS[article.magazine]
        || DEFAULT_PLACEHOLDER;

      inserts.push({
        user_id,
        trend_keywords: article.trend_keywords || [],
        trend_categories: article.trend_categories || [],
        status: "analyzed",
        source_data: {
          platform: "magazine",
          post_id: article.link,
          magazine_name: article.magazine,
          article_title: article.title,
          image_url: imageUrl,
          permalink: article.link,
          author: article.magazine,
          caption: article.description,
          like_count: 0,
          view_count: 0,
          posted_at: article.pubDate || null,
          trend_name: article.trend_name || article.title,
          trend_score: article.fashion_relevance_score || 50,
          summary_ko: article.summary_ko || "",
          trending_styles: article.trending_styles || [],
          collected_at: new Date().toISOString(),
        },
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
        total_articles: allArticles.length,
        fashion_relevant: filtered.length,
        inserted: insertedCount,
        skipped_duplicates: filtered.length - insertedCount,
        sources: RSS_SOURCES.map((s) => s.name),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("collect-magazine-trends error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
