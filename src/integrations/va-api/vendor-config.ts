/**
 * AI Vendor configuration with FashionGo wholesaler ID mapping.
 * Each AI Vendor persona maps to a real FashionGo vendor account.
 *
 * Vendor selection criteria (DEV DB, 2026-03-24):
 *   - Category fit for the persona
 *   - Sufficient active product count
 *   - BLACK XColor entry available (for defaultColorId)
 *
 * isActive:
 *   - true  → 표시/운영 중인 벤더
 *   - false → 비활성(숨김). 코드/데이터는 보존하되 UI에서는 노출되지 않음.
 *   현재 운영: Sassy Look(basic), G1K(trend) 2곳.
 */

export interface AIVendorConfig {
  id: string;
  name: string;
  wholesalerId: number;
  defaultColorId: number;
  position: string;
  categories: string;
  color: string;
  isActive: boolean;
}

// defaultColorId: XColor.ColorID where Color = 'BLACK' for each vendor
export const AI_VENDORS: AIVendorConfig[] = [
  { id: 'basic', name: 'Sassy Look', wholesalerId: 4933, defaultColorId: 222673, position: '베이직 스테디', categories: 'Tops, Basics, Everyday Wear', color: '#1A1A1A', isActive: true },
  { id: 'curve', name: 'BiBi', wholesalerId: 7206, defaultColorId: 500246, position: '플러스사이즈', categories: 'Plus Size Tops, Dresses, Bottoms', color: '#D60000', isActive: false },
  { id: 'denim', name: 'styleu', wholesalerId: 5755, defaultColorId: 290900, position: '데님 스테디', categories: 'Jeans, Denim Jackets, Shorts', color: '#1E3A5F', isActive: false },
  { id: 'vacation', name: 'Young Aloud', wholesalerId: 5059, defaultColorId: 232979, position: '리조트/여름 시즌', categories: 'Swimwear, Resort, Linen', color: '#F59E0B', isActive: false },
  { id: 'festival', name: 'Lenovia USA', wholesalerId: 6818, defaultColorId: 435245, position: '미국 시즌 이벤트', categories: 'Holiday, Prom, Party, Formal', color: '#7C3AED', isActive: false },
  { id: 'trend', name: 'G1K', wholesalerId: 4158, defaultColorId: 162002, position: 'SNS 트렌드', categories: 'TikTok/Instagram 바이럴', color: '#EC4899', isActive: true },
];

/** 활성화된 벤더만 반환 (UI 노출용 기본 사용) */
export const ACTIVE_AI_VENDORS: AIVendorConfig[] = AI_VENDORS.filter((v) => v.isActive);

export function getVendorByWholesalerId(wholesalerId: number): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.wholesalerId === wholesalerId);
}

export function getVendorById(vendorId: string): AIVendorConfig | undefined {
  return AI_VENDORS.find((v) => v.id === vendorId);
}

/** 활성 벤더 ID 빠른 체크 */
export function isVendorActive(vendorId: string): boolean {
  return AI_VENDORS.some((v) => v.id === vendorId && v.isActive);
}

/** Unique wholesaler IDs for aggregated queries (전체) */
export const ALL_WHOLESALER_IDS = [...new Set(AI_VENDORS.map((v) => v.wholesalerId))];

/** 활성 벤더의 wholesaler IDs */
export const ACTIVE_WHOLESALER_IDS = [...new Set(ACTIVE_AI_VENDORS.map((v) => v.wholesalerId))];
