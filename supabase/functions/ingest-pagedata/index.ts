// Public bookmarklet ingest endpoint.
// Receives window.pageData JSON from a 1688 shop page and upserts factories.
// Auth: shared bearer secret (no Supabase JWT) so it works from any browser.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SHARED_SECRET = "fg-angels-crawl-k8n3m7p2q9w5";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// deno-lint-ignore no-explicit-any
function extractFromPageData(pageData: any, shop_id: string) {
  if (!pageData) return null;
  const components = pageData.components || {};
  // deno-lint-ignore no-explicit-any
  const header: any = Object.values(components).find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c?.moduleName === "wp_pc_common_header",
  )?.moduleData || null;
  if (!header) return { _no_header: true };

  // deno-lint-ignore no-explicit-any
  const cardArr: any[] = Array.isArray(header.cardDetail) ? header.cardDetail : [];
  const card = Object.fromEntries(cardArr.map((d) => [d.code, d.info]));
  // deno-lint-ignore no-explicit-any
  const tagsArr: any[] = Array.isArray(header.businessTags) ? header.businessTags : [];
  const exp = Object.fromEntries(
    tagsArr.map((t) => [t.text, parseFloat(t.value) || null]),
  );

  const numOrNull = (v: unknown) => {
    const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (v: unknown) => {
    const n = parseInt(String(v ?? "").replace(/[^0-9\-]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };

  return {
    shop_id,
    name: header.companyName ?? null,
    service_score: numOrNull(header.customerStar),
    return_rate: numOrNull(header.byrRepeatRateText),
    years_in_business: intOrNull(header.tpYear),
    established_year: intOrNull(header.establishedYear),
    main_category: header.mainCate ?? null,
    ranking: header.rank?.rankText ?? null,
    province: header.addr?.province ?? null,
    city: header.addr?.capitalName ?? null,
    address: header.addr?.entAddress ?? null,
    seller_type: header.sellerType ?? null,
    consultation_score: exp["咨询体验"] ?? null,
    logistics_score: exp["物流体验"] ?? null,
    after_sales_score: exp["售后体验"] ?? null,
    product_score: exp["商品体验"] ?? null,
    repeat_customer_count: card.byrRepeatCustomer ?? null,
    cross_border_buyers: card.kjByrNum90D ?? null,
    is_brand_partner: card.supportAccountPeriod === "是",
    employee_count: intOrNull(card.employeeTotal),
    good_rate: numOrNull(card.goodRate),
    response_rate: numOrNull(card.wwResponseScore),
    factory_nature: card.factoryNature ?? null,
    oem_mode: card.OemMode ?? null,
    cert_type: header.certInfo?.certType ?? null,
    cert_number: header.certInfo?.certNum ?? null,
    product_count: pageData.globalData?.offerNum ?? null,
    is_factory: pageData.globalData?.features?.isFactory ?? null,
    is_shili_factory: pageData.globalData?.features?.isShiliFactory ?? null,
    _card_detail: card,
    _exp_scores: exp,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization") || "";
  if (auth !== `Bearer ${SHARED_SECRET}`) {
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  let body: { shop_id?: string; source_url?: string; pageData?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, 400);
  }

  let { shop_id, source_url, pageData } = body;
  if (!pageData || typeof pageData !== "object") {
    return json({ ok: false, reason: "missing_pagedata" }, 400);
  }
  if (!shop_id && typeof source_url === "string") {
    const m = source_url.match(/https?:\/\/([a-z0-9_]+)\.1688\.com/i);
    if (m && m[1].toLowerCase() !== "detail") shop_id = m[1];
  }
  if (!shop_id) return json({ ok: false, reason: "missing_shop_id" }, 400);

  const extracted = extractFromPageData(pageData, shop_id);
  // deno-lint-ignore no-explicit-any
  const pd: any = extracted && !(extracted as any)._no_header ? extracted : null;
  if (!pd) return json({ ok: false, reason: "pagedata_no_header" }, 422);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const canonical = source_url || `https://${shop_id}.1688.com/page/offerlist.htm`;

  const raw = {
    page_data_extracted: pd,
    page_data_raw: pageData,
    crawled_at: new Date().toISOString(),
    via: "bookmarklet",
  };

  // simple 6-axis P1 scores from header signals
  const clip10 = (n: number) => Math.max(0, Math.min(10, n));
  const svc = pd.service_score ?? 0;
  const ret = pd.return_rate ?? 0;
  const yrs = pd.years_in_business ?? 0;
  const cnt = pd.product_count ?? 0;
  const p1 = {
    self_shipping: 3.0,
    image_quality: 7.0,
    moq: 5.0,
    lead_time: clip10(yrs * 0.5 + ret * 0.05),
    communication: svc >= 4.5 ? 10 : svc >= 4.0 ? 7 : svc > 0 ? 4 : 5,
    variety: cnt >= 500 ? 10 : cnt >= 200 ? 7 : cnt >= 100 ? 4 : cnt > 0 ? 1 : 5,
  };
  const avg = +((p1.self_shipping + p1.image_quality + p1.moq + p1.lead_time + p1.communication + p1.variety) / 6).toFixed(1);

  const { data: existing } = await supa
    .from("factories")
    .select("id, user_id")
    .eq("shop_id", shop_id)
    .maybeSingle();

  const payload: Record<string, unknown> = {
    shop_id,
    source_url: canonical,
    source_platform: "1688",
    name: existing ? undefined : (pd.name ?? shop_id),
    raw_crawl_data: raw,
    raw_service_score: pd.service_score,
    raw_return_rate: pd.return_rate,
    raw_product_count: pd.product_count,
    raw_years_in_business: pd.years_in_business,
    raw_main_category: pd.main_category,
    raw_employee_count: pd.employee_count,
    province: pd.province ?? undefined,
    city: pd.city ?? undefined,
    p1_self_shipping_score: p1.self_shipping,
    p1_image_quality_score: p1.image_quality,
    p1_moq_score: p1.moq,
    p1_lead_time_score: p1.lead_time,
    p1_communication_score: p1.communication,
    p1_variety_score: p1.variety,
    score_status: "ai_scored",
    ai_scored_at: new Date().toISOString(),
    p1_crawled_at: new Date().toISOString(),
  };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

  let factoryId: string;
  if (existing) {
    const { error } = await supa.from("factories").update(payload).eq("id", existing.id);
    if (error) return json({ ok: false, reason: "db_error", detail: error.message }, 500);
    factoryId = existing.id;
  } else {
    // need a user_id; pick the first profile
    const { data: anyUser } = await supa.from("profiles").select("user_id").limit(1).maybeSingle();
    const userId = anyUser?.user_id;
    if (!userId) return json({ ok: false, reason: "no_owner_user" }, 500);
    const { data: ins, error } = await supa
      .from("factories")
      .insert({ ...payload, user_id: userId })
      .select("id")
      .single();
    if (error || !ins) return json({ ok: false, reason: "db_error", detail: error?.message }, 500);
    factoryId = ins.id;
  }

  return json({
    ok: true,
    factory_id: factoryId,
    factory_name: pd.name ?? shop_id,
    avg,
    scores: p1,
  });
});
