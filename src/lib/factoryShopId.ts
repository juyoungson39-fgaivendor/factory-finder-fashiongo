/**
 * Derive a shop_id for a factory row.
 * - If URL is a 1688 shop subdomain (e.g. https://baijishang.1688.com/...), extract it.
 * - Otherwise fall back to a unique manual_* placeholder so the NOT NULL +
 *   non-empty CHECK constraint on factories.shop_id is satisfied.
 */
export function deriveShopId(url?: string | null): string {
  if (url) {
    const m = url.match(/https?:\/\/([a-z0-9_-]+)\.1688\.com/i);
    if (m && m[1] && m[1].toLowerCase() !== 'detail' && m[1].toLowerCase() !== 'www') {
      return m[1].toLowerCase();
    }
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `manual_${Date.now().toString(36)}_${rand}`;
}
