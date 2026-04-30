// Shared keyword extraction utilities for trend collection edge functions.
// Centralizes the stopword list so we only update it in one place.
//
// Guidelines:
// - Keep fashion-specific terms OUT of this list (e.g. dress, floral, maxi, denim).
// - Keep color terms OUT (black, white, red, ...).
// - Keep material terms OUT (cotton, silk, leather, ...).
// - Add generic English stopwords, e-commerce noise, year tokens, sizes, units.

export const STOP_WORDS: ReadonlySet<string> = new Set([
  // Articles / prepositions / conjunctions / pronouns
  "the", "a", "an", "with", "for", "and", "in", "of", "to", "on",
  "from", "by", "at", "is", "it", "or", "as", "be",
  "this", "that", "your", "our", "my", "his", "her", "its",
  "all", "each", "every", "both", "more", "most", "other",
  "new", "next", "last", "first",

  // Years (common rolling window)
  "2024", "2025", "2026", "2027",

  // Generic e-commerce noise (not fashion-specific)
  "exclusive", "exclusive:", "limited", "edition", "collection",
  "best", "sellers", "seller", "trending", "now",
  "free", "shipping", "sale", "off", "discount", "price",
  "buy", "shop", "order", "available", "stock",
  "item", "items", "product", "products",

  // Sizes / quantities
  "xs", "xl", "xxl", "xxxl", "one", "size", "sizes",
  "small", "medium", "large",

  // Misc packaging / units
  "set", "pack", "piece", "pcs", "lot", "pair",
]);

export function isStopWord(token: string): boolean {
  return STOP_WORDS.has(token.toLowerCase());
}

/**
 * Tokenize a free-form text string into normalized keyword candidates.
 * - Lowercases
 * - Strips punctuation (keeps word chars and hyphens)
 * - Removes stopwords
 * - Filters by minimum length (default 2 -> keeps 2+ char tokens)
 */
export function tokenize(
  text: string,
  opts: { minLength?: number } = {},
): string[] {
  const minLength = opts.minLength ?? 2;
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length >= minLength && !STOP_WORDS.has(w));
}

/**
 * Extract a deduplicated keyword list from text, capped at `limit`.
 * Useful when source provides only a free-form title/caption.
 */
export function extractKeywordsFromText(
  text: string,
  opts: { minLength?: number; limit?: number } = {},
): string[] {
  const limit = opts.limit ?? 8;
  const out: string[] = [];
  for (const t of tokenize(text, { minLength: opts.minLength })) {
    if (!out.includes(t)) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}
