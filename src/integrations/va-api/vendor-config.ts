/**
 * AI Vendor configuration with FashionGo wholesaler ID mapping.
 * Each AI Vendor persona maps to a FashionGo vendor account.
 *
 * TODO: Currently all vendors share a single DEV test account (6676 = &merci).
 *       Replace with individual FG vendor IDs once separate accounts are set up.
 */

export interface AIVendorConfig {
  id: string;
  name: string;
  wholesalerId: number;
  position: string;
  categories: string;
  color: string;
}

export const AI_VENDORS: AIVendorConfig[] = [
  { id: 'basic', name: 'BASIC', wholesalerId: 6676, position: '베이직 스테디', categories: 'Tops, Basics, Everyday Wear', color: '#1A1A1A' },
  { id: 'curve', name: 'CURVE', wholesalerId: 6676, position: '플러스사이즈', categories: 'Plus Size Tops, Dresses, Bottoms', color: '#D60000' },
  { id: 'denim', name: 'DENIM', wholesalerId: 6676, position: '데님 스테디', categories: 'Jeans, Denim Jackets, Shorts', color: '#1E3A5F' },
  { id: 'vacation', name: 'VACATION', wholesalerId: 6676, position: '리조트/여름 시즌', categories: 'Swimwear, Resort, Linen', color: '#F59E0B' },
  { id: 'festival', name: 'FESTIVAL', wholesalerId: 6676, position: '미국 시즌 이벤트', categories: 'Holiday, Prom, Party, Formal', color: '#7C3AED' },
  { id: 'trend', name: 'TREND', wholesalerId: 6676, position: 'SNS 트렌드', categories: 'TikTok/Instagram 바이럴', color: '#EC4899' },
];

export function getVendorByWholesalerId(wholesalerId: number): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.wholesalerId === wholesalerId);
}

export function getVendorById(vendorId: string): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.id === vendorId);
}

/** All wholesaler IDs for aggregated queries */
export const ALL_WHOLESALER_IDS = AI_VENDORS.map((v) => v.wholesalerId);
