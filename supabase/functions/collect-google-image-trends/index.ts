import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_FASHION_QUERIES = [
  "women's boutique fashion new arrivals",
  "online boutique OOTD style inspiration",
  "boutique finds women's clothing 2026",
  "shop small boutique fashion trends",
];

const QUERY_HASHTAG_MAP: Record<string, string[]> = {
  "women's boutique fashion new arrivals": ["#WomensBoutique", "#NewArrivals", "#FashionForWomen"],
  "online boutique OOTD style inspiration": ["#OnlineBoutique", "#WomensOOTD", "#StyleInspo"],
  "boutique finds women's clothing 2026": ["#BoutiqueFinds", "#WomensClothing", "#BoutiqueStyle"],
  "shop small boutique fashion trends": ["#ShopSmall", "#SupportSmallBusiness", "#BoutiqueLife"],
};

async function getCollectionSettings(supabase: any, sourceType: string) {
  const { data, error } = await supabase
    .from("collection_settings")
    .select("is_enabled, keywords, collect_limit")
    .eq("source_type", sourceType)
    .maybeSingle();
  if (error || !data) return null;
  return data as { is_enabled: boolean; keywords: string[]; collect_limit: number };
}

interface GoogleImage {
  title: string;
  link: string;
  original: string;
  thumbnail: string;
  source: string;
  position: number;
  _search_query?: string;
}

async function fetchGoogleImages(query: string, apiKey: string): Promise<GoogleImage[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("ijn", "0");
  url.searchParams.set("imgsz", "l");
  url.searchParams.set("api_key", apiKey);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Google Images API error: ${res.status}`);
    const data = await res.json();
    return (data.images_results || []).slice(0, 15).map((img: any) => ({ ...img, _search_query: query }));
  } catch (e) {
    console.error(`Google Images error "${query}":`, e);
    return [];
  }
}

async function analyzeWithGPT(apiKey: string, images: GoogleImage[]): Promise<any[]> {
  const batchSize = 10;
  const results: any[] = [];

  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const prompt = batch
      .map((img, idx) => `[Image ${idx + 1}] Title: ${img.title}\nSource: ${img.source}`)
      .join("\n\n");

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a fashion trend analyst. For each image result, extract:
- trend_name: short trend name in English
- trend_keywords: 3-5 keywords
- trend_categories: from [Shoes, Tops, Bottoms, Accessories, Outerwear, Dresses]
- trend_score: 0-100 relevance score
- summary_ko: 1-2 sentence Korean summary
- trending_styles: style names
Return ONLY a JSON array of objects. One object per image.`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content || "";
      const jsonMatch = content.match(/```json\s*([\s\S]*?)```/) || content.match(/\[[\s\S]*\]/);
      const jsonStr = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
      const analyzed = JSON.parse(jsonStr);
      batch.forEach((img, idx) => {
        if (analyzed[idx]) results.push({ ...img, ...analyzed[idx] });
        else results.push({ ...img, trend_name: img.title?.substring(0, 50), trend_keywords: [], trend_categories: ["Tops"], trend_score: 50, summary_ko: "GPT 분석 없음", trending_styles: [] });
      });
    } catch (e) {
      console.error("GPT error:", e);
      batch.forEach(img => results.push({ ...img, trend_name: img.title?.substring(0, 50), trend_keywords: [], trend_categories: ["Tops"], trend_score: 50, summary_ko: "GPT 분석 실패", trending_styles: [] }));
    }
  }
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, limit = 30 } = await req.json();
    if (!user_id) return new Response(JSON.stringify({ error: "user_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const serpApiKey = Deno.env.get("SERPAPI_KEY");
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!serpApiKey) return new Response(JSON.stringify({ error: "SERPAPI_KEY not configured" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const allImages: GoogleImage[] = [];
    for (const query of FASHION_QUERIES) {
      const perQuery = Math.ceil(limit / FASHION_QUERIES.length);
      const images = await fetchGoogleImages(query, serpApiKey);
      allImages.push(...images.slice(0, perQuery));
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!allImages.length) return new Response(JSON.stringify({ success: true, message: "No images collected", inserted: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let analyzed: any[];
    if (openaiKey) {
      analyzed = await analyzeWithGPT(openaiKey, allImages);
    } else {
      analyzed = allImages.map(img => ({
        ...img,
        trend_name: (img.title || "").substring(0, 50),
        trend_keywords: (img.title || "").toLowerCase().split(/\s+/).filter(w => w.length > 3).slice(0, 5),
        trend_categories: ["Tops"],
        trend_score: 50,
        summary_ko: "GPT 미연동 - 기본 수집",
        trending_styles: [],
      }));
    }

    const { data: existing } = await supabase.from("trend_analyses").select("source_data").eq("user_id", user_id);
    const existingIds = new Set<string>();
    if (existing) for (const row of existing) {
      const sd = row.source_data as any;
      if (sd?.platform === "google" && sd?.post_id) existingIds.add(sd.post_id);
    }

    const inserts = [];
    for (const item of analyzed) {
      const postId = item.link || item.original || "";
      if (existingIds.has(postId)) continue;
      inserts.push({
        user_id,
        trend_keywords: item.trend_keywords || [],
        trend_categories: item.trend_categories || [],
        status: "analyzed",
        source_data: {
          platform: "google",
          post_id: postId,
          image_url: item.original || item.thumbnail || "",
          permalink: item.link || "",
          author: item.source || "Google Images",
          caption: item.title || "",
          like_count: 0, view_count: 0,
          posted_at: new Date().toISOString(),
          trend_name: item.trend_name || "",
          trend_score: item.trend_score || 50,
          summary_ko: item.summary_ko || "",
          trending_styles: item.trending_styles || [],
          collected_at: new Date().toISOString(),
          search_hashtags: QUERY_HASHTAG_MAP[item._search_query] || ["#WomensBoutique"],
        },
      });
    }

    let insertedCount = 0;
    if (inserts.length) {
      const { error: insertErr, data: inserted } = await supabase.from("trend_analyses").insert(inserts).select("id");
      if (insertErr) throw insertErr;
      insertedCount = inserted?.length || 0;
    }

    return new Response(JSON.stringify({ success: true, source: "google", collected: allImages.length, analyzed: analyzed.length, inserted: insertedCount, skipped_duplicates: analyzed.length - inserts.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("collect-google-image-trends error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
