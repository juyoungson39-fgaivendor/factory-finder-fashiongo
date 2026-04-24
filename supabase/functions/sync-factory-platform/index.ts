// Server-side factory sync via Firecrawl.
// Replaces the old client-side window.open() approach which was blocked by CORS.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface FactoryInput {
  id: string;
  name: string;
  source_url?: string | null;
  source_platform?: string | null;
}

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";

function getCreditUrl(f: FactoryInput): string | null {
  const url = f.source_url;
  const platform = f.source_platform?.toLowerCase();
  if (!url || !platform) return null;
  try {
    const u = new URL(url);
    const domain = `${u.protocol}//${u.hostname}`;
    if (platform === "1688") return `${domain}/page/creditdetail.htm`;
    if (platform === "alibaba") return `${domain}/company_profile.html`;
  } catch {
    /* ignore */
  }
  return null;
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: false,
      waitFor: 3000,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(
      `Firecrawl ${res.status}: ${data?.error ?? JSON.stringify(data)}`,
    );
  }
  // SDK v2: markdown is on data.markdown OR data.data.markdown
  const md =
    (data?.markdown as string | undefined) ??
    (data?.data?.markdown as string | undefined) ??
    "";
  if (!md || md.length < 100) {
    throw new Error("페이지 내용이 너무 짧음 (로그인 필요 또는 차단)");
  }
  return md;
}

function parse1688(text: string): Record<string, unknown> {
  const m = (re: RegExp) => {
    const r = re.exec(text);
    return r?.[1] ?? null;
  };
  const mNum = (re: RegExp) => {
    const v = m(re);
    return v ? parseFloat(v) : null;
  };
  return {
    consultation: mNum(/咨询体验\s*([\d.]+)/),
    logistics: mNum(/物流体验\s*([\d.]+)/),
    score_aftersale: mNum(/售后体验\s*([\d.]+)/),
    product_quality: mNum(/商品体验\s*([\d.]+)/),
    platform_service_score: mNum(/服务分\s*([\d.]+)/),
    credit_grade:
      m(/(?:诚信通体系|等级)\s*\n*\s*([A-Z]{1,4})\b/) ?? null,
    credit_system: "阿里诚信通",
    orders_last_30d: m(/最近30天支付订单数\s*([\d,]+)/),
    fulfillment_48h: m(/48H履约率\s*([\d.]+%)/),
    collection_48h: m(/48H揽收率\s*([\d.]+%)/),
    response_3min: m(/3分钟响应率\s*([\d.]+%)/),
    quality_return_rate: m(/品质退货率\s*([\d.]+%)/),
    dispute_rate: m(/纠纷率\s*([\d.]+%)/),
    repurchase_rate: mNum(/回头率\s*([\d.]+)%/),
    followers_raw: m(/粉丝数?\s*([\d.]+[万千]*)/),
    registered_capital: m(/注册资金\s*([\d.]+万[^\n\s]*)/),
    established_date: m(/成立时间\s*([\d-]+)/),
    transaction_scale: m(/交易规模([^\n，。\s]{1,20})/),
    industry_rank: m(/同行中排行([^\n。]{1,15})/),
    default_risk: m(/违约风险([^\n，。\s]{1,8})/),
    ai_deep_analysis: (() => {
      const r = /该商家(.{10,300}?)(?:\n公司信息|[*]信息)/s.exec(text);
      return r ? r[0].trim() : null;
    })(),
    updated_at_platform: new Date().toISOString(),
  };
}

function parseAlibaba(text: string): Record<string, unknown> {
  const m = (re: RegExp) => {
    const r = re.exec(text);
    return r?.[1]?.trim() ?? null;
  };
  return {
    credit_grade: /Gold Supplier/i.test(text) ? "GOLD" : null,
    gold_supplier_years: (() => {
      const r = /Gold Supplier[\s|]+(\d+)\s*(?:YR|Year)/i.exec(text);
      return r ? parseInt(r[1]) : null;
    })(),
    verified_supplier: /Verified\s+Supplier/i.test(text),
    response_rate: m(/Response\s+Rate[:\s]+([\d.]+%)/i),
    on_time_delivery: m(/On-Time\s+Delivery[:\s]+([\d.]+%)/i),
    transaction_level: m(/Transaction\s+Level[:\s]*([^\n]+)/i),
    annual_revenue: m(/(?:Annual\s+Revenue|Revenue)[:\s]*([^\n]+)/i),
    established_date: m(/(?:Established|Year\s+Established)[:\s]*(\d{4})/i),
    total_employees: m(/(?:Total\s+Employees?|Staff)[:\s]*([^\n,]+)/i),
    factory_size: m(/(?:Factory\s+Size|Floor\s+Space)[:\s]*([^\n]+)/i),
    main_markets: m(/Main\s+Markets?[:\s]*([^\n]+)/i),
    certifications: m(/Certif(?:ication|ied)[:\s]*([^\n]+)/i),
    company_description: m(
      /(?:About\s+Us|Company\s+Overview)[:\s\n]*([^]{50,400}?)(?:\n\n|\nMain)/i,
    ),
    platform: "alibaba",
    updated_at_platform: new Date().toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
  if (!apiKey) {
    return json(
      { success: false, error: "FIRECRAWL_API_KEY not configured" },
      500,
    );
  }

  let body: { factory?: FactoryInput };
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }

  const factory = body.factory;
  if (!factory?.id || !factory?.source_url || !factory?.source_platform) {
    return json(
      { success: false, error: "factory.id, source_url, source_platform required" },
      400,
    );
  }

  const creditUrl = getCreditUrl(factory);
  if (!creditUrl) {
    return json({ success: false, error: "URL 생성 실패" }, 400);
  }

  const platform = factory.source_platform.toLowerCase();

  try {
    const text = await firecrawlScrape(creditUrl, apiKey);
    const parsed =
      platform === "1688" ? parse1688(text) : parseAlibaba(text);

    // Merge with existing platform_score_detail
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: existing } = await supabase
      .from("factories")
      .select("platform_score_detail")
      .eq("id", factory.id)
      .single();

    const merged = {
      ...((existing?.platform_score_detail as Record<string, unknown>) ?? {}),
      ...parsed,
    };

    const updatePayload: Record<string, unknown> = {
      platform_score_detail: merged,
      last_synced_at: new Date().toISOString(),
      sync_status: "synced",
    };
    if (platform === "1688" && typeof parsed.repurchase_rate === "number") {
      updatePayload.repurchase_rate = parsed.repurchase_rate;
    }

    const { error: updErr } = await supabase
      .from("factories")
      .update(updatePayload)
      .eq("id", factory.id);

    if (updErr) throw new Error(`DB update: ${updErr.message}`);

    return json({ success: true, parsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-factory-platform] ${factory.name}:`, msg);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    await supabase
      .from("factories")
      .update({ sync_status: "error" })
      .eq("id", factory.id);

    return json({ success: false, error: msg }, 200);
  }
});
