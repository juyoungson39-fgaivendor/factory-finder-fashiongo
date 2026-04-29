import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MAGAZINE_CONFIGS: Record<string, { displayName: string; lang: string; placeholder: string; rssUrl: string }> = {
  vogue: {
    displayName: "Vogue US",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=400&h=500&fit=crop",
    rssUrl: "https://www.vogue.com/feed/rss",
  },
  elle: {
    displayName: "Elle US",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&h=500&fit=crop",
    rssUrl: "https://www.elle.com/rss/all.xml/",
  },
  wwd: {
    displayName: "WWD",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1558171813-4c088753af8f?w=400&h=500&fit=crop",
    rssUrl: "https://wwd.com/feed/",
  },
  hypebeast: {
    displayName: "Hypebeast",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400&h=500&fit=crop",
    rssUrl: "https://hypebeast.com/feed",
  },
  highsnobiety: {
    displayName: "Highsnobiety",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&h=500&fit=crop",
    rssUrl: "https://www.highsnobiety.com/feed/",
  },
  footwearnews: {
    displayName: "Footwear News",
    lang: "en",
    placeholder: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=500&fit=crop",
    rssUrl: "https://footwearnews.com/feed/",
  },
};

const DEFAULT_PLACEHOLDER = "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop";

interface RssArticle {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  magazine: string;
  lang: string;
  ogImage?: string;
}

async function extractArticleImageViaMicrolink(url: string): Promise<string> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!res.ok) return "";
    const { data } = await res.json();
    const imageUrl = data?.image?.url;
    if (imageUrl && !imageUrl.includes("unsplash.com")) return imageUrl;
    const logoUrl = data?.logo?.url;
    if (logoUrl && !logoUrl.includes("unsplash.com")) return logoUrl;
    return "";
  } catch {
    return "";
  }
}

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

async function extractArticleImageDirect(url: string): Promise<string> {
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

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (ogMatch?.[1]) {
      const abs = toAbsoluteUrl(ogMatch[1], url);
      if (abs) return abs;
    }

    const twMatch =
      html.match(/<meta[^>]+(?:name|property)=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']twitter:image["']/i);
    if (twMatch?.[1]) {
      const abs = toAbsoluteUrl(twMatch[1], url);
      if (abs) return abs;
    }

    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    const searchArea = articleMatch?.[0] || html;
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(searchArea)) !== null) {
      const imgTag = imgMatch[0];
      const imgSrc = imgMatch[1];
      if (imgSrc.includes("1x1") || imgSrc.includes("pixel") || imgSrc.includes("spacer")) continue;
      if (imgSrc.includes(".svg") || imgSrc.includes("logo") || imgSrc.includes("icon") || imgSrc.includes("favicon")) continue;
      const widthAttr = imgTag.match(/width=["']?(\d+)/i);
      if (widthAttr && parseInt(widthAttr[1]) < 200) continue;
      if (imgSrc.startsWith("data:")) continue;
      const abs = toAbsoluteUrl(imgSrc, url);
      if (abs) return abs;
    }

    return "";
  } catch {
    return "";
  }
}

async function extractArticleImage(url: string): Promise<string> {
  const microlinkImage = await extractArticleImageViaMicrolink(url);
  if (microlinkImage) return microlinkImage;
  const directImage = await extractArticleImageDirect(url);
  if (directImage) return directImage;
  return "";
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return (m?.[1] || m?.[2] || "").trim();
}

function extractRssImage(block: string): string {
  const mediaMatch = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaMatch?.[1]) return mediaMatch[1];
  const encMatch = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
  if (encMatch?.[1]) return encMatch[1];
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
    const body = await req.json();
    const { user_id, action } = body;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const magazineTypes = Object.keys(MAGAZINE_CONFIGS);

    // --- Backfill action: update existing magazine records with real images ---
    if (action === "backfill_images") {
      const { data: records } = await supabase
        .from("trend_analyses")
        .select("id, source_data");

      const magazineRecords = (records || []).filter((r: any) =>
        magazineTypes.includes(r.source_data?.platform)
      );

      let updated = 0;
      const toUpdate = magazineRecords.filter((r: any) => {
        const imgUrl = r.source_data?.image_url || "";
        return !imgUrl || imgUrl.includes("unsplash.com");
      });

      console.log(`Backfill: ${toUpdate.length} records need image update`);

      for (let i = 0; i < toUpdate.length; i += 5) {
        const batch = toUpdate.slice(i, i + 5);
        await Promise.allSettled(batch.map(async (rec: any) => {
          const permalink = rec.source_data?.permalink;
          if (!permalink) return;
          const img = await extractArticleImage(permalink);
          if (img && !img.includes("unsplash.com")) {
            const newSd = { ...rec.source_data, image_url: img };
            const { error } = await supabase
              .from("trend_analyses")
              .update({ source_data: newSd })
              .eq("id", rec.id);
            if (!error) updated++;
          }
        }));
      }

      return new Response(
        JSON.stringify({ success: true, total: toUpdate.length, updated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    // Load enabled magazines from collection_settings
    const { data: allSettings } = await supabase
      .from("collection_settings")
      .select("*")
      .in("source_type", magazineTypes);

    const enabledMagazines = (allSettings || []).filter(
      (s: any) => s.is_enabled !== false
    );

    if (enabledMagazines.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No magazines enabled", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch RSS feeds for each enabled magazine
    const allArticles: (RssArticle & { platformKey: string })[] = [];
    const fetchPromises = enabledMagazines.map(async (setting: any) => {
      const config = MAGAZINE_CONFIGS[setting.source_type];
      if (!config) return;

      // 항상 하드코딩된 RSS URL 사용 (collection_settings.keywords는 검색 키워드용)
      const rssUrl = config.rssUrl;
      if (!rssUrl) {
        console.error(`No RSS URL configured for ${setting.source_type}`);
        return;
      }

      const articles = await fetchRss(
        { name: config.displayName, url: rssUrl, lang: config.lang },
        setting.collect_limit || 10
      );

      articles.forEach((a) => {
        allArticles.push({ ...a, platformKey: setting.source_type });
      });
    });

    await Promise.allSettled(fetchPromises);

    if (allArticles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No articles fetched", inserted: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Analyze and filter
    let filtered: ((RssArticle & { platformKey: string }) & Partial<GptArticleAnalysis>)[] = [];

    if (openaiKey) {
      const analyzed = await analyzeArticlesGPT(openaiKey, allArticles);
      // Re-attach platformKey since analyzeArticlesGPT spreads original article
      const byLink = new Map(allArticles.map((a) => [a.link, a.platformKey]));
      filtered = analyzed
        .filter((a) => (a.fashion_relevance_score || 0) >= 60)
        .map((a) => ({ ...a, platformKey: byLink.get(a.link) || "vogue" }));
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

    // Deduplicate against existing records (per individual platform)
    const { data: existing } = await supabase
      .from("trend_analyses")
      .select("source_data")
      .eq("user_id", user_id);

    const existingLinks = new Set<string>();
    if (existing) {
      for (const row of existing) {
        const sd = row.source_data as any;
        if (sd?.permalink && magazineTypes.includes(sd?.platform)) {
          existingLinks.add(sd.permalink);
        }
      }
    }

    const articlesToInsert = filtered.filter((a) => !existingLinks.has(a.link));

    // Waterfall image extraction
    const ogBatchSize = 5;
    for (let i = 0; i < articlesToInsert.length; i += ogBatchSize) {
      const batch = articlesToInsert.slice(i, i + ogBatchSize);
      const imageResults = await Promise.allSettled(
        batch.map(async (a) => {
          if (a.ogImage) return a.ogImage;
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
      const config = MAGAZINE_CONFIGS[article.platformKey];
      const imageUrl = article.ogImage
        || config?.placeholder
        || DEFAULT_PLACEHOLDER;

      inserts.push({
        user_id,
        trend_keywords: article.trend_keywords || [],
        trend_categories: article.trend_categories || [],
        status: "analyzed",
        source_data: {
          platform: article.platformKey,
          post_id: article.link,
          magazine_name: config?.displayName || article.magazine,
          article_title: article.title,
          image_url: imageUrl,
          permalink: article.link,
          author: config?.displayName || article.magazine,
          caption: article.description,
          like_count: 0,
          view_count: 0,
          posted_at: article.pubDate || null,
          trend_name: article.trend_name || article.title,
          trend_score: article.fashion_relevance_score || 50,
          summary_ko: article.summary_ko || "",
          trending_styles: article.trending_styles || [],
          collected_at: new Date().toISOString(),
          search_hashtags: [],
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
        sources: enabledMagazines.map((s: any) => s.source_type),
        per_source: enabledMagazines.map((s: any) => ({
          platform: s.source_type,
          name: MAGAZINE_CONFIGS[s.source_type]?.displayName,
          count: allArticles.filter((a) => a.platformKey === s.source_type).length,
        })),
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
