import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { STOP_WORDS } from "../_shared/keyword-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/** 해시태그 1개당 Apify run-sync 최대 대기 시간 (Edge Function 150초 제한 고려) */
const PER_TAG_TIMEOUT_MS = 55_000; // 55초
/** 동시 처리할 최대 해시태그 수 */
const MAX_PARALLEL_TAGS = 5;

const DEFAULT_FASHION_HASHTAGS = [
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

interface CollectionSettings {
  is_enabled: boolean;
  hashtags: string[];
  keywords: string[];
  category_urls: any[];
  collect_limit: number;
}

async function getCollectionSettings(
  supabase: any,
  sourceType: string,
): Promise<CollectionSettings | null> {
  const { data, error } = await supabase
    .from("collection_settings")
    .select("is_enabled, hashtags, keywords, category_urls, collect_limit")
    .eq("source_type", sourceType)
    .maybeSingle();
  if (error || !data) {
    console.log(`[Settings] No settings for ${sourceType}, using defaults`);
    return null;
  }
  return data as CollectionSettings;
}

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

// ─── trend_source_profiles UPSERT (실패해도 수집은 계속) ─────
async function upsertSourceProfile(
  supabase: any,
  platform: string,
  accountName: string,
  accountUrl: string | null,
  followers: number | null,
  engagementRate: number,
): Promise<void> {
  if (!accountName) return;
  try {
    const { data: existing } = await supabase
      .from("trend_source_profiles")
      .select("id, avg_engagement_rate, total_trends_found")
      .eq("platform", platform)
      .eq("account_name", accountName)
      .maybeSingle();

    if (existing) {
      const newAvg = ((Number(existing.avg_engagement_rate) || 0) + engagementRate) / 2;
      await supabase
        .from("trend_source_profiles")
        .update({
          followers,
          account_url: accountUrl,
          avg_engagement_rate: Number(newAvg.toFixed(4)),
          total_trends_found: (existing.total_trends_found || 0) + 1,
          last_collected_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("trend_source_profiles")
        .insert({
          platform,
          account_name: accountName,
          account_url: accountUrl,
          followers,
          avg_engagement_rate: Number(engagementRate.toFixed(4)),
          total_trends_found: 1,
          last_collected_at: new Date().toISOString(),
        });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[source_profile] upsert failed for ${platform}/${accountName}:`, msg);
  }
}

async function scrapeInstagramApify(
  token: string,
  limit: number,
  hashtags: string[],
): Promise<ApifyPost[]> {
  // 병렬 처리할 태그 수 제한 (Edge Function 150초 제한 대응)
  const activeTags = hashtags.slice(0, MAX_PARALLEL_TAGS);
  const perTag = Math.ceil(limit / Math.max(activeTags.length, 1));

  console.log(`[Instagram] Scraping ${activeTags.length} hashtags in parallel (limit=${perTag}/tag)`);

  const settled = await Promise.allSettled(
    activeTags.map(async (tag) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PER_TAG_TIMEOUT_MS);
      try {
        const runRes = await fetch(
          "https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=" +
            token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashtags: [tag], resultsLimit: perTag }),
            signal: controller.signal,
          }
        );
        if (!runRes.ok) {
          console.warn(`[Instagram] #${tag} failed: ${runRes.status}`);
          return [] as ApifyPost[];
        }
        const items = await runRes.json();
        return (Array.isArray(items)
          ? items.map((item: any) => ({ ...item, _search_tag: tag }))
          : []) as ApifyPost[];
      } catch (e) {
        console.error(`[Instagram] #${tag} error:`, e instanceof Error ? e.message : e);
        return [] as ApifyPost[];
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

async function scrapeTiktokApify(
  token: string,
  limit: number,
  hashtags: string[],
): Promise<ApifyPost[]> {
  // 병렬 처리할 태그 수 제한 (Edge Function 150초 제한 대응)
  const activeTags = hashtags.slice(0, MAX_PARALLEL_TAGS);
  const perTag = Math.ceil(limit / Math.max(activeTags.length, 1));

  console.log(`[TikTok] Scraping ${activeTags.length} hashtags in parallel (limit=${perTag}/tag)`);

  const settled = await Promise.allSettled(
    activeTags.map(async (tag) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PER_TAG_TIMEOUT_MS);
      try {
        const runRes = await fetch(
          "https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=" +
            token,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hashtags: [tag], resultsPerPage: perTag }),
            signal: controller.signal,
          }
        );
        if (!runRes.ok) {
          console.warn(`[TikTok] #${tag} failed: ${runRes.status}`);
          return [] as ApifyPost[];
        }
        const items = await runRes.json();
        return (Array.isArray(items)
          ? items.map((i: any) => ({
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
          : []) as ApifyPost[];
      } catch (e) {
        console.error(`[TikTok] #${tag} error:`, e instanceof Error ? e.message : e);
        return [] as ApifyPost[];
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
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

    // ── Instagram + TikTok 설정 동시 로드 ──────────────────────
    const [igSettings, ttSettings] = await Promise.all([
      (source === "instagram" || source === "all")
        ? getCollectionSettings(supabase, "instagram")
        : Promise.resolve(null),
      (source === "tiktok" || source === "all")
        ? getCollectionSettings(supabase, "tiktok")
        : Promise.resolve(null),
    ]);

    // ── Instagram + TikTok 수집 병렬 실행 ────────────────────
    const [igResult, ttResult] = await Promise.allSettled([
      // Instagram
      (source === "instagram" || source === "all") && igSettings?.is_enabled !== false
        ? scrapeInstagramApify(
            apifyToken,
            igSettings?.collect_limit || limit,
            igSettings?.hashtags?.length ? igSettings.hashtags : DEFAULT_FASHION_HASHTAGS,
          )
        : Promise.resolve([] as ApifyPost[]),
      // TikTok
      (source === "tiktok" || source === "all") && ttSettings?.is_enabled !== false
        ? scrapeTiktokApify(
            apifyToken,
            ttSettings?.collect_limit || limit,
            ttSettings?.hashtags?.length ? ttSettings.hashtags : DEFAULT_FASHION_HASHTAGS,
          )
        : Promise.resolve([] as ApifyPost[]),
    ]);

    if (igResult.status === "fulfilled") {
      allPosts.push(...igResult.value.map((p) => ({ ...p, _platform: "instagram" })));
    } else {
      console.error("[SNS] Instagram scrape failed:", igResult.reason);
    }
    if (ttResult.status === "fulfilled") {
      allPosts.push(...ttResult.value.map((p) => ({ ...p, _platform: "tiktok" })));
    } else {
      console.error("[SNS] TikTok scrape failed:", ttResult.reason);
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
          ?.map((t) => t.replace("#", "").toLowerCase())
          .filter((t) => t && !STOP_WORDS.has(t))
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
      const postId = post.id || (post as any).shortCode || "";
      const key = `${post._platform}:${postId}`;
      if (existingPostIds.has(key)) continue;

      // Extract source account engagement metrics from Apify output
      const anyPost = post as any;
      const followers = (() => {
        const candidates = [
          anyPost.ownerFollowers,
          anyPost.authorMeta?.fans,
          anyPost.authorMeta?.followers,
          anyPost.author?.followerCount,
          anyPost.authorStats?.followerCount,
        ];
        for (const c of candidates) {
          const n = c != null ? parseInt(String(c), 10) : NaN;
          if (Number.isFinite(n) && n > 0) return n;
        }
        return 0;
      })();
      const likes = parseInt(String(post.likesCount ?? 0), 10) || 0;
      const comments = parseInt(String(post.commentsCount ?? 0), 10) || 0;
      const views = parseInt(String(post.videoViewCount ?? 0), 10) || 0;
      const shares = parseInt(String(anyPost.shareCount ?? anyPost.stats?.shareCount ?? 0), 10) || 0;
      const engagement = { likes, comments, shares, views };
      const engagementRate = followers > 0
        ? ((likes + comments) / followers) * 100
        : 0;

      const sourceData = sanitizeObject({
        platform: post._platform,
        post_id: postId,
        image_url: post.displayUrl || "",
        permalink: post.url || "",
        author: post.ownerUsername || "",
        caption: (post.caption || "").substring(0, 2000),
        like_count: likes,
        view_count: views,
        comment_count: comments,
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
        source_followers: followers || null,
        source_engagement: engagement,
        engagement_rate: Number(engagementRate.toFixed(4)),
        // Pass account info through to be picked up after insert
        _account: sanitizeText(post.ownerUsername || ""),
      });
    }

    let insertedCount = 0;
    if (inserts.length > 0) {
      // Strip helper fields before insert
      const dbInserts = inserts.map(({ _account, ...rest }) => rest);
      const { error: insertErr, data: insertedData } = await supabase
        .from("trend_analyses")
        .insert(dbInserts)
        .select("id");

      if (insertErr) throw insertErr;
      insertedCount = insertedData?.length || 0;

      // ── 소스 프로필 UPSERT (실패해도 수집은 계속) ───────────
      try {
        const seenAccounts = new Set<string>();
        for (const r of inserts) {
          const account = r._account;
          if (!account || seenAccounts.has(`${r.source_data.platform}:${account}`)) continue;
          seenAccounts.add(`${r.source_data.platform}:${account}`);
          await upsertSourceProfile(
            supabase,
            r.source_data.platform,
            account,
            r.source_data.platform === "instagram"
              ? `https://www.instagram.com/${account}/`
              : r.source_data.platform === "tiktok"
              ? `https://www.tiktok.com/@${account}`
              : null,
            (r.source_followers as number | null) ?? null,
            (r.engagement_rate as number) ?? 0,
          );
        }
      } catch (e) {
        console.warn("[collect-sns] source profile upsert batch failed (non-fatal):", e);
      }
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
