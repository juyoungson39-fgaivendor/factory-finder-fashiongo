import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GRAPH_API = "https://graph.instagram.com/v21.0";

interface IGMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const META_ACCESS_TOKEN = Deno.env.get("META_ACCESS_TOKEN");
    if (!META_ACCESS_TOKEN) {
      throw new Error("META_ACCESS_TOKEN not configured");
    }

    const body = await req.json().catch(() => ({}));
    const {
      hashtags = ["streetstyle", "ootd", "fashiontrend"],
      limit = 20,
      ig_user_id,
    } = body;

    const results: any[] = [];

    // Strategy 1: If an IG Business User ID is provided, fetch their recent media
    if (ig_user_id) {
      try {
        const mediaRes = await fetch(
          `${GRAPH_API}/${ig_user_id}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=${limit}&access_token=${META_ACCESS_TOKEN}`
        );
        if (mediaRes.ok) {
          const mediaData = await mediaRes.json();
          if (mediaData.data) {
            results.push(
              ...mediaData.data.map((m: IGMedia) => formatMedia(m, "user_feed"))
            );
          }
        } else {
          const errText = await mediaRes.text();
          console.error("User media fetch error:", mediaRes.status, errText);
        }
      } catch (e) {
        console.error("User media error:", e);
      }
    }

    // Strategy 2: Hashtag search (requires IG Business Account)
    for (const tag of hashtags) {
      try {
        // Step 1: Get hashtag ID
        const searchRes = await fetch(
          `${GRAPH_API}/ig_hashtag_search?q=${encodeURIComponent(tag)}&user_id=${ig_user_id || "me"}&access_token=${META_ACCESS_TOKEN}`
        );

        if (!searchRes.ok) {
          const errText = await searchRes.text();
          console.warn(`Hashtag search failed for "${tag}":`, searchRes.status, errText);
          continue;
        }

        const searchData = await searchRes.json();
        const hashtagId = searchData.data?.[0]?.id;
        if (!hashtagId) continue;

        // Step 2: Get recent media for this hashtag
        const recentRes = await fetch(
          `${GRAPH_API}/${hashtagId}/recent_media?user_id=${ig_user_id || "me"}&fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=${Math.min(limit, 30)}&access_token=${META_ACCESS_TOKEN}`
        );

        if (recentRes.ok) {
          const recentData = await recentRes.json();
          if (recentData.data) {
            results.push(
              ...recentData.data.map((m: IGMedia) =>
                formatMedia(m, `hashtag_${tag}`)
              )
            );
          }
        } else {
          const errText = await recentRes.text();
          console.warn(`Recent media failed for #${tag}:`, recentRes.status, errText);
        }
      } catch (e) {
        console.error(`Hashtag "${tag}" error:`, e);
      }
    }

    // Strategy 3: If no results from API, try the user's own media endpoint
    if (results.length === 0 && !ig_user_id) {
      try {
        const meRes = await fetch(
          `${GRAPH_API}/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=${limit}&access_token=${META_ACCESS_TOKEN}`
        );
        if (meRes.ok) {
          const meData = await meRes.json();
          if (meData.data) {
            results.push(
              ...meData.data.map((m: IGMedia) => formatMedia(m, "self"))
            );
          }
        } else {
          const errText = await meRes.text();
          console.warn("Me/media error:", meRes.status, errText);
        }
      } catch (e) {
        console.error("Me/media error:", e);
      }
    }

    // If still no results, use AI to analyze trends and return keywords for Unsplash fallback
    if (results.length === 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (LOVABLE_API_KEY) {
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
                content: `You are a fashion trend analyst. Generate 5 current SNS fashion trends popular among US celebrities. Return ONLY valid JSON array:
[{
  "style_name": "...",
  "celebrity": "celebrity name",
  "description": "brief description",
  "source": "Instagram" or "TikTok",
  "source_handle": "@handle",
  "engagement": "1.2M likes",
  "change_pct": number (50-400),
  "category": "Shoes"|"Tops"|"Bottoms"|"Accessories"|"Dresses",
  "tags": ["tag1", "tag2", "tag3"],
  "unsplash_query": "search query for similar fashion image"
}]`,
              },
              {
                role: "user",
                content: `Generate current celebrity fashion trends for March 2026. Hashtags of interest: ${hashtags.join(", ")}`,
              },
            ],
            temperature: 0.3,
          }),
        });

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          const content = aiData.choices?.[0]?.message?.content || "";
          const jsonMatch =
            content.match(/```json\s*([\s\S]*?)```/) ||
            content.match(/\[[\s\S]*\]/);
          const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
          try {
            const aiTrends = JSON.parse(jsonStr);
            return new Response(
              JSON.stringify({
                success: true,
                source: "ai_generated",
                data: aiTrends,
                message: "Instagram API에서 데이터를 가져올 수 없어 AI가 트렌드를 생성했습니다.",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          } catch (parseErr) {
            console.error("AI JSON parse error:", parseErr);
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: false,
          source: "none",
          data: [],
          message: "Instagram API 및 AI 트렌드 생성 모두 실패했습니다. 토큰을 확인해주세요.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Deduplicate by ID
    const uniqueResults = Array.from(
      new Map(results.map((r) => [r.id, r])).values()
    );

    return new Response(
      JSON.stringify({
        success: true,
        source: "instagram_api",
        data: uniqueResults,
        count: uniqueResults.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("fetch-instagram-trends error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function formatMedia(media: IGMedia, source: string) {
  const imageUrl =
    media.media_type === "VIDEO"
      ? media.thumbnail_url || media.media_url
      : media.media_url;

  // Extract hashtags from caption
  const tags =
    media.caption?.match(/#\w+/g)?.map((t) => t.replace("#", "")) || [];

  // Extract mentions from caption
  const mentions =
    media.caption?.match(/@\w+/g)?.map((m) => m) || [];

  return {
    id: media.id,
    image_url: imageUrl || "",
    caption: media.caption?.substring(0, 200) || "",
    permalink: media.permalink,
    media_type: media.media_type,
    timestamp: media.timestamp,
    like_count: media.like_count || 0,
    comments_count: media.comments_count || 0,
    tags: tags.slice(0, 10),
    mentions,
    source_type: source,
  };
}
