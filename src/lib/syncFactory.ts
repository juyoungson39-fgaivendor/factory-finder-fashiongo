import { supabase } from '@/integrations/supabase/client';

interface Factory {
  id: string;
  name: string;
  source_url?: string | null;
  source_platform?: string | null;
}

/* ────── URL helpers ────── */
export function getCreditUrl(factory: Factory): string | null {
  const url = factory.source_url;
  const platform = factory.source_platform?.toLowerCase();
  if (!url || !platform) return null;

  try {
    const u = new URL(url);
    const domain = `${u.protocol}//${u.hostname}`;
    if (platform === '1688') return `${domain}/page/creditdetail.htm`;
    if (platform === 'alibaba') return `${domain}/company_profile.html`;
  } catch { /* ignore */ }
  return null;
}

/* ────── 1688 Parser ────── */
export function parse1688(text: string): Record<string, any> {
  const m = (re: RegExp) => { const r = re.exec(text); return r?.[1] ?? null; };
  const mNum = (re: RegExp) => { const v = m(re); return v ? parseFloat(v) : null; };

  return {
    consultation: mNum(/咨询体验\s*([\d.]+)/),
    logistics: mNum(/物流体验\s*([\d.]+)/),
    score_aftersale: mNum(/售后体验\s*([\d.]+)/),
    product_quality: mNum(/商品体验\s*([\d.]+)/),
    platform_service_score: mNum(/服务分\s*([\d.]+)/),
    credit_grade: m(/(?:诚信通体系|等级)\s*\n*\s*([A-Z]{1,4})\b/) ?? null,
    credit_system: '阿里诚信通',
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

/* ────── Alibaba Parser ────── */
export function parseAlibaba(text: string): Record<string, any> {
  const m = (re: RegExp) => { const r = re.exec(text); return r?.[1]?.trim() ?? null; };

  return {
    credit_grade: /Gold Supplier/i.test(text) ? 'GOLD' : null,
    gold_supplier_years: (() => { const r = /Gold Supplier[\s|]+(\d+)\s*(?:YR|Year)/i.exec(text); return r ? parseInt(r[1]) : null; })(),
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
    company_description: m(/(?:About\s+Us|Company\s+Overview)[:\s\n]*([^]{50,400}?)(?:\n\n|\nMain)/i),
    platform: 'alibaba',
    updated_at_platform: new Date().toISOString(),
  };
}

/* ────── Single Factory Sync ────── */
export async function syncFactory(factory: Factory): Promise<Record<string, any>> {
  const creditUrl = getCreditUrl(factory);
  if (!creditUrl) throw new Error('URL 생성 실패');

  const platform = factory.source_platform?.toLowerCase();
  const delay = platform === '1688' ? 5000 : 6000;

  const win = window.open(creditUrl, '_blank');
  if (!win) throw new Error('팝업이 차단됨. 브라우저 주소창 우측 팝업 허용 후 재시도');

  await new Promise(r => setTimeout(r, delay));

  let text = '';
  try {
    text = win.document.body.innerText;
  } catch {
    win.close();
    throw new Error('CORS 또는 보안 정책에 의해 페이지 접근이 차단됨');
  }
  win.close();

  if (text.length < 200) throw new Error('페이지 로딩 실패 또는 로그인 필요');

  return platform === '1688' ? parse1688(text) : parseAlibaba(text);
}

/* ────── Sync All Factories ────── */
export type SyncStatus = 'success' | 'error' | 'skip';
export type ProgressCallback = (
  current: number,
  total: number,
  name: string,
  platform: string,
  status: SyncStatus,
  message?: string,
) => void;

export interface SyncResults {
  success: number;
  error: number;
  skip: number;
  failed: { id: string; name: string; message: string }[];
}

export async function syncAllFactories(
  factories: Factory[],
  onProgress: ProgressCallback,
  abortSignal?: { aborted: boolean },
  platformFilter?: 'all' | '1688' | 'alibaba',
): Promise<SyncResults> {
  const results: SyncResults = { success: 0, error: 0, skip: 0, failed: [] };

  for (let i = 0; i < factories.length; i++) {
    if (abortSignal?.aborted) break;

    const factory = factories[i];
    const platform = factory.source_platform?.toLowerCase() ?? '';

    if (!factory.source_url || !platform) {
      results.skip++;
      onProgress(i + 1, factories.length, factory.name, platform, 'skip', 'URL 없음');
      continue;
    }

    if (platformFilter && platformFilter !== 'all' && platform !== platformFilter) {
      results.skip++;
      onProgress(i + 1, factories.length, factory.name, platform, 'skip', '플랫폼 필터');
      continue;
    }

    try {
      const parsed = await syncFactory(factory);

      // Merge with existing
      const { data: existing } = await supabase
        .from('factories')
        .select('platform_score_detail')
        .eq('id', factory.id)
        .single();

      const merged = { ...(existing?.platform_score_detail as Record<string, any> ?? {}), ...parsed };

      const updatePayload: Record<string, any> = {
        platform_score_detail: merged,
        last_synced_at: new Date().toISOString(),
        sync_status: 'synced',
      };

      if (platform === '1688' && parsed.repurchase_rate != null) {
        updatePayload.repurchase_rate = parsed.repurchase_rate;
      }

      await supabase.from('factories').update(updatePayload).eq('id', factory.id);

      results.success++;
      onProgress(i + 1, factories.length, factory.name, platform, 'success');
    } catch (err: any) {
      results.error++;
      results.failed.push({ id: factory.id, name: factory.name, message: err.message });
      onProgress(i + 1, factories.length, factory.name, platform, 'error', err.message);

      await supabase.from('factories').update({ sync_status: 'error' }).eq('id', factory.id);
    }

    // Delay between factories
    const betweenDelay = platform === '1688' ? 3000 : 4000;
    if (i < factories.length - 1) {
      await new Promise(r => setTimeout(r, betweenDelay));
    }
  }

  return results;
}
