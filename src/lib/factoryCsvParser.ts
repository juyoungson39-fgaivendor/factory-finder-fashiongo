// v3.3 CSV 템플릿 파싱 유틸
// 17 컬럼: name, country, province, city, source_platform, source_url,
//          shop_id, offer_id, main_products, moq, lead_time, status,
//          fg_partner, remark, contact_name, contact_email, contact_wechat

export type ParsedFactoryRow = {
  // 정렬 후 DB로 전달되는 필드들
  name: string;
  country: string | null;
  province: string | null;
  city: string | null;
  source_platform: string | null;
  source_url: string | null;
  shop_id: string | null;
  offer_id: string | null;
  main_products: string[] | null;
  moq: string | null;
  lead_time: string | null;
  status: string;
  fg_partner: boolean;
  // remark는 description으로 매핑
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_wechat: string | null;
  // 분류 메타
  url_type: 'product' | 'shop' | 'unknown';
  // 파싱 단계 에러 (있으면 status는 'error'로 강제)
  parse_error: string | null;
  // 원본 라인 번호 (실패 보고용)
  _line: number;
};

export interface FactoryCsvParseResult {
  rows: ParsedFactoryRow[];
  failed: { line: number; name: string; reason: string }[];
}

/** RFC4180-호환 단순 CSV 라인 분해 ("..." 안의 콤마는 보존, "" → ") */
function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cols.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  cols.push(current);
  return cols.map((c) => c.trim());
}

/** 빈 문자열은 null로 정규화 */
function nullable(v: string | undefined): string | null {
  if (v === undefined || v === null) return null;
  const trimmed = v.trim();
  return trimmed === '' ? null : trimmed;
}

/** 1688 source_url에서 url_type / shop_id / offer_id 추출 */
export function parse1688Url(rawUrl: string | null): {
  url_type: 'product' | 'shop' | 'unknown';
  shop_id: string | null;
  offer_id: string | null;
} {
  if (!rawUrl) return { url_type: 'unknown', shop_id: null, offer_id: null };
  const url = rawUrl.trim();

  // detail.1688.com/offer/{id}.html
  const productMatch = url.match(/detail\.1688\.com\/offer\/(\d+)\.html/i);
  if (productMatch) {
    return { url_type: 'product', shop_id: null, offer_id: productMatch[1] };
  }

  // {sub}.1688.com/page/offerlist.htm  (sub는 detail/www 제외 서브도메인)
  const shopMatch = url.match(/https?:\/\/([^./]+)\.1688\.com\/page\/offerlist\.htm/i);
  if (shopMatch && !['detail', 'www'].includes(shopMatch[1].toLowerCase())) {
    return { url_type: 'shop', shop_id: shopMatch[1], offer_id: null };
  }

  return { url_type: 'unknown', shop_id: null, offer_id: null };
}

/** "true"/"false"/빈값 → boolean */
function parseBool(v: string | null): boolean {
  if (!v) return false;
  return v.toLowerCase() === 'true';
}

/**
 * v3.3 CSV 텍스트 파싱.
 * - 빈 문자열 → null
 * - status='fg_listed' → fg_partner=true 자동 세팅
 * - source_url 파싱 실패 → status='error', parse_error 메시지 채움 (행은 유지)
 * - name 누락 → failed로 분리, rows에 포함되지 않음
 */
export function parseFactoryCsv(text: string): FactoryCsvParseResult {
  // BOM (utf-8-sig) 제거
  const clean = text.replace(/^\uFEFF/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const rows: ParsedFactoryRow[] = [];
  const failed: FactoryCsvParseResult['failed'] = [];

  if (lines.length < 2) return { rows, failed };

  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (k: string) => headers.indexOf(k);
  const get = (cols: string[], k: string) => {
    const i = idx(k);
    return i === -1 ? null : nullable(cols[i]);
  };

  if (idx('name') === -1) {
    return { rows, failed: [{ line: 1, name: '(헤더)', reason: 'name 컬럼이 없습니다' }] };
  }

  for (let li = 1; li < lines.length; li++) {
    const cols = splitCsvLine(lines[li]);
    const name = get(cols, 'name');
    if (!name) {
      failed.push({ line: li + 1, name: '(이름 없음)', reason: 'name이 비어있습니다' });
      continue;
    }

    const sourceUrl = get(cols, 'source_url');
    const csvShopId = get(cols, 'shop_id');
    const csvOfferId = get(cols, 'offer_id');
    const parsed = parse1688Url(sourceUrl);

    // CSV의 명시값 우선, 없으면 URL 파싱 결과 사용
    const shop_id = csvShopId ?? parsed.shop_id;
    const offer_id = csvOfferId ?? parsed.offer_id;

    let parse_error: string | null = null;
    if (sourceUrl && parsed.url_type === 'unknown' && !csvShopId && !csvOfferId) {
      parse_error = `source_url 패턴을 인식하지 못했습니다: ${sourceUrl}`;
    }

    const csvStatus = get(cols, 'status');
    const csvFgPartner = get(cols, 'fg_partner');
    const fg_partner = csvStatus === 'fg_listed' ? true : parseBool(csvFgPartner);

    const status = parse_error ? 'error' : (csvStatus || 'new');

    const mainProductsStr = get(cols, 'main_products');
    const main_products = mainProductsStr
      ? mainProductsStr.split(',').map((s) => s.trim()).filter(Boolean)
      : null;

    rows.push({
      name,
      country: get(cols, 'country'),
      province: get(cols, 'province'),
      city: get(cols, 'city'),
      source_platform: get(cols, 'source_platform'),
      source_url: sourceUrl,
      shop_id,
      offer_id,
      main_products,
      moq: get(cols, 'moq'),
      lead_time: get(cols, 'lead_time'),
      status,
      fg_partner,
      description: get(cols, 'remark'),
      contact_name: get(cols, 'contact_name'),
      contact_email: get(cols, 'contact_email'),
      contact_wechat: get(cols, 'contact_wechat'),
      url_type: parsed.url_type,
      parse_error,
      _line: li + 1,
    });
  }

  return { rows, failed };
}
