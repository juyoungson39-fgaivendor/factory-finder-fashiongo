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
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return (m?.[1] || m?.[2] || "").trim();
}

async function fetchRss(source: { name: string; url: string; lang: string }, limit: number): Promise<RssArticle[]> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; TrendBot/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });
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

      if (title) {
        items.push({
          title,
          link,
          description: desc,
          pubDate,
          magazine: source.name,
          lang: source.lang,
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
    const results = await Promise.all(fetchPromises);
    results.forEach((articles) => allArticles.push(...articles));

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
      // Filter out articles with score < 60
      filtered = analyzed.filter((a) => (a.fashion_relevance_score || 0) >= 60);
    } else {
      // Without GPT, include all articles with basic data
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

    const inserts = [];
    for (const article of filtered) {
      if (existingLinks.has(article.link)) continue;

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
          image_url: "",
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
