import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SIMILARITY_THRESHOLD = 0.78;
const PERIOD_DAYS = 30;
const MAX_TRENDS = 500;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Parse pgvector "[0.1,0.2,...]" string into number[]
function parseEmbedding(emb: unknown): number[] | null {
  if (!emb) return null;
  if (Array.isArray(emb)) return emb as number[];
  if (typeof emb === "string") {
    try {
      return JSON.parse(emb);
    } catch {
      return null;
    }
  }
  return null;
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

interface TrendRow {
  id: string;
  platform: string | null;
  trend_keywords: string[] | null;
  signal_score: number | null;
  engagement_rate: number | null;
  style_tags: string[] | null;
  source_data: Record<string, unknown> | null;
  created_at: string;
  embedding: number[] | null;
}

async function generateClusterName(
  keywords: string[],
  geminiKey: string
): Promise<{ name: string; name_kr: string }> {
  const fallback = (keywords[0] ?? "Cluster").slice(0, 40);
  if (!geminiKey) return { name: fallback, name_kr: fallback };
  try {
    const prompt = `Given these trend keywords: ${keywords
      .slice(0, 15)
      .join(", ")}
Generate a cluster name (max 4 words English) and Korean translation.
Respond ONLY as JSON: {"name":"...","name_kr":"..."}`;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );
    if (!res.ok) return { name: fallback, name_kr: fallback };
    const data = await res.json();
    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text);
    return {
      name: String(parsed.name ?? fallback).slice(0, 80),
      name_kr: String(parsed.name_kr ?? parsed.name ?? fallback).slice(0, 80),
    };
  } catch (e) {
    console.warn("[cluster-trends] gemini name error:", e);
    return { name: fallback, name_kr: fallback };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return jsonResponse({ error: "Missing supabase env" }, 500);
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const since = new Date(
      Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: rawRows, error } = await supabase
      .from("trend_analyses")
      .select(
        "id, platform, trend_keywords, signal_score, engagement_rate, style_tags, source_data, created_at, embedding"
      )
      .gte("created_at", since)
      .not("embedding", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_TRENDS);

    if (error) throw error;

    const rows: TrendRow[] = (rawRows ?? [])
      .map((r: Record<string, unknown>) => ({
        ...(r as unknown as TrendRow),
        embedding: parseEmbedding(r.embedding),
      }))
      .filter((r: TrendRow) => r.embedding && r.embedding.length > 0);

    console.log(`[cluster-trends] processing ${rows.length} trends`);

    // Greedy clustering
    const assigned = new Set<number>();
    const clusters: TrendRow[][] = [];

    for (let i = 0; i < rows.length; i++) {
      if (assigned.has(i)) continue;
      const seed = rows[i];
      const group: TrendRow[] = [seed];
      assigned.add(i);
      for (let j = i + 1; j < rows.length; j++) {
        if (assigned.has(j)) continue;
        const sim = cosineSim(seed.embedding!, rows[j].embedding!);
        if (sim >= SIMILARITY_THRESHOLD) {
          group.push(rows[j]);
          assigned.add(j);
        }
      }
      if (group.length >= 2) clusters.push(group);
    }

    console.log(`[cluster-trends] formed ${clusters.length} clusters`);

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;

    let createdClusters = 0;

    for (const group of clusters) {
      try {
        // Aggregate
        const platforms = Array.from(
          new Set(group.map((g) => g.platform).filter(Boolean) as string[])
        );
        const trendCount = group.length;
        const platformCount = platforms.length;

        const sigScores = group
          .map((g) => Number(g.signal_score ?? 0))
          .filter((n) => !Number.isNaN(n));
        const avgSignal =
          sigScores.length > 0
            ? sigScores.reduce((a, b) => a + b, 0) / sigScores.length
            : 0;

        const engRates = group
          .map((g) => Number(g.engagement_rate ?? 0))
          .filter((n) => !Number.isNaN(n));
        const avgEng =
          engRates.length > 0
            ? engRates.reduce((a, b) => a + b, 0) / engRates.length
            : 0;

        const thisWeek = group.filter(
          (g) => new Date(g.created_at).getTime() >= oneWeekAgo
        ).length;
        const lastWeek = group.filter((g) => {
          const t = new Date(g.created_at).getTime();
          return t >= twoWeeksAgo && t < oneWeekAgo;
        }).length;
        const weeklyGrowth =
          ((thisWeek - lastWeek) / Math.max(lastWeek, 1)) * 100;

        // Representative image: highest engagement_rate
        let bestImg: string | null = null;
        let bestEng = -1;
        for (const g of group) {
          const sd = g.source_data ?? {};
          const img =
            (sd as Record<string, string>)?.image_url ??
            (sd as Record<string, string>)?.thumbnail_url ??
            null;
          const e = Number(g.engagement_rate ?? 0);
          if (img && e > bestEng) {
            bestEng = e;
            bestImg = img;
          }
        }

        // Style tags frequency
        const tagFreq = new Map<string, number>();
        for (const g of group) {
          for (const t of g.style_tags ?? []) {
            tagFreq.set(t, (tagFreq.get(t) ?? 0) + 1);
          }
        }
        const topTags = [...tagFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([t]) => t);

        // Aggregate keywords for naming
        const keywordFreq = new Map<string, number>();
        for (const g of group) {
          for (const k of g.trend_keywords ?? []) {
            keywordFreq.set(k, (keywordFreq.get(k) ?? 0) + 1);
          }
        }
        const topKeywords = [...keywordFreq.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([k]) => k);

        const { name, name_kr } = await generateClusterName(
          topKeywords,
          GEMINI_KEY
        );

        // UPSERT cluster
        const clusterPayload: Record<string, unknown> = {
          cluster_name: name,
          cluster_name_kr: name_kr,
          trend_count: trendCount,
          platform_count: platformCount,
          platforms,
          avg_signal_score: Number(avgSignal.toFixed(2)),
          avg_engagement_rate: Number(avgEng.toFixed(4)),
          weekly_growth_rate: Number(weeklyGrowth.toFixed(2)),
          representative_image_url: bestImg,
          style_tags: topTags,
          updated_at: new Date().toISOString(),
        };

        const { data: clusterRow, error: upErr } = await supabase
          .from("trend_clusters")
          .upsert(clusterPayload, { onConflict: "cluster_name" })
          .select("id")
          .single();

        if (upErr || !clusterRow) {
          console.warn("[cluster-trends] cluster upsert error:", upErr);
          continue;
        }

        const clusterId = clusterRow.id as string;

        // Members + trend_analyses.cluster_id
        const memberRows = group.map((g) => ({
          cluster_id: clusterId,
          trend_id: g.id,
          similarity_score: Number(
            cosineSim(group[0].embedding!, g.embedding!).toFixed(4)
          ),
        }));

        const { error: memErr } = await supabase
          .from("trend_cluster_members")
          .upsert(memberRows, { onConflict: "cluster_id,trend_id" });
        if (memErr) console.warn("[cluster-trends] member upsert:", memErr);

        const trendIds = group.map((g) => g.id);
        const { error: updErr } = await supabase
          .from("trend_analyses")
          .update({ cluster_id: clusterId })
          .in("id", trendIds);
        if (updErr) console.warn("[cluster-trends] trend update:", updErr);

        createdClusters++;
      } catch (e) {
        console.error("[cluster-trends] cluster process error:", e);
      }
    }

    return jsonResponse({
      processed_trends: rows.length,
      clusters_formed: clusters.length,
      clusters_upserted: createdClusters,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cluster-trends] fatal:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
