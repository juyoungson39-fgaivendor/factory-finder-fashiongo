/**
 * AI Vendor configuration with FashionGo wholesaler ID mapping.
 * Each AI Vendor persona maps to a real FashionGo vendor account.
 *
 * Vendor selection criteria (DEV DB, 2026-03-24):
 *   - Category fit for the persona
 *   - Sufficient active product count
 *   - BLACK XColor entry available (for defaultColorId)
 */

export interface AIVendorConfig {
  id: string;
  name: string;
  wholesalerId: number;
  defaultColorId: number;
  position: string;
  categories: string;
  color: string;
}

// defaultColorId: XColor.ColorID where Color = 'BLACK' for each vendor
export const AI_VENDORS: AIVendorConfig[] = [
  { id: 'basic', name: 'BASIC', wholesalerId: 4933, defaultColorId: 222673, position: '베이직 스테디', categories: 'Tops, Basics, Everyday Wear', color: '#1A1A1A' },       // Sassy Look — 880 tops
  { id: 'curve', name: 'CURVE', wholesalerId: 7206, defaultColorId: 500246, position: '플러스사이즈', categories: 'Plus Size Tops, Dresses, Bottoms', color: '#D60000' },      // BiBi — 15k+ plus-size
  { id: 'denim', name: 'DENIM', wholesalerId: 5755, defaultColorId: 290900, position: '데님 스테디', categories: 'Jeans, Denim Jackets, Shorts', color: '#1E3A5F' },           // styleu — 718 denim
  { id: 'vacation', name: 'VACATION', wholesalerId: 5059, defaultColorId: 232979, position: '리조트/여름 시즌', categories: 'Swimwear, Resort, Linen', color: '#F59E0B' },     // Young Aloud — 321 swimwear
  { id: 'festival', name: 'FESTIVAL', wholesalerId: 6818, defaultColorId: 435245, position: '미국 시즌 이벤트', categories: 'Holiday, Prom, Party, Formal', color: '#7C3AED' }, // Lenovia USA — 148 party/formal
  { id: 'trend', name: 'TREND', wholesalerId: 4158, defaultColorId: 162002, position: 'SNS 트렌드', categories: 'TikTok/Instagram 바이럴', color: '#EC4899' },                 // G1K — 1k+ dresses/sets
];

export function getVendorByWholesalerId(wholesalerId: number): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.wholesalerId === wholesalerId);
}

export function getVendorById(vendorId: string): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.id === vendorId);
}

/** Unique wholesaler IDs for aggregated queries */
export const ALL_WHOLESALER_IDS = [...new Set(AI_VENDORS.map((v) => v.wholesalerId))];
