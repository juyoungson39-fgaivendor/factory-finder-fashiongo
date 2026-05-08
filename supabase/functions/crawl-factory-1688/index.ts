import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type FetchDiag = {
  status: number | null;
  length: number;
  content_type: string | null;
  via: 'apify' | 'firecrawl' | 'direct' | 'none';
  blocked_signals: { captcha: boolean; login_wall: boolean; anti_bot: boolean };
  body_preview: string;
  error_type?: string;
  error_message?: string;
  approval_url?: string;
};

function classifyFetchFailure(diag: FetchDiag) {
  if (diag.error_type === 'full-permission-actor-not-approved') {
    return 'apify_actor_permission_required';
  }
  if (diag.via === 'none') return 'apify_token_missing';
  if (diag.status && diag.status >= 500) return 'apify_failed';
  if (diag.blocked_signals.captcha || diag.blocked_signals.anti_bot || diag.blocked_signals.login_wall) {
    return 'apify_blocked';
  }
  return 'fetch_blocked_or_empty';
}

function detectBlockedSignals(html: string) {
  const h = html || '';
  return {
    captcha: /punish|captcha|verify/i.test(h),
    login_wall: h.includes('登录') || /login\.html/i.test(h),
    anti_bot: h.includes('异常访问') || h.includes('滑动验证'),
  };
}

// Extract window.pageData JSON from HTML
function extractPageDataFromHtml(html: string): Record<string, unknown> | null {
  if (!html) return null;
  const patterns = [
    /window\.pageData\s*=\s*(\{[\s\S]*?\});\s*window\.isOnline/,
    /window\.pageData\s*=\s*(\{[\s\S]*?\})\s*;[\s\n]*window\./,
    /window\.pageData\s*=\s*(\{[\s\S]*?\})\s*;\s*<\/script>/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) {
      try { return JSON.parse(m[1]); } catch (_) { /* try next */ }
    }
  }
  return null;
}

async function fetchViaApify(url: string, timeoutMs = 90000): Promise<{
  html: string;
  pageData: Record<string, unknown> | null;
  diag: FetchDiag;
}> {
  const diag: FetchDiag = {
    status: null, length: 0, content_type: null, via: 'apify',
    blocked_signals: { captcha: false, login_wall: false, anti_bot: false },
    body_preview: '',
  };
  const APIFY_TOKEN = Deno.env.get('APIFY_API_TOKEN') || Deno.env.get('APIFY_TOKEN');
  console.log('[1/5] APIFY_TOKEN exists:', !!APIFY_TOKEN, 'url:', url);
  if (!APIFY_TOKEN) {
    diag.via = 'none';
    return { html: '', pageData: null, diag };
  }
  // Switch to website-content-crawler — does NOT require full-permission approval.
  const apiUrl = `https://api.apify.com/v2/acts/apify~website-content-crawler/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=${Math.floor(timeoutMs / 1000)}`;
  const input = {
    startUrls: [{ url }],
    crawlerType: 'playwright:chrome',
    maxCrawlDepth: 0,
    maxCrawlPages: 1,
    saveHtml: true,
    saveMarkdown: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'], apifyProxyCountry: 'CN' },
    initialCookies: [],
    removeCookieWarnings: false,
    clickElementsCssSelector: '',
    waitForSelectorOnLoad: '',
    htmlTransformer: 'none',
    readableTextCharThreshold: 100,
    removeElementsCssSelector: '',
  };
  console.log('[2/5] Calling Apify with input:', JSON.stringify(input).slice(0, 500));
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs + 5000);
    const res = await fetch(apiUrl, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    clearTimeout(t);
    diag.status = res.status;
    diag.content_type = res.headers.get('content-type');
    console.log('[3/5] Apify response status:', res.status, 'url:', url);
    const body = await res.text();
    console.log('[4/5] Apify body (first 1000 chars):', body.slice(0, 1000));
    if (!res.ok) {
      const errTxt = body;
      diag.body_preview = errTxt.slice(0, 1500);
      try {
        const parsed = JSON.parse(errTxt);
        diag.error_type = parsed?.error?.type;
        diag.error_message = parsed?.error?.message;
        diag.approval_url = parsed?.error?.data?.approvalUrl;
      } catch (_) {
        // Keep raw preview only when Apify does not return JSON.
      }
      console.log(`[crawl-1688] apify HTTP ${res.status} for ${url}: ${errTxt.slice(0, 300)}`);
      return { html: '', pageData: null, diag };
    }
    let items;
    try {
      items = JSON.parse(body);
    } catch (_) {
      diag.error_type = 'apify_response_not_json';
      diag.body_preview = body.slice(0, 1500);
      console.error('[X] JSON parse failed. Body was:', body.slice(0, 500));
      return { html: '', pageData: null, diag };
    }
    console.log('[5/5] Items count:', items?.length, 'first item keys:', Object.keys(items?.[0] || {}));
    const item = Array.isArray(items) ? items[0] : null;
    // website-content-crawler stores raw HTML under `html`
    const html: string = item?.html || item?.body || '';
    const pageData = extractPageDataFromHtml(html);
    const blocked = detectBlockedSignals(html);
    diag.length = html.length;
    diag.body_preview = html.slice(0, 1500);
    diag.blocked_signals = blocked;
    console.log(`[3.5/5] HTML length: ${html?.length} pageData found: ${!!pageData}`);
    console.log(`[crawl-1688] apify ${url} len=${html.length} hasPageData=${!!pageData} blocked=${JSON.stringify(blocked)}`);
    return { html, pageData, diag };
  } catch (e) {
    console.log(`[crawl-1688] apify error ${url}: ${e instanceof Error ? e.message : String(e)}`);
    return { html: '', pageData: null, diag };
  }
}

async function fetchWithRetry(url: string, _retries = 1, _deadlineMs?: number): Promise<{ html: string; pageData: Record<string, unknown> | null; diag: FetchDiag }> {
  return await fetchViaApify(url);
}

function clip10(n: number) {
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10));
}

function priceStats(prices: number[]) {
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    sample_count: sorted.length,
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round((sum / sorted.length) * 100) / 100,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function avgOrSignal(moqs: number[], signals: { mixed_batch: boolean; dropshipping: boolean }) {
  if (signals.dropshipping) return 10;
  if (signals.mixed_batch) return 8;
  if (!moqs.length) return 5;
  const avg = moqs.reduce((a, b) => a + b, 0) / moqs.length;
  if (avg <= 2) return 10;
  if (avg <= 5) return 8;
  if (avg <= 10) return 6;
  if (avg <= 30) return 4;
  return 2;
}

function extractSales(text: string) {
  return [...text.matchAll(/已售\s*(\d+(?:\.\d+)?[wk万]?)/g)].map((m) => m[1]).slice(0, 10);
}

function pct(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

// Extract header info from offerlist page
function extractHeader(text: string, html: string) {
  const main_category = text.match(/主营[类類]目[:：]\s*([^\s<\n]+)/)?.[1] ?? null;
  const fan_count = text.match(/关注[·•]?\s*([\d.]+[wkWK万千]?)\s*粉丝/)?.[1]
    ?? text.match(/([\d.]+[wkWK万千]?)\s*粉丝/)?.[1] ?? null;
  const estM = text.match(/(\d{4})\.(\d{1,2})\s*(?:成立|创办)/)
    ?? text.match(/成立(?:时间|于)?[:：]?\s*(\d{4})[-./年]\s*(\d{1,2})?/);
  const established_year = estM ? parseInt(estM[1], 10) : null;
  const established_month = estM && estM[2] ? parseInt(estM[2], 10) : null;
  const ranking = text.match(/上榜([^<\n]+?)(?:TOP|榜)\s*\d+/)?.[0] ?? null;
  const BADGE_LIST = ['实力商家', '跨境合作商', '深度认证', 'TUV', '金牌卖家', '诚信通'];
  const badges = BADGE_LIST.filter(b => text.includes(b));
  return { main_category, fan_count, established_year, established_month, ranking, badges };
}

// 4-axis evaluation
function extractAxes(text: string) {
  const num = (re: RegExp) => {
    const m = text.match(re);
    return m ? parseFloat(m[1]) : null;
  };
  return {
    consultation: num(/咨询体验[\s\n]*([\d.]+)/),
    logistics: num(/物流体验[\s\n]*([\d.]+)/),
    after_sales: num(/售后体验[\s\n]*([\d.]+)/),
    product_exp: num(/商品体验[\s\n]*([\d.]+)/),
  };
}

// Business operations from creditdetail.htm
function extractBusinessOps(text: string) {
  const pick = (re: RegExp) => text.match(re)?.[1]?.trim().replace(/\s+/g, ' ') ?? null;
  const num = (re: RegExp) => {
    const v = pick(re);
    if (!v) return null;
    const n = parseInt(v.replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };
  return {
    business_model: pick(/经营模式[\s:：]*([^\n<]{1,40}?)(?=\s{2,}|厂房|设备|员工|$)/),
    factory_area: pick(/厂房面积[\s:：]*([^\n<]{1,40}?)(?=\s{2,}|设备|员工|$)/),
    equipment_count: num(/设备总数[\s:：]*(\d+[^\n]{0,20})/),
    employee_count: num(/员工总人数[\s:：]*(\d+[^\n]{0,20})/),
    production_lines: num(/生产流水线[\s:：]*(\d+[^\n]{0,20})/),
    annual_revenue: pick(/年交易额[\s:：]*([^\n<]{1,40}?)(?=\s{2,}|年均|研发|$)/),
    new_per_year: pick(/年均新款[\s:：]*([^\n<]{1,40}?)(?=\s{2,}|研发|代工|$)/),
    rd_staff: num(/研发人员[\s:：]*(\d+[^\n]{0,20})/),
    oem_mode: pick(/代工模式[\s:：]*([^\n<]{1,40}?)(?=\s{2,}|自主|铺货|$)/),
    self_sampling: pick(/自主打样[\s:：]*([^\n<]{1,30}?)(?=\s{2,}|铺货|$)/),
    distribution_channels: num(/铺货渠道数量[\s:：]*(\d+[^\n]{0,20})/),
  };
}

// 30-day trade KPIs
function extract30Day(text: string) {
  const pick = (label: string) => {
    const re = new RegExp(label + '[\\s:：]*([\\d.]+%?)');
    return text.match(re)?.[1] ?? null;
  };
  const paidOrders = (() => {
    const m = text.match(/最近30天支付订单数[\s:：]*([\d,]+)/);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  })();
  return {
    paid_orders_30d: paidOrders,
    pickup_48h_rate: pct(pick('48H揽收率')),
    fulfillment_48h_rate: pct(pick('48H履约率')) ?? pct(pick('按时发货率')),
    response_3min_rate: pct(pick('3分钟响应率')),
    quality_return_rate: pct(pick('品质退货率')),
    dispute_rate: pct(pick('纠纷率')),
  };
}

// Certifications: extract image+caption pairs from credit page
function extractCertifications(html: string) {
  const certs: { image: string; caption: string }[] = [];
  // crude: find img tags within 资质证书 section
  const sectionM = html.match(/资质证书[\s\S]{0,5000}/);
  if (!sectionM) return certs;
  const sec = sectionM[0];
  const imgRe = /<img[^>]+src="([^"]+)"[^>]*(?:alt|title)="([^"]+)"/g;
  let m;
  while ((m = imgRe.exec(sec)) && certs.length < 10) {
    if (m[1].startsWith('http') || m[1].startsWith('//')) {
      certs.push({ image: m[1].startsWith('//') ? 'https:' + m[1] : m[1], caption: m[2] });
    }
  }
  return certs;
}

// Contact info from contactinfo.htm
function extractContact(text: string) {
  const pickFirst = (re: RegExp) => {
    const m = text.match(re);
    return m ? m[1].trim().replace(/\s+/g, ' ') : null;
  };
  return {
    person: pickFirst(/联\s*系\s*人[:：]\s*([^\s<>:：]{1,40})/),
    role: pickFirst(/(?:职\s*务|职位)[:：]\s*([^\s<>]{1,30})/),
    fixed_phone: pickFirst(/(?:固\s*定\s*电\s*话|电\s*话|固\s*话)[:：]\s*([\d\-\(\)\s转分机]{6,40})/),
    mobile: pickFirst(/(?:移\s*动\s*电\s*话|手\s*机)[:：]\s*([\d\-\s]{6,30})/),
    fax: pickFirst(/传\s*真[:：]\s*([\d\-\s]{6,30})/),
    address: pickFirst(/地\s*址[:：]\s*([^<>]{4,200}?)(?=\s{2,}|联系|电话|传真|邮编|网址|$)/),
    postcode: pickFirst(/邮\s*编[:：]\s*(\d{4,8})/),
    wangwang: pickFirst(/(?:旺\s*旺|阿里旺旺)[:：]\s*([A-Za-z0-9_\-]{3,40})/i),
    wechat: pickFirst(/(?:微\s*信|WeChat)[:：]\s*([A-Za-z0-9_\-]{3,40})/i),
  };
}

// Extract structured fields from window.pageData JSON (preferred over regex)
// deno-lint-ignore no-explicit-any
function extractFromPageData(pageData: any, shop_id: string) {
  if (!pageData) return null;
  const components = pageData.components || {};
  // deno-lint-ignore no-explicit-any
  const header: any = Object.values(components).find(
    // deno-lint-ignore no-explicit-any
    (c: any) => c?.moduleName === 'wp_pc_common_header'
  )?.moduleData || null;
  if (!header) return { _no_header: true };

  // deno-lint-ignore no-explicit-any
  const cardArr: any[] = Array.isArray(header.cardDetail) ? header.cardDetail : [];
  const card = Object.fromEntries(cardArr.map((d) => [d.code, d.info]));

  // deno-lint-ignore no-explicit-any
  const tagsArr: any[] = Array.isArray(header.businessTags) ? header.businessTags : [];
  const exp = Object.fromEntries(
    tagsArr.map((t) => [t.text, parseFloat(t.value) || null])
  );

  const numOrNull = (v: unknown) => {
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  };
  const intOrNull = (v: unknown) => {
    const n = parseInt(String(v ?? '').replace(/[^0-9\-]/g, ''), 10);
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
    consultation_score: exp['咨询体验'] ?? null,
    logistics_score: exp['物流体验'] ?? null,
    after_sales_score: exp['售后体验'] ?? null,
    product_score: exp['商品体验'] ?? null,
    repeat_customer_count: card.byrRepeatCustomer ?? null,
    cross_border_buyers: card.kjByrNum90D ?? null,
    is_brand_partner: card.supportAccountPeriod === '是',
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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }


  try {
    const { url, shop_id: requestedShopId, visit_notes } = await req.json();
    const crawlUrl = typeof url === 'string' && url.trim()
      ? url.trim()
      : typeof requestedShopId === 'string' && requestedShopId.trim()
        ? `https://${requestedShopId.trim()}.1688.com/page/offerlist.htm`
        : '';
    if (!crawlUrl) {
      return json({ ok: false, reason: "invalid_url" }, 400);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ ok: false, reason: "unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // 1) URL parse
    let shop_id: string | null = null;
    let canonical = crawlUrl;
    let offer_id: string | null = null;

    const subM = crawlUrl.match(/https?:\/\/([a-z0-9_]+)\.1688\.com/i);
    const detM = crawlUrl.match(/detail\.1688\.com\/offer\/(\d+)/);

    if (subM && subM[1].toLowerCase() !== "detail") {
      shop_id = subM[1];
      canonical = `https://${shop_id}.1688.com/page/offerlist.htm`;
    } else if (detM) {
      offer_id = detM[1];
      const { html: detailHtml } = await fetchWithRetry(crawlUrl);
      const sub = detailHtml.match(/https?:\/\/([a-z0-9_]+)\.1688\.com\/page\/offerlist/i);
      if (sub) {
        shop_id = sub[1];
        canonical = `https://${shop_id}.1688.com/page/offerlist.htm`;
      } else {
        return json({ ok: false, reason: "shop_id_extract_failed", offer_id }, 422);
      }
    } else {
      return json({ ok: false, reason: "invalid_url" }, 400);
    }

    console.log(`[crawl-1688] canonical=${canonical} (input=${crawlUrl})`);

    // 2) Fetch 3 pages in parallel — share a 120s deadline to stay under 150s edge limit
    const deadline = Date.now() + 120000;
    const offerlistUrl = canonical;
    const creditUrl = `https://${shop_id}.1688.com/page/creditdetail.htm`;
    const contactUrl = `https://${shop_id}.1688.com/page/contactinfo.htm`;
    const [offerRes, creditRes, contactRes] = await Promise.all([
      fetchWithRetry(offerlistUrl, 1, deadline),
      fetchWithRetry(creditUrl, 1, deadline),
      fetchWithRetry(contactUrl, 1, deadline),
    ]);

    const offerHtml = offerRes.html;
    if (!offerHtml || offerHtml.length < 1000) {
      const reason = classifyFetchFailure(offerRes.diag);
      return json({
        ok: false,
        reason,
        canonical,
        approval_url: offerRes.diag.approval_url,
        diag: offerRes.diag,
      });
    }

    const offerText = offerHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const creditText = (creditRes.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const contactText = (contactRes.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const combinedText = offerText + " " + creditText;

    // 3a) Header (regex fallback) + JSON-based pageData (preferred)
    const header = extractHeader(combinedText, offerHtml);
    const pageDataExtracted = extractFromPageData(offerRes.pageData, shop_id);


    // 4) 4-axis
    const axes = extractAxes(combinedText);

    // 5) Business ops + 30d + certs (from credit page primarily)
    const business = extractBusinessOps(creditText);
    const trade30d = extract30Day(creditText);
    const certifications = extractCertifications(creditRes.html || offerHtml);

    // 6) Contact
    const contact = extractContact(contactText);

    // 7) Legacy regex fields
    const yrs = parseInt(combinedText.match(/入驻\s*(\d+)\s*年/)?.[1] ?? "0", 10);
    const svc = parseFloat(combinedText.match(/服务分\s*([\d.]+)/)?.[1] ?? "0");
    const ret = parseInt(combinedText.match(/回头率\s*(\d+)%/)?.[1] ?? "0", 10);
    const cnt = parseInt(combinedText.match(/共\s*(\d+)\s*件相关产品/)?.[1] ?? "0", 10);
    const ontime_rate = trade30d.fulfillment_48h_rate;
    const positive_review_rate = (() => {
      const m = combinedText.match(/(?:好评率|正面评价率)\s*([\d.]+)\s*%/);
      return m ? parseFloat(m[1]) : null;
    })();
    const subcategory_count = (() => {
      const m = combinedText.match(/经营(?:范围|类目)[:：][^\n]{0,200}/);
      if (!m) return null;
      const parts = m[0].split(/[、,，;；\/]/).filter(s => s.trim().length > 1);
      return parts.length > 1 ? parts.length : null;
    })();
    const prices = [...offerText.matchAll(/¥\s*(\d+(?:\.\d+)?)/g)]
      .map((m) => parseFloat(m[1])).slice(0, 30);
    const moqs = [...offerText.matchAll(/(\d+)\s*件起订/g)].map((m) => parseInt(m[1], 10));
    const signals = {
      mixed_batch: /混批/.test(offerText),
      dropshipping: /一件代发|代发/.test(offerText),
      custom_accepted: /接受定制|OEM|ODM/.test(offerText),
    };

    // 8) AI summary placeholder (店铺推荐 page is JS-heavy, may be empty)
    const ai_summary_match = combinedText.match(/该商家(.{20,400}?)(?=\n|公司信息|主营)/);
    const platform_ai_summary = ai_summary_match ? ai_summary_match[0].trim() : null;

    // 9) P1 scores
    const p1 = {
      self_shipping: 3.0,
      image_quality: 7.0,
      moq: avgOrSignal(moqs, signals),
      lead_time: clip10(yrs * 0.5 + ret * 0.05),
      communication: svc >= 3.0 ? 10 : svc >= 2.0 ? 7 : svc > 0 ? 4 : 5,
      variety: cnt >= 500 ? 10 : cnt >= 200 ? 7 : cnt >= 100 ? 4 : cnt > 0 ? 1 : 5,
    };

    // 10) Combined raw payload
    const raw = {
      // legacy keys (kept for backward-compat with UI)
      fan_count: header.fan_count,
      main_category: header.main_category,
      ontime_rate,
      positive_review_rate,
      established_year: header.established_year,
      established_month: header.established_month,
      subcategory_count,
      price_stats: priceStats(prices),
      signals,
      top_sales: extractSales(offerText),
      offer_id,
      contact,
      // new expanded sections
      header,
      axes,
      business,
      trade_30d: trade30d,
      certifications,
      platform_ai_summary,
      // Apify pageData JSON (preferred source — has all 30+ fields cleanly)
      page_data_extracted: pageDataExtracted,
      page_data_raw: offerRes.pageData ?? null,
      pages_fetched: {
        offerlist: { length: offerHtml.length, status: offerRes.diag.status, has_pagedata: !!offerRes.pageData },
        creditdetail: { length: (creditRes.html || '').length, status: creditRes.diag.status },
        contactinfo: { length: (contactRes.html || '').length, status: contactRes.diag.status },
      },
      crawled_at: new Date().toISOString(),
    };


    // 11) DB upsert
    const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    // deno-lint-ignore no-explicit-any
    const pd: any = pageDataExtracted && !pageDataExtracted._no_header ? pageDataExtracted : null;
    const inferredName =
      pd?.name
      || offerText.match(/([\u4e00-\u9fa5]+(?:服饰|服装|贸易|实业|有限公司|供应链)[\u4e00-\u9fa5]*)/)?.[1]
      || shop_id;


    const combinedPhone = [contact.fixed_phone, contact.mobile].filter(Boolean).join(" / ") || null;

    const { data: existing } = await supa
      .from("factories")
      .select("id, user_id")
      .eq("shop_id", shop_id)
      .maybeSingle();

    const payload: Record<string, unknown> = {
      shop_id,
      source_url: canonical,
      source_platform: "1688",
      name: existing ? undefined : inferredName,
      raw_crawl_data: raw,
      raw_service_score: pd?.service_score ?? (svc || null),
      raw_return_rate: pd?.return_rate ?? (ret || null),
      raw_product_count: pd?.product_count ?? (cnt || null),
      raw_years_in_business: pd?.years_in_business ?? (yrs || null),

      // new dedicated columns
      raw_main_category: header.main_category ?? undefined,
      raw_employee_count: business.employee_count ?? undefined,
      raw_paid_orders_30d: trade30d.paid_orders_30d ?? undefined,
      raw_response_3min_rate: trade30d.response_3min_rate ?? undefined,
      raw_dispute_rate: trade30d.dispute_rate ?? undefined,
      raw_business_model: business.business_model ?? undefined,
      contact_full: contact,
      platform_ai_summary: platform_ai_summary ?? undefined,
      // contact text fields
      contact_name: contact.person || undefined,
      contact_phone: combinedPhone || undefined,
      contact_wechat: contact.wechat || undefined,
      // p1
      p1_self_shipping_score: p1.self_shipping,
      p1_image_quality_score: p1.image_quality,
      p1_moq_score: p1.moq,
      p1_lead_time_score: p1.lead_time,
      p1_communication_score: p1.communication,
      p1_variety_score: p1.variety,
      score_status: "ai_scored",
      ai_scored_at: new Date().toISOString(),
      p1_crawled_at: new Date().toISOString(),
      visited_in_person: !!visit_notes,
      visit_notes: visit_notes ?? null,
    };
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

    let factoryId: string;
    if (existing) {
      const { error: upErr } = await supa.from("factories").update(payload).eq("id", existing.id);
      if (upErr) return json({ ok: false, reason: "db_error", detail: upErr.message }, 500);
      factoryId = existing.id;
    } else {
      const { data: ins, error: insErr } = await supa
        .from("factories")
        .insert({ ...payload, user_id: userId })
        .select("id")
        .single();
      if (insErr || !ins) return json({ ok: false, reason: "db_error", detail: insErr?.message ?? "insert_failed" }, 500);
      factoryId = ins.id;
    }

    return json({
      ok: true,
      factory_id: factoryId,
      shop_id,
      canonical,
      scores: p1,
      contact,
      header,
      axes,
      business,
      trade_30d: trade30d,
      certifications_count: certifications.length,
      raw_summary: { years: yrs, service: svc, return_rate: ret, product_count: cnt },
    });
  } catch (e) {
    return json({ ok: false, reason: "exception", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
