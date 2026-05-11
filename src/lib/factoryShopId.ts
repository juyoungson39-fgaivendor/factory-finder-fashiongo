/**
 * Derive a shop_id for a factory row.
 * - If URL is an Alibaba supplier subdomain (e.g. https://laiteclothing.en.alibaba.com/...), extract it.
 * - Otherwise fall back to a unique manual_* placeholder so the NOT NULL +
 *   non-empty CHECK constraint on factories.shop_id is satisfied.
 */
export function deriveShopId(url?: string | null): string {
  if (url) {
    const m = url.match(/https?:\/\/([a-z0-9_-]+)\.en\.alibaba\.com/i);
    if (m && m[1] && !['www', 'm'].includes(m[1].toLowerCase())) {
      return m[1].toLowerCase();
    }
  }
  const rand = Math.random().toString(36).slice(2, 8);
  return `manual_${Date.now().toString(36)}_${rand}`;
}
