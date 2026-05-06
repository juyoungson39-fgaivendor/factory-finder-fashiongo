// Crawl an Alibaba.com supplier company_profile page via Apify and upsert factories.
// Input: { supplier_id?, alibaba_url?, force_recrawl? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const APIFY_TOKEN = Deno.env.get("APIFY_API_TOKEN") ?? "";
const ACTOR_ID = "apify~website-content-crawler";

function deriveSupplierId(input: {
  supplier_id?: string;
  alibaba_url?: string;
}): { supplier_id: string | null; url: string } {
  let sid = (input.supplier_id || "").trim().toLowerCase();
  let url = (input.alibaba_url || "").trim();
  if (!sid && url) {
    const m = url.match(/https?:\/\/([a-z0-9_-]+)\.(?:en\.)?alibaba\.com/i);
    if (m) sid = m[1].toLowerCase();
  }
  if (sid && !url) {
    url = `https://${sid}.en.alibaba.com/company_profile.html`;
  }
  return { supplier_id: sid || null, url };
}

const CAPTCHA_SIGNALS = [
  "captcha interception",
  "unusual traffic",
  "verify you are human",
  "punish",
  "baxia",
  "滑动验证",
  "异常访问",
];

function isCaptchaPage(html: string): boolean {
  if (!html || html.length < 5000) return true;
  const lower = html.toLowerCase();
  return CAPTCHA_SIGNALS.some((s) => lower.includes(s));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchWithCaptchaRetry(url: string): Promise<{
  ok: boolean;
  html?: string;
  reason?: string;
  diag?: unknown;
  attempts: number;
  captcha_hits: number;
}> {
  let captchaHits = 0;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`[fetch] attempt ${attempt}/3`);
    const r = await fetchHtmlViaApify(url);
    if (!r.ok) {
      if (attempt < 3) { await sleep(5000 * attempt); continue; }
      return { ok: false, reason: r.reason, diag: r.diag, attempts: attempt, captcha_hits: captchaHits };
    }
    if (!isCaptchaPage(r.html ?? "")) {
      return { ok: true, html: r.html, attempts: attempt, captcha_hits: captchaHits };
    }
    captchaHits++;
    console.log(`[fetch] captcha detected (hit ${captchaHits})`);
    if (attempt < 3) await sleep(5000 * attempt);
  }
  return { ok: false, reason: "captcha_persistent", attempts: 3, captcha_hits: captchaHits };
}

async function fetchHtmlViaApify(targetUrl: string): Promise<{
  ok: boolean;
  html?: string;
  status?: number;
  reason?: string;
  diag?: unknown;
}> {
  if (!APIFY_TOKEN) return { ok: false, reason: "no_apify_token" };
  const apiUrl =
    `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=90&memory=2048&format=json`;

  const input = {
    startUrls: [{ url: targetUrl }],
    crawlerType: "playwright:chrome",
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    saveHtml: true,
    saveMarkdown: false,
    htmlTransformer: "none",
    readableTextCharThreshold: 100,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: "US",
    },
    initialConcurrency: 1,
    maxRequestRetries: 3,
    requestTimeoutSecs: 90,
    pageLoadTimeoutSecs: 60,
    preNavigationHooks: `[
      async ({ page }) => {
        await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
      }
    ]`,
    postNavigationHooks: `[
      async ({ page }) => {
        await page.waitForTimeout(5000);
        try {
          await page.waitForSelector('text=/100%\\\\s*\\\\(\\\\d+\\\\)/', { timeout: 10000 });
        } catch (_) { /* ok */ }
      }
    ]`,
  };

  const r = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  console.log("[apify] status", r.status);
  const txt = await r.text();
  if (!r.ok) {
    return { ok: false, status: r.status, reason: "apify_http_error", diag: txt.slice(0, 500) };
  }
  let items: unknown[] = [];
  try {
    items = JSON.parse(txt);
  } catch {
    return { ok: false, reason: "apify_parse_error", diag: txt.slice(0, 500) };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, reason: "apify_empty", diag: txt.slice(0, 500) };
  }
  // deno-lint-ignore no-explicit-any
  const it: any = items[0];
  const html: string = it?.html || it?.body || "";
  if (!html) return { ok: false, reason: "no_html", diag: Object.keys(it || {}) };
  return { ok: true, html };
}

function num(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function parseAlibabaHtml(html: string) {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const out: Record<string, unknown> = { _raw_text_sample: text.slice(0, 2000) };

  // Company name (title or og:title)
  const titleM = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<title>([^<]+)<\/title>/i);
  const GENERIC_NAME = /^(Company\s*Overview|회사\s*개요|Profile|프로필|Home|홈|About|소개|Contact|연락처)$/i;
  if (titleM) {
    const parts = titleM[1].split(/\s*[-|–]\s*/).map((s) => s.trim()).filter(Boolean);
    out.name = parts.find((p) => !GENERIC_NAME.test(p)) ?? parts[parts.length - 1];
  }
  // h1 태그 우선 (정확도 더 높음)
  const h1M = html.match(/<h1[^>]*>\s*([^<]+?)\s*<\/h1>/i);
  if (h1M) {
    const h1Text = h1M[1].trim();
    if (h1Text.length > 5 && !GENERIC_NAME.test(h1Text)) {
      out.name = h1Text;
    }
  }

  // Product Quality 별점 분포 (e.g. "5 Stars 100% (190)")
  const starDistRe = /([1-5])\s*Stars?\s+(\d+)%\s*\((\d{1,6})\)/gi;
  const starDist: Record<string, number> = {};
  let starMatch: RegExpExecArray | null;
  while ((starMatch = starDistRe.exec(text)) !== null) {
    starDist[starMatch[1]] = parseInt(starMatch[3], 10);
  }
  if (Object.keys(starDist).length > 0) {
    out.star_distribution = starDist;
    out.product_review_count = Object.values(starDist).reduce((a, b) => a + b, 0);
  }

  // Review score & count — multiple patterns (EN + KO)
  const ratingPatterns: RegExp[] = [
    /(\d\.\d)\s*(?:\(\d+\))\s*\(?(\d{1,5})\s*(?:reviews?|ratings?|리뷰)\)?/i,
    /(\d\.\d)\s*★\s*\(?\s*(\d{1,5})\s*(?:reviews?|리뷰)\)?/i,
    /(?:Rating|평점|별점)\s*[:：]?\s*(\d\.\d).{0,40}?(\d{1,5})\s*(?:reviews?|리뷰)/i,
    /rating-score[^>]*>\s*(\d\.\d)\s*<[\s\S]{0,400}?(\d{1,5})\s*(?:reviews?|리뷰)/i,
    /(\d\.\d)\s*\/\s*5[^\d]{0,40}(\d{1,5})\s*(?:reviews?|리뷰)/i,
  ];
  for (const re of ratingPatterns) {
    const m = text.match(re) || html.match(re);
    if (m) { out.review_score = num(m[1]); out.review_count = num(m[2]); break; }
  }
  if (out.review_score == null) {
    const dataRating = html.match(/data-rating=["'](\d\.\d)["']/i);
    if (dataRating) out.review_score = num(dataRating[1]);
  }

  // Response time
  const respM = text.match(/(?:Avg(?:erage)?\.?\s*)?(?:response time|응답\s*시간)\s*[:：≤<]?\s*(\d+(?:\.\d+)?)\s*(?:h|시간|hr)/i);
  if (respM) out.response_time_hours = num(respM[1]);

  // On-time delivery (EN/KO) — multiple variants
  const otdPatterns: RegExp[] = [
    /On-time delivery rate[\s:：]*(\d+(?:\.\d+)?)\s*%/i,
    /(?:On-time delivery|On time delivery)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:On-?time|on time)\s*delivery/i,
    /Delivery on time\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/i,
    /정시\s*납품(?:율)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*%/,
  ];
  for (const re of otdPatterns) {
    const m = text.match(re);
    if (m) { out.on_time_delivery_rate = num(m[1]); break; }
  }
  if (out.on_time_delivery_rate == null) {
    const otdAttr = html.match(/data-otd=["'](\d+(?:\.\d+)?)["']/i)
      || html.match(/class=["'][^"']*delivery-rate[^"']*["'][^>]*>\s*(\d+(?:\.\d+)?)\s*%/i);
    if (otdAttr) out.on_time_delivery_rate = num(otdAttr[1]);
  }

  // Transaction volume USD
  const volM = text.match(/US\s*\$\s*([\d.,]+)\s*([MK])?\+?/i);
  if (volM) {
    let v = parseFloat(volM[1].replace(/,/g, ""));
    if (volM[2]?.toUpperCase() === "M") v *= 1_000_000;
    if (volM[2]?.toUpperCase() === "K") v *= 1_000;
    out.transaction_volume_usd = Math.round(v);
  }

  // Transaction count
  const txM = text.match(/(\d{1,6})\s*(?:transactions?|orders?|deals?|거래)/i);
  if (txM) out.transaction_count = num(txM[1]);

  // Gold supplier years (EN/KO)
  const goldPatterns: RegExp[] = [
    /(\d{1,2})\s*(?:yrs?|years?|년)\s*(?:on\s*)?(?:Alibaba|Gold\s*Supplier)/i,
    /Gold\s*Supplier\s*[-:]?\s*(\d{1,2})\s*(?:yrs?|years?|년)/i,
    /Alibaba\s*(?:에서\s*)?(\d{1,2})\s*년/i,
  ];
  for (const re of goldPatterns) {
    const m = text.match(re);
    if (m) { out.gold_supplier_years = num(m[1]); break; }
  }

  // Export years (EN/KO) — broadened
  const expPatterns: RegExp[] = [
    /(?:Over|More than)\s*(\d{1,2})\+?\s*years?\s*(?:of\s*)?(?:export|exporting)/i,
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:export|exporting|in export)/i,
    /Exporting\s*(?:for\s*)?(\d{1,2})\+?\s*years?/i,
    /Export\s*experience\s*[:：]?\s*(\d{1,2})/i,
    /수출\s*(?:업계에서\s*)?(\d{1,2})\s*년/,
    /(\d{1,2})\s*년\s*(?:이상\s*)?수출/,
  ];
  for (const re of expPatterns) {
    const m = text.match(re);
    if (m) { out.export_years = num(m[1]); break; }
  }

  // Verified by
  const verifM = text.match(/(?:Verified by|인증\s*기관)\s*[:：]?\s*([A-Za-z0-9 .&-]+?)(?:\s{2,}|$|\.|,)/i);
  if (verifM) out.verified_by = verifM[1].trim().slice(0, 80);

  // Trade Assurance
  out.trade_assurance = /Trade\s*Assurance/i.test(text);

  // Main markets
  const marketsM = text.match(/(?:Main Markets?|주요\s*시장)\s*[:：]?\s*([A-Za-z, /&-]+?)(?:\s{2,}|Year|Total|Main|Number|연도|총)/i);
  if (marketsM) {
    out.main_markets = marketsM[1]
      .split(/[,/]/)
      .map((s) => s.trim())
      .filter((s) => s && s.length < 40);
  }

  // Capabilities
  const capChunks: string[] = [];
  for (const re of [/Agile Supply Chain/i, /Full Customization/i, /Quality Inspection/i, /OEM/i, /ODM/i, /R&D/i]) {
    const m = text.match(re);
    if (m) capChunks.push(m[0]);
  }
  if (capChunks.length) out.capabilities = Array.from(new Set(capChunks));

  // 서브 카테고리 수 (메뉴 트리에서 productgrouplist 링크 카운트)
  const subCatMatches = html.match(/href="\/productgrouplist-\d+/g);
  out.sub_category_count = subCatMatches ? new Set(subCatMatches).size : null;

  // NewArrivals / Promotion 탭 존재
  out.has_new_arrivals_tab = /\/custom_page\/NewArrivals\.htm|NewArrivals/i.test(html);
  out.has_promotion_tab = /\/promotionPage\.html|Promotion/i.test(html);

  // Production 탭 카운트
  const prodTabM = text.match(/Production\s*\(\s*(\d+)\s*\)/i)
    || text.match(/생산\s*\(\s*(\d+)\s*\)/);
  if (prodTabM) out.production_tab_count = num(prodTabM[1]);

  // Drawing-based customization
  if (/Drawing-based\s*customization|디자인을\s*통한\s*맞춤\s*제작/i.test(text)) {
    out.capabilities = Array.from(new Set([...((out.capabilities as string[]) ?? []), 'Drawing-based Customization']));
  }

  // Category ranking (EN + KO)
  const rankPatterns: Array<{ re: RegExp; fmt: (m: RegExpMatchArray) => string }> = [
    { re: /Top\s*(?:Factory|Supplier)?\s*#?\s*(\d+)\s*in\s*([A-Za-z' &-]+)/i, fmt: (m) => `Top #${m[1]} in ${m[2].trim()}` },
    { re: /Leading\s*factory\s*#(\d+)\s*in\s*([A-Za-z' &-]+)/i, fmt: (m) => `Top #${m[1]} in ${m[2].trim()}` },
    { re: /Top\s*factory\s*in\s*([A-Za-z' &-]+?)\s*#(\d+)/i, fmt: (m) => `Top #${m[2]} in ${m[1].trim()}` },
    { re: /#(\d+)\s*(?:in|of)\s*([A-Za-z][A-Za-z' &-]{2,40}?)(?=[\s.,]|$)/, fmt: (m) => `Top #${m[1]} in ${m[2].trim()}` },
    { re: /([가-힣A-Za-z ]+?)\s*분야\s*중\s*선도적인\s*(?:공장|공급사)\s*#(\d+)/, fmt: (m) => `Top #${m[2]} in ${m[1].trim()}` },
    { re: /선도적인\s*(?:공장|공급사)\s*#(\d+)\s*(?:in|·)\s*([가-힣A-Za-z ]+)/, fmt: (m) => `Top #${m[1]} in ${m[2].trim()}` },
  ];
  for (const { re, fmt } of rankPatterns) {
    const m = text.match(re);
    if (m) { out.category_ranking = fmt(m); break; }
  }

  // Country/province
  const provM = text.match(/(?:Located in|Province|Region|소재지)\s*[:：]?\s*([A-Za-z가-힣 ]+?)(?:\s{2,}|,|China|중국)/i);
  if (provM) out.province = provM[1].trim();

  return out;
}

function scoreP1(d: Record<string, unknown>) {
  const clip = (n: number) => Math.max(0, Math.min(10, n));
  const review = Number(d.review_count ?? 0) + Number(d.product_review_count ?? 0);
  const otd = Number(d.on_time_delivery_rate ?? 0);
  const resp = Number(d.response_time_hours ?? 24);
  const ta = d.trade_assurance ? 1 : 0;
  const caps = (Array.isArray(d.capabilities) ? d.capabilities as string[] : []);
  const hasFull = caps.some((c) => /full\s*custom/i.test(c));
  const hasOemOdm = caps.some((c) => /OEM|ODM/i.test(c));
  const hasRank = !!d.category_ranking;
  const markets = Array.isArray(d.main_markets) ? (d.main_markets as string[]).length : 0;

  return {
    self_shipping: clip(ta * 8 + (resp <= 6 ? 2 : 0)),
    image_quality: 7.0,
    moq: clip((hasFull ? 5 : 0) + (hasOemOdm ? 3 : 0) + (hasRank ? 2 : 0)),
    lead_time: otd >= 98 ? 10 : otd >= 95 ? 8 : otd >= 90 ? 6 : otd >= 80 ? 4 : 2,
    communication: resp <= 3 ? 10 : resp <= 6 ? 8 : resp <= 12 ? 6 : resp <= 24 ? 4 : 2,
    variety: clip(
      (review >= 100 ? 10 : review >= 50 ? 7 : review >= 20 ? 4 : 2) + Math.min(markets / 5, 2),
    ),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: { supplier_id?: string; alibaba_url?: string; force_recrawl?: boolean };
  try { body = await req.json(); } catch { return json({ ok: false, reason: "invalid_json" }, 400); }

  const { supplier_id, url } = deriveSupplierId(body);
  if (!supplier_id || !url) return json({ ok: false, reason: "missing_supplier_or_url" }, 400);

  console.log("[1/4] supplier_id:", supplier_id, "url:", url);

  const fetchRes = await fetchWithCaptchaRetry(url);
  console.log("[2/4] fetch ok:", fetchRes.ok, "reason:", fetchRes.reason, "html_len:", fetchRes.html?.length);
  if (!fetchRes.ok) {
    // Captcha/anti-bot blocks are expected from Alibaba — return 200 so the
    // client can surface a friendly retry message instead of a runtime error.
    const isCaptcha = fetchRes.reason === "captcha_persistent";
    return json(
      {
        ok: false,
        reason: fetchRes.reason,
        diag: fetchRes.diag,
        retryable: isCaptcha,
        message: isCaptcha
          ? "Alibaba가 봇 차단(captcha)을 걸고 있습니다. 잠시 후 다시 시도해 주세요."
          : "공급업체 페이지를 가져오지 못했습니다.",
      },
      isCaptcha ? 200 : 502,
    );
  }

  const parsed = parseAlibabaHtml(fetchRes.html!);
  const p1 = scoreP1(parsed);
  const avg = +(Object.values(p1).reduce((a, b) => a + b, 0) / 6).toFixed(1);
  console.log("[3/4] parsed keys:", Object.keys(parsed).length, "avg:", avg);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: existing } = await supa
    .from("factories")
    .select("id, user_id")
    .eq("alibaba_supplier_id", supplier_id)
    .maybeSingle();

  const raw = { parsed, crawled_at: new Date().toISOString(), via: "apify-website-content-crawler", source_url: url };

  const payload: Record<string, unknown> = {
    alibaba_supplier_id: supplier_id,
    alibaba_url: url,
    source_url: url,
    source_platform: "alibaba",
    name: (parsed.name as string) ?? supplier_id,
    review_score: parsed.review_score ?? null,
    review_count: parsed.review_count ?? null,
    product_review_count: parsed.product_review_count ?? null,
    star_distribution: parsed.star_distribution ?? null,
    response_time_hours: parsed.response_time_hours ?? null,
    on_time_delivery_rate: parsed.on_time_delivery_rate ?? null,
    transaction_volume_usd: parsed.transaction_volume_usd ?? null,
    transaction_count: parsed.transaction_count ?? null,
    gold_supplier_years: parsed.gold_supplier_years ?? null,
    export_years: parsed.export_years ?? null,
    verified_by: parsed.verified_by ?? null,
    trade_assurance: parsed.trade_assurance ?? false,
    main_markets: parsed.main_markets ?? null,
    capabilities: parsed.capabilities ?? null,
    category_ranking: parsed.category_ranking ?? null,
    province: parsed.province ?? undefined,
    raw_crawl_data: raw,
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
    if (error) return json({ ok: false, reason: "db_update_error", detail: error.message }, 500);
    factoryId = existing.id;
  } else {
    const { data: anyUser } = await supa.from("profiles").select("user_id").limit(1).maybeSingle();
    const userId = anyUser?.user_id;
    if (!userId) return json({ ok: false, reason: "no_owner_user" }, 500);
    const insertPayload = { ...payload, user_id: userId, shop_id: supplier_id };
    const { data: ins, error } = await supa.from("factories").insert(insertPayload).select("id").single();
    if (error || !ins) return json({ ok: false, reason: "db_insert_error", detail: error?.message }, 500);
    factoryId = ins.id;
  }

  console.log("[4/4] upserted factory:", factoryId);

  return json({
    ok: true,
    factory_id: factoryId,
    supplier_id,
    name: parsed.name,
    avg,
    scores: p1,
    parsed_summary: {
      review_score: parsed.review_score,
      review_count: parsed.review_count,
      product_review_count: parsed.product_review_count,
      star_distribution: parsed.star_distribution,
      response_time_hours: parsed.response_time_hours,
      on_time_delivery_rate: parsed.on_time_delivery_rate,
      transaction_volume_usd: parsed.transaction_volume_usd,
      gold_supplier_years: parsed.gold_supplier_years,
      export_years: parsed.export_years,
      category_ranking: parsed.category_ranking,
      verified_by: parsed.verified_by,
      trade_assurance: parsed.trade_assurance,
    },
    _debug: {
      html_length: fetchRes.html?.length ?? 0,
      text_sample: parsed._raw_text_sample,
      parsed_keys: Object.keys(parsed).filter((k) => k !== "_raw_text_sample"),
      fetch_attempts: fetchRes.attempts,
      captcha_hits: fetchRes.captcha_hits,
    },
  });
});
