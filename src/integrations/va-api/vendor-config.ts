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
  { id: 'basic', name: 'Sassy Look', wholesalerId: 4933, defaultColorId: 222673, position: '베이직 스테디', categories: 'Tops, Basics, Everyday Wear', color: '#1A1A1A' },
  { id: 'curve', name: 'BiBi', wholesalerId: 7206, defaultColorId: 500246, position: '플러스사이즈', categories: 'Plus Size Tops, Dresses, Bottoms', color: '#D60000' },
  { id: 'denim', name: 'styleu', wholesalerId: 5755, defaultColorId: 290900, position: '데님 스테디', categories: 'Jeans, Denim Jackets, Shorts', color: '#1E3A5F' },
  { id: 'vacation', name: 'Young Aloud', wholesalerId: 5059, defaultColorId: 232979, position: '리조트/여름 시즌', categories: 'Swimwear, Resort, Linen', color: '#F59E0B' },
  { id: 'festival', name: 'Lenovia USA', wholesalerId: 6818, defaultColorId: 435245, position: '미국 시즌 이벤트', categories: 'Holiday, Prom, Party, Formal', color: '#7C3AED' },
  { id: 'trend', name: 'G1K', wholesalerId: 4158, defaultColorId: 162002, position: 'SNS 트렌드', categories: 'TikTok/Instagram 바이럴', color: '#EC4899' },
];

export function getVendorByWholesalerId(wholesalerId: number): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.wholesalerId === wholesalerId);
}

export function getVendorById(vendorId: string): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.id === vendorId);
}

/** Unique wholesaler IDs for aggregated queries */
export const ALL_WHOLESALER_IDS = [...new Set(AI_VENDORS.map((v) => v.wholesalerId))];
