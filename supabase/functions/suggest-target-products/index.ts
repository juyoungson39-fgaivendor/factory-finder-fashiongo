import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supa = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Stage 4 트렌드 데이터 수집 (trend_analyses 최근 7일)
    const { data: trendRows } = await supa
      .from('trend_analyses')
      .select('trend_keywords, primary_category, lifecycle_stage, style_tags, signal_score')
      .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
      .order('signal_score', { ascending: false, nullsFirst: false })
      .limit(100);

    let trendsText = '';
    if (trendRows && trendRows.length > 0) {
      trendsText = trendRows
        .map((t: any) => {
          const kw = (t.trend_keywords || []).slice(0, 5).join(', ');
          const tags = (t.style_tags || []).join(', ');
          return `- 키워드:[${kw}] 카테고리:${t.primary_category || '-'} 생애주기:${t.lifecycle_stage || '-'} 스타일:[${tags}] 시그널:${t.signal_score ?? '-'}`;
        })
        .join('\n');
    }

    if (!trendsText) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_trend_data', detail: '최근 7일 trend_analyses 데이터 없음. Stage 1 트렌드 수집 후 다시 시도.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_lovable_api_key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const prompt = `다음은 최근 7일 SNS·커머스 트렌드 데이터입니다:

${trendsText.slice(0, 6000)}

위 데이터를 분석하여 FashionGo 머천다이저가 등록할 만한 「타깃 상품 정의」 5~8개를 추천하세요.
응답은 다음 JSON 형식의 객체만 반환:

{
  "suggestions": [
    {
      "name": "Y2K Barrel Jeans 2026 봄여름",
      "trend_keywords": ["barrel jeans", "y2k", "denim"],
      "category": "Pants",
      "style_tags": ["Y2K", "Streetwear"],
      "price_min_usd": 12,
      "price_max_usd": 30,
      "moq_max": 50,
      "rationale": "denim·y2k 키워드 급상승"
    }
  ]
}

규칙:
- category: Dress / Top / Pants / Set / Skirt / Shoes / Bag / Outerwear / Other
- style_tags: Streetwear / Minimal / Y2K / Bohemian / Coastal / Quiet Luxury / Cottagecore / Athleisure / Old Money / Coquette 중 1~3개
- price_min/max_usd: US 도매가 추정 (보통 $8-50)
- moq_max: 50 또는 100
- JSON만 반환`;

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return new Response(
        JSON.stringify({ ok: false, reason: 'ai_error', detail: errText.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const aiData = await aiRes.json();
    const content = aiData.choices?.[0]?.message?.content || '';

    let suggestions: any[] = [];
    try {
      const parsed = JSON.parse(content);
      suggestions = Array.isArray(parsed)
        ? parsed
        : parsed.suggestions || parsed.targets || parsed.items || [];
    } catch {
      return new Response(
        JSON.stringify({ ok: false, reason: 'parse_error', raw: content.slice(0, 500) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, reason: 'no_suggestions', raw: content.slice(0, 300) }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let inserted = 0;
    const errors: string[] = [];
    for (const s of suggestions) {
      if (!s?.name) continue;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 56);
      const { error } = await supa.from('target_products').insert({
        name: s.name,
        trend_keywords: Array.isArray(s.trend_keywords) ? s.trend_keywords : null,
        category: s.category || null,
        style_tags: Array.isArray(s.style_tags) ? s.style_tags : null,
        price_min_usd: typeof s.price_min_usd === 'number' ? s.price_min_usd : null,
        price_max_usd: typeof s.price_max_usd === 'number' ? s.price_max_usd : null,
        moq_max: typeof s.moq_max === 'number' ? s.moq_max : null,
        reference_image_urls: null,
        source: 'ai_suggested',
        status: 'draft',
        valid_until: validUntil.toISOString(),
        text_filters: s.rationale ? { rationale: s.rationale } : null,
      });
      if (error) errors.push(error.message);
      else inserted++;
    }

    return new Response(
      JSON.stringify({ ok: true, inserted, total_suggested: suggestions.length, errors: errors.slice(0, 3) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, reason: 'unhandled', detail: String(e?.message || e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
