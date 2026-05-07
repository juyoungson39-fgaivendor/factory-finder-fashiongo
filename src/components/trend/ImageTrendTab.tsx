import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useTrendKeywordStats, type KeywordStat } from '@/hooks/useTrendKeywordStats';
import { useSnsTrendFeed, type TrendFeedItem, type PlatformFilter } from '@/hooks/useSnsTrendFeed';
import {
  Search, ExternalLink, Loader2, Bot, RefreshCw,
  Factory, CheckCircle2, Settings,
  ShoppingBag,
  ChevronDown, ChevronUp, Info, X, Bookmark, Trash2, Camera,
  SearchX,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFilterPresets, MAX_PRESETS, type FilterPreset } from '@/hooks/useFilterPresets';
import { CollectionSettingsPanel } from './CollectionSettingsPanel';
import { useBuyerSignalTracker } from '@/hooks/useBuyerSignalTracker';
import { PlatformLogo } from './PlatformLogo';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface BatchRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  triggered_by: 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'failed' | 'partial';
  collected_count: number;
  analyzed_count: number;
  embedded_count: number;
  failed_count: number;
}

interface TrendMatchProduct {
  id: string;
  product_name: string;
  item_name: string | null;
  item_name_en: string | null;
  factory_name: string;
  factory_id: string;
  image_url: string | null;
  price: number | null;
  unit_price_usd: number | null;
  stock_quantity: number | null;
  category: string | null;
  fg_category: string | null;
  source_url: string | null;
  purchase_link: string | null;
  similarity: number;
  combined_score: number;           // 텍스트+이미지 하이브리드 점수 (수정 1)
  text_similarity: number;          // 텍스트 유사도 (수정 1)
  image_similarity: number | null;  // 이미지 유사도 (수정 1)
  trend_decay: number;              // 트렌드 시간 감쇠 (수정 1)
  used_signals?: string[];          // 매칭에 사용된 신호 목록
  factories: {
    id: string;
    name: string;
    country: string | null;
    city: string | null;
    moq: string | null;
  } | null;
}

interface TrendMatchResponse {
  trend: {
    id: string;
    title: string;
    image_url: string | null;
    ai_keywords: Array<{ keyword: string; type: string }>;
    trend_score: number;
  };
  products: TrendMatchProduct[];       // 수정 1: 새 필드명
  matches: TrendMatchProduct[];        // 하위 호환
  has_image_matching: boolean;         // 수정 5
  total_matches: number;
  debug?: {
    applied_threshold?: number;
    query_attribute_keywords?: string[];
  };
}

interface FilterState {
  keyword: string;
  platforms: string[];
  timeRange: string;
  dateFrom: string;
  dateTo: string;
  categories: string[];
  genders: string[];
  colors: string[];
  productStatuses: string[];
  bodyTypes: string[];
  lifecycleStages: string[];
}

interface CheckboxState {
  hasViews: boolean;
  deduplication: boolean;
  setOnly: boolean;
  mainImageOnly: boolean;
}

interface ImageSearchResult {
  id: string;
  trend_name: string;
  image_url: string | null;
  platform: string;
  lifecycle_stage: string | null;
  similarity: number;
  permalink?: string | null;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const allPlatforms = ['tiktok', 'instagram', 'vogue', 'elle', 'wwd', 'hypebeast', 'highsnobiety', 'footwearnews', 'google', 'amazon', 'pinterest', 'fashiongo', 'shein', 'zara'];

// 매거진 플랫폼 그룹 (6개 개별 매거진) — 수집은 collect-magazine-trends 1회로 통합
const MAGAZINE_PLATFORMS = ['vogue', 'elle', 'wwd', 'hypebeast', 'highsnobiety', 'footwearnews'];

// 플랫폼별 dot 색상 (필터 옵션 앞에 표시)
const PLATFORM_DOT_COLORS: Record<string, string> = {
  instagram:    'bg-gradient-to-r from-purple-500 to-pink-500',
  tiktok:       'bg-black',
  vogue:        'bg-black',
  elle:         'bg-red-600',
  wwd:          'bg-gray-800',
  hypebeast:    'bg-green-700',
  highsnobiety: 'bg-purple-700',
  footwearnews: 'bg-amber-700',
  google:       'bg-blue-500',
  amazon:       'bg-orange-500',
  pinterest:    'bg-red-500',
  fashiongo:    'bg-indigo-600',
  shein:        'bg-black',
  zara:         'bg-neutral-900',
};

// 라이프사이클 배지 필터 옵션
const allLifecycleStages = [
  { key: 'emerging',   icon: '🌱', label: 'Emerging' },
  { key: 'rising',     icon: '🚀', label: 'Rising' },
  { key: 'peak',       icon: '⭐', label: 'Peak' },
  { key: 'declining',  icon: '📉', label: 'Declining' },
  { key: 'classic',    icon: '💎', label: 'Classic' },
  { key: 'unanalyzed', icon: '—',  label: '미분석' },
] as const;
const allLifecycleStageKeys = allLifecycleStages.map(s => s.key as string);



const allCategories = ['Dresses', 'Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories'];

const allGenders = [
  { key: 'women', label: 'Women' },
  { key: 'men', label: 'Men' },
  { key: 'unisex', label: 'Unisex' },
];

const allColors = [
  { key: 'black', label: 'Black' }, { key: 'white', label: 'White' },
  { key: 'red', label: 'Red' },     { key: 'blue', label: 'Blue' },
  { key: 'pink', label: 'Pink' },   { key: 'green', label: 'Green' },
  { key: 'beige', label: 'Beige' }, { key: 'brown', label: 'Brown' },
  { key: 'gray', label: 'Gray' },   { key: 'navy', label: 'Navy' },
  { key: 'yellow', label: 'Yellow' },{ key: 'orange', label: 'Orange' },
  { key: 'purple', label: 'Purple' },{ key: 'cream', label: 'Cream' },
  { key: 'khaki', label: 'Khaki' },
];

const allProductStatuses = [
  { key: 'new', label: '신상품' },
  { key: 'analyzed', label: 'AI 분석 완료' },
];

const allBodyTypes = [
  { key: 'slim', label: 'Slim' },
  { key: 'regular', label: 'Regular' },
  { key: 'plus', label: 'Plus' },
];

// platformOptions는 TrendFilterPanel + 필터태그 레이블 생성 모두에서 사용
const platformOptions = [
  { key: 'tiktok',       label: 'TikTok' },
  { key: 'instagram',    label: 'Instagram' },
  { key: 'vogue',        label: 'Vogue' },
  { key: 'elle',         label: 'Elle' },
  { key: 'wwd',          label: 'WWD' },
  { key: 'hypebeast',    label: 'Hypebeast' },
  { key: 'highsnobiety', label: 'Highsnobiety' },
  { key: 'footwearnews', label: 'Footwear News' },
  { key: 'google',       label: 'Google' },
  { key: 'amazon',       label: 'Amazon' },
  { key: 'pinterest',    label: 'Pinterest' },
  { key: 'fashiongo',    label: 'FashionGo' },
  { key: 'shein',        label: 'SHEIN' },
  { key: 'zara',         label: 'Zara' },
];

// 정렬 옵션 레이블 (태그 표시용)
const SORT_LABELS: Record<string, string> = {
  latest: '최신순', oldest: '오래된순', platform: '플랫폼 등장순',
  keywords: '키워드 많은순', lifecycle: '라이프사이클순', engagement: '인게이지먼트순',
  similarity: '유사도순',
};

// 수집기간 레이블 (태그 표시용)
const PERIOD_LABELS: Record<string, string> = {
  '1': '어제', '7': '최근 7일', '15': '최근 15일', '30': '최근 30일',
};

const BOUTIQUE_HASHTAGS = [
  '#WomensBoutique', '#OnlineBoutique', '#BoutiqueLife', '#ShopSmall',
  '#SupportSmallBusiness', '#WomensOOTD', '#NewArrivals', '#BoutiqueFinds',
  '#FashionForWomen', '#StyleInspo', '#WomensClothing', '#BoutiqueStyle',
];


// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function formatRunDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function runDurationSec(run: BatchRun): number | null {
  if (!run.completed_at) return null;
  return Math.round(
    (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
  );
}

/**
 * AI vision description → 텍스트 검색용 패션 키워드 배열 추출
 * - 의류 아이템 (blazer, jeans, suit …)
 * - 색상+아이템 구(navy suit, black blazer …)
 * - 스타일 수식어+아이템 구(wide-leg jeans, oversized coat …)
 * - 스타일 카테고리(business casual, streetwear …)
 * Non-fashion 단어(male, wears, for, the …)는 제거
 */
function extractFashionTerms(description: string): string[] {
  if (!description.trim()) return [];

  // ── 어휘 사전 ────────────────────────────────────────────────
  const CLOTHING = new Set([
    'blazer', 'suit', 'jacket', 'coat', 'trench', 'parka', 'vest', 'cardigan',
    'sweater', 'pullover', 'hoodie', 'sweatshirt', 'turtleneck', 'blouse', 'shirt',
    'top', 'tee', 'tank', 'crop', 'corset',
    'jeans', 'pants', 'trousers', 'shorts', 'leggings', 'skirt',
    'dress', 'gown', 'jumpsuit', 'romper', 'overalls',
    'sneakers', 'heels', 'boots', 'loafers', 'sandals', 'mules', 'pumps',
    'bag', 'tote', 'clutch', 'crossbody', 'scarf', 'belt', 'cap', 'hat', 'beanie',
  ]);

  const FABRICS = new Set([
    'denim', 'linen', 'knit', 'leather', 'velvet', 'silk', 'satin', 'cotton',
    'wool', 'cashmere', 'chiffon', 'tweed', 'corduroy', 'jersey', 'ribbed',
  ]);

  const COLORS = new Set([
    'black', 'white', 'navy', 'gray', 'grey', 'brown', 'beige', 'cream', 'ivory',
    'red', 'blue', 'green', 'pink', 'purple', 'orange', 'yellow', 'khaki', 'camel',
    'olive', 'burgundy', 'tan', 'charcoal', 'coral', 'teal', 'mustard', 'rust',
  ]);

  // 실루엣/스타일 수식어 (의류와 결합해서 사용)
  const STYLE_MODS = new Set([
    'oversized', 'wide-leg', 'relaxed', 'slim', 'fitted', 'tailored', 'structured',
    'cropped', 'high-waisted', 'straight', 'flared', 'pleated', 'sheer', 'draped',
    'floral', 'striped', 'plaid', 'checkered', 'distressed', 'vintage',
    'midi', 'maxi', 'mini', 'longline', 'boxy', 'asymmetric', 'ruched',
    'collared', 'buttoned', 'button-up', 'button-down', 'v-neck', 'mock-neck',
  ]);

  // 문장 전체에서 substring 탐색하는 실루엣 키워드
  const SILHOUETTES = [
    'wide-leg', 'slim fit', 'relaxed fit', 'oversized', 'high-waisted',
    'straight-leg', 'slim-fit', 'relaxed-fit',
  ];

  // 문장 전체에서 substring 탐색하는 스타일 카테고리
  const STYLE_CATS = [
    'business casual', 'smart casual', 'casual chic', 'street style',
    'streetwear', 'athleisure', 'resort wear', 'minimalist',
    'bohemian', 'preppy', 'y2k', 'cottagecore', 'dark academia',
  ];

  // non-fashion 제거 단어
  const EXCLUDE = new Set([
    'male', 'female', 'man', 'woman', 'person', 'model', 'individual', 'men', 'women',
    'wearing', 'wears', 'worn', 'dressed', 'outfit', 'look', 'wear',
    'suitable', 'occasion', 'event', 'setting', 'paired', 'pairing', 'featuring',
    'the', 'a', 'an', 'is', 'are', 'was', 'in', 'on', 'for', 'with', 'of', 'by',
    'and', 'or', 'but', 'over', 'under', 'this', 'that', 'these', 'its', 'their',
    'features', 'includes', 'appears', 'looks', 'shows', 'depicted',
    'photo', 'image', 'picture', 'very', 'quite', 'both', 'all',
    'garment', 'clothing', 'fashion', 'design', 'piece', 'season',
    'casual', 'formal', 'overall', 'complete', 'classic', 'modern',
  ]);

  const text = description.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ');
  const words = text.split(/\s+/).filter(w => w.length > 1 && !EXCLUDE.has(w));
  const results: string[] = [];
  const usedIdx = new Set<number>();

  // 마지막 단어가 item과 일치하는지 확인 (중복 방지)
  const itemCaptured = (item: string) =>
    results.some(r => r === item || r.endsWith(` ${item}`));

  // ── P0: 스타일 카테고리 (substring) ─────────────────────────
  for (const cat of STYLE_CATS) {
    if (text.includes(cat)) results.push(cat);
  }

  // ── P1: 실루엣 키워드 (substring) ───────────────────────────
  for (const sil of SILHOUETTES) {
    if (text.includes(sil) && !results.includes(sil)) results.push(sil);
  }

  // ── P2: 3-word [mod/fab] + [mod/fab] + item (ribbed knit sweater) ──
  for (let i = 0; i < words.length - 2; i++) {
    if (usedIdx.has(i) || usedIdx.has(i + 1) || usedIdx.has(i + 2)) continue;
    const w0 = words[i], w1 = words[i + 1], w2 = words[i + 2];
    if (!CLOTHING.has(w2)) continue;
    const w0IsMod = STYLE_MODS.has(w0) || FABRICS.has(w0);
    const w1IsMod = STYLE_MODS.has(w1) || FABRICS.has(w1);
    if (w0IsMod && w1IsMod) {
      results.push(`${w0} ${w1} ${w2}`);
      usedIdx.add(i); usedIdx.add(i + 1); usedIdx.add(i + 2);
    }
  }

  // ── P3: 3-word [color] + [mod/fab] + item → style part only ─
  // e.g. "navy wide-leg trousers" → "wide-leg trousers"
  for (let i = 0; i < words.length - 2; i++) {
    if (usedIdx.has(i) || usedIdx.has(i + 1) || usedIdx.has(i + 2)) continue;
    const w0 = words[i], w1 = words[i + 1], w2 = words[i + 2];
    if (!CLOTHING.has(w2)) continue;
    const w1IsMod = STYLE_MODS.has(w1) || FABRICS.has(w1);
    if (COLORS.has(w0) && w1IsMod) {
      const pair = `${w1} ${w2}`;
      if (!results.includes(pair)) results.push(pair);
      usedIdx.add(i); usedIdx.add(i + 1); usedIdx.add(i + 2);
    }
  }

  // ── P4: 2-word [mod/fab] + item (wide-leg trousers, linen shirt) ──
  for (let i = 0; i < words.length - 1; i++) {
    if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
    const w0 = words[i], w1 = words[i + 1];
    if ((STYLE_MODS.has(w0) || FABRICS.has(w0)) && CLOTHING.has(w1)) {
      if (!itemCaptured(w1)) {
        results.push(`${w0} ${w1}`);
        usedIdx.add(i); usedIdx.add(i + 1);
      }
    }
  }

  // ── P5: 2-word [color] + item (navy suit) — item not yet captured ──
  for (let i = 0; i < words.length - 1; i++) {
    if (usedIdx.has(i) || usedIdx.has(i + 1)) continue;
    const w0 = words[i], w1 = words[i + 1];
    if (COLORS.has(w0) && CLOTHING.has(w1) && !itemCaptured(w1)) {
      results.push(`${w0} ${w1}`);
      usedIdx.add(i); usedIdx.add(i + 1);
    }
  }

  // ── P6: 단독 패브릭 (결과 < 2일 때 보완) ────────────────────
  if (results.length < 2) {
    for (let i = 0; i < words.length && results.length < 3; i++) {
      if (usedIdx.has(i)) continue;
      const w = words[i];
      if (FABRICS.has(w) && !results.some(r => r.includes(w))) results.push(w);
    }
  }

  // ── P7: 단독 의류 아이템 (결과 < 2일 때 보완) ───────────────
  if (results.length < 2) {
    for (let i = 0; i < words.length && results.length < 3; i++) {
      if (usedIdx.has(i)) continue;
      const w = words[i];
      if (CLOTHING.has(w) && !itemCaptured(w)) results.push(w);
    }
  }

  return [...new Set(results)].slice(0, 4);
}

/** AI 설명 텍스트에서 성별을 감지합니다. */
function detectGenderFromDescription(description: string): 'men' | 'women' | null {
  const t = description.toLowerCase();
  const hasMen = /\b(men's|menswear|male|masculine|men)\b/.test(t);
  const hasWomen = /\b(women's|womenswear|female|feminine|women)\b/.test(t);
  if (hasMen && !hasWomen) return 'men';
  if (hasWomen && !hasMen) return 'women';
  return null; // 양성 언급 또는 불명확 → 필터 없음
}

// ─── 라이프사이클 배지 안내 ─────────────────────────────────
const LIFECYCLE_BADGE_INFO = [
  { stage: 'emerging',  icon: '🌱', label: 'Emerging',  desc: '최초 발견 7일 이내, 아직 소수 플랫폼에서만 발견된 초기 단계 트렌드' },
  { stage: 'rising',    icon: '🚀', label: 'Rising',    desc: '최근 2주간 수집 건수가 이전 대비 50% 이상 증가한 빠르게 성장 중인 트렌드' },
  { stage: 'peak',      icon: '⭐', label: 'Peak',      desc: '최근 7일 수집 건수가 역대 최고 구간인 지금 가장 핫한 트렌드' },
  { stage: 'declining', icon: '📉', label: 'Declining', desc: '피크 대비 수집 건수가 30% 이상 감소한 하락세 트렌드' },
  { stage: 'classic',   icon: '💎', label: 'Classic',   desc: '30일 이상 꾸준히 수집되며 변동폭 ±20% 이내인 스테디셀러 트렌드' },
] as const;

// ─── 카드 공용 헬퍼 ────────────────────────────────────────
const PLATFORM_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  instagram:    { label: 'Instagram',     cls: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' },
  tiktok:       { label: 'TikTok',        cls: 'bg-black text-white' },
  vogue:        { label: 'Vogue',         cls: 'bg-black text-white' },
  elle:         { label: 'Elle',          cls: 'bg-red-600 text-white' },
  wwd:          { label: 'WWD',           cls: 'bg-gray-800 text-white' },
  hypebeast:    { label: 'Hypebeast',     cls: 'bg-green-700 text-white' },
  highsnobiety: { label: 'Highsnobiety',  cls: 'bg-purple-700 text-white' },
  footwearnews: { label: 'Footwear News', cls: 'bg-amber-700 text-white' },
  google:       { label: 'Google',        cls: 'bg-blue-500 text-white' },
  pinterest:    { label: 'Pinterest',     cls: 'bg-red-500 text-white' },
  amazon:       { label: 'Amazon',        cls: 'bg-orange-500 text-white' },
  fashiongo:    { label: 'FashionGo',     cls: 'bg-indigo-600 text-white' },
  shein:        { label: 'SHEIN',         cls: 'bg-rose-500 text-white' },
  zara:         { label: 'Zara',          cls: 'bg-neutral-900 text-white' },
};
function getPlatformBadge(platform: string) {
  return PLATFORM_BADGE_MAP[platform] ?? { label: platform, cls: 'bg-gray-500 text-white' };
}

function getScoreBadgeCls(score: number): string {
  if (score >= 80) return 'bg-green-500/90 text-white';
  if (score >= 60) return 'bg-amber-500/90 text-white';
  if (score >= 40) return 'bg-yellow-400/90 text-gray-900';
  return 'bg-gray-400/90 text-white';
}


const COLOR_HEX_MAP: Record<string, string> = {
  black: '#111111', white: '#F5F5F5', red: '#EF4444', blue: '#3B82F6',
  pink: '#EC4899', green: '#22C55E', beige: '#D4B896', brown: '#92400E',
  gray: '#6B7280', navy: '#1E3A5F', yellow: '#EAB308', orange: '#F97316',
  purple: '#A855F7', cream: '#FFFDD0', khaki: '#BDB76B',
};
function getColorHex(colorName: string): string {
  return COLOR_HEX_MAP[colorName.toLowerCase()] ?? '#6B7280';
}
function cleanTitle(raw: string): string {
  return raw.replace(/<[^>]+>/g, '');
}

// 라이프사이클 태그
const LIFECYCLE_MAP: Record<string, { emoji: string; label: string; cls: string }> = {
  emerging:  { emoji: '🌱', label: 'Emerging',  cls: 'bg-green-100 text-green-700 border border-green-200' },
  rising:    { emoji: '🚀', label: 'Rising',    cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  peak:      { emoji: '⭐', label: 'Peak',       cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  declining: { emoji: '📉', label: 'Declining', cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
  classic:   { emoji: '💎', label: 'Classic',   cls: 'bg-purple-100 text-purple-700 border border-purple-200' },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const KeywordGrowthBadge = ({ stat }: { stat: KeywordStat }) => {
  const growth = stat.growth_7d;
  if (growth === null) return null;
  const isUp = growth > 0;
  const isDown = growth < 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      isUp   && 'bg-emerald-100 text-emerald-700',
      isDown && 'bg-red-100 text-red-600',
      !isUp && !isDown && 'bg-secondary text-secondary-foreground'
    )}>
      {isUp ? '↑' : isDown ? '↓' : '→'} {stat.keyword}
      {growth !== 0 ? ` ${growth > 0 ? '+' : ''}${growth}%` : ''}
    </span>
  );
};

const LiveTrendCard = ({ item, selected, onClick, keywordStatsMap, similarityPct }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
  keywordStatsMap: Map<string, KeywordStat>;
  similarityPct?: number;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const matchedStats = useMemo(() => {
    if (!keywordStatsMap.size) return [];
    return item.trend_keywords
      .map(k => keywordStatsMap.get(k.toLowerCase()))
      .filter((s): s is KeywordStat => !!s)
      .sort((a, b) => b.total_7d - a.total_7d)
      .slice(0, 2);
  }, [item.trend_keywords, keywordStatsMap]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md flex flex-col',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border'
      )}
    >
      {/* 썸네일 — 고정 높이 */}
      <div className="relative h-[200px] w-full shrink-0 overflow-hidden group bg-muted">
        {item.image_url && !loaded && !imgError && <Skeleton className="absolute inset-0 rounded-none" />}
        {!item.image_url || imgError ? (
          <NoImagePlaceholder size="lg" />
        ) : (
          <img
            src={item.image_url}
            alt={item.trend_name}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-105', !loaded && 'opacity-0')}
            style={{ objectPosition: 'center 70%' }}
          />
        )}
        {/* 유사도 배지 — 이미지 검색 결과에서만 표시 */}
        {similarityPct !== undefined && (
          <span className={cn(
            'absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none z-10',
            similarityPct >= 85 ? 'bg-green-500 text-white' :
            similarityPct >= 70 ? 'bg-yellow-400 text-gray-900' :
                                  'bg-gray-400 text-white'
          )}>
            {similarityPct}% 일치
          </span>
        )}
      </div>
      {/* 정보 영역 — flex 구조, 최대 5요소 + 원본 보기 하단 고정 */}
      <div className="p-3 flex flex-col min-h-[172px]">
        {/* 1. 플랫폼 로고 + 이름 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PlatformLogo platform={item.platform} size="sm" />
          <span className="text-[11px] text-muted-foreground font-medium leading-none">
            {getPlatformBadge(item.platform).label}
          </span>
        </div>
        {/* 2. 라이프사이클 배지 */}
        {item.lifecycle_stage && LIFECYCLE_MAP[item.lifecycle_stage] && (() => {
          const lc = LIFECYCLE_MAP[item.lifecycle_stage!];
          return (
            <span className={cn('mt-1 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 self-start', lc.cls)}>
              {lc.emoji} {lc.label}
            </span>
          );
        })()}
        {/* 3. 타이틀 (2줄 말줄임) */}
        <p className="mt-1 font-semibold text-sm text-foreground line-clamp-2 leading-snug shrink-0">
          {cleanTitle(item.trend_name)}
        </p>
        {/* 4. 키워드 트렌드 배지 */}
        {matchedStats.length > 0 && (
          <div className="mt-1 flex gap-1 flex-wrap shrink-0">
            {matchedStats.map(stat => <KeywordGrowthBadge key={stat.keyword} stat={stat} />)}
          </div>
        )}
        {/* 스페이서 — 원본 보기를 항상 하단에 고정 */}
        <div className="flex-1" />
        {/* 5. 원본 보기 — 항상 하단 */}
        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> 원본 보기 ↗
          </a>
        )}
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Filter Panel (always visible — includes keyword + image search)
// ─────────────────────────────────────────────────────────────
const TrendFilterPanel = ({
  filters,
  setFilters,
  checkboxes,
  setCheckboxes,
  onReset,
  onSearch,
  searchMode,
  onSearchModeChange,
  imageState,
  onImageFile,
  onImageRemove,
  isSearching,
}: {
  filters: FilterState;
  setFilters: (value: FilterState | ((prev: FilterState) => FilterState)) => void;
  checkboxes: CheckboxState;
  setCheckboxes: (value: CheckboxState | ((prev: CheckboxState) => CheckboxState)) => void;
  onReset: () => void;
  onSearch: () => void;
  searchMode: 'text' | 'image';
  onSearchModeChange: (mode: 'text' | 'image') => void;
  imageState: {
    previewUrl: string | null;
    fileName: string | null;
    analyzing: boolean;
    analyzed: boolean;
    aiDescription: string;
  } | null;
  onImageFile: (file: File) => void;
  onImageRemove: () => void;
  isSearching?: boolean;
}) => {
  const [detailFilterOpen, setDetailFilterOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const imageFileInputRef = useRef<HTMLInputElement>(null);

  const handleImageFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImageFile(file);
    e.target.value = '';
  };
  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onImageFile(file);
  };

  const rowCls = 'flex items-start gap-3 py-2 border-b border-border/50';
  const labelCls = 'text-xs font-medium text-muted-foreground min-w-[72px] pt-1 shrink-0';
  const cbCls = 'w-3.5 h-3.5 rounded accent-primary';

  const toggleArr = (field: keyof FilterState, value: string) => {
    const current = (filters[field] as string[]) || [];
    setFilters((f) => ({
      ...f,
      [field]: current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    }));
  };

  return (
    <div className="rounded-xl border border-border bg-card px-5 py-3 space-y-0">

      {/* ── 검색 방식 토글 (pill 버튼) ─────────────────────────── */}
      <div className="flex items-center gap-3 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground min-w-[72px] shrink-0">검색 방식</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {([
            { key: 'text',  label: '텍스트 검색' },
            { key: 'image', label: '🖼️ 이미지 검색' },
          ] as const).map((opt, idx) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onSearchModeChange(opt.key)}
              className={cn(
                'text-xs px-3 py-1.5 transition-colors',
                idx > 0 && 'border-l border-border',
                searchMode === opt.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 텍스트 검색 모드: 검색어 입력 ────────────────────────── */}
      {searchMode === 'text' && (
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <span className="text-xs font-medium text-muted-foreground min-w-[72px] shrink-0">검색어</span>
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
            placeholder="트렌드명 또는 키워드로 검색"
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>
      )}

      {/* ── 이미지 검색 모드: 이미지 업로드 영역 ────────────────── */}
      {searchMode === 'image' && (
        <div className="py-3 border-b border-border/50">
          {imageState ? (
            /* 업로드 후 상태 */
            <div className="flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-muted/30">
              <img
                src={imageState.previewUrl!}
                alt="업로드 이미지"
                className="w-16 h-16 rounded-md object-cover shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{imageState.fileName}</p>
                {imageState.analyzing ? (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <Loader2 className="w-3 h-3 animate-spin" /> AI 분석 중...
                  </span>
                ) : imageState.analyzed ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-600 mt-0.5">
                    <CheckCircle2 className="w-3 h-3" /> 분석 완료 ✓
                  </span>
                ) : null}
                {imageState.analyzed && imageState.aiDescription && (
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2" title={imageState.aiDescription}>
                    {imageState.aiDescription}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onImageRemove}
                title="이미지 제거"
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* 업로드 전 상태 */
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleImageDrop}
              onClick={() => imageFileInputRef.current?.click()}
              className={cn(
                'flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-colors',
                isDragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50 hover:bg-muted/30 text-muted-foreground',
              )}
            >
              <Camera className="w-8 h-8 opacity-40" />
              <span className="text-sm font-medium">이미지를 드래그하거나 클릭하여 업로드</span>
              <span className="text-[11px] text-muted-foreground/60">JPG, PNG, WEBP · 최대 5MB</span>
              <span className="text-[11px] text-primary/70 mt-1">업로드 후 AI가 패션 아이템을 분석해 유사 트렌드를 찾아드립니다</span>
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleImageFileInput}
              />
            </div>
          )}
        </div>
      )}

      {/* ── 텍스트 검색 모드 전용 필터들 ────────────────────────── */}
      {searchMode === 'text' && (
        <>
          {/* 사이트 */}
          <div className={rowCls}>
            <span className={labelCls}>사이트</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
              {platformOptions.map((opt) => (
                <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={filters.platforms.includes(opt.key)}
                    onChange={() => toggleArr('platforms', opt.key)} className={cbCls} />
                  <PlatformLogo platform={opt.key} size="sm" />
                  <span className="text-xs text-foreground">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 수집기간 */}
          <div className="flex items-center gap-3 py-2 border-b border-border/50 flex-wrap">
            <span className="text-xs font-medium text-muted-foreground min-w-[72px] shrink-0">수집기간</span>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                {[
                  { key: '', label: '전체' }, { key: '1', label: '어제' },
                  { key: '7', label: '7일' }, { key: '15', label: '15일' },
                  { key: '30', label: '30일' },
                ].map((opt, idx) => (
                  <button key={opt.key}
                    onClick={() => setFilters((f) => ({ ...f, timeRange: opt.key, dateFrom: '', dateTo: '' }))}
                    className={cn(
                      'text-xs px-3 py-1.5 transition-colors',
                      idx > 0 && 'border-l border-border',
                      filters.timeRange === opt.key && !filters.dateFrom && !filters.dateTo
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background text-muted-foreground hover:bg-muted'
                    )}
                  >{opt.label}</button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input type="date" value={filters.dateFrom || ''}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value, timeRange: '' }))}
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]" />
                <span className="text-xs text-muted-foreground">~</span>
                <input type="date" value={filters.dateTo || ''}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value, timeRange: '' }))}
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]" />
              </div>
            </div>
          </div>

          {/* 상세 필터 영역 */}
          {detailFilterOpen && (
            <div className="space-y-0">

              {/* 카테고리 */}
              <div className={rowCls}>
                <span className={labelCls}>카테고리</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allCategories.map((cat) => (
                    <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.categories.includes(cat)}
                        onChange={() => toggleArr('categories', cat)} className={cbCls} />
                      <span className="text-xs text-foreground">{cat}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 성별 */}
              <div className={rowCls}>
                <span className={labelCls}>성별</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allGenders.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.genders.includes(opt.key)}
                        onChange={() => toggleArr('genders', opt.key)} className={cbCls} />
                      <span className="text-xs text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 색상 */}
              <div className={rowCls}>
                <span className={labelCls}>색상</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allColors.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.colors.includes(opt.key)}
                        onChange={() => toggleArr('colors', opt.key)} className={cbCls} />
                      <span className="text-xs text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 상품상태 */}
              <div className={rowCls}>
                <span className={labelCls}>상품상태</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allProductStatuses.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.productStatuses.includes(opt.key)}
                        onChange={() => toggleArr('productStatuses', opt.key)} className={cbCls} />
                      <span className="text-xs text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 배지상태 */}
              <div className={rowCls}>
                <span className={labelCls}>배지상태</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allLifecycleStages.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.lifecycleStages.includes(opt.key)}
                        onChange={() => toggleArr('lifecycleStages', opt.key)} className={cbCls} />
                      <span className="text-xs text-foreground">{opt.icon} {opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 체형 */}
              <div className={rowCls}>
                <span className={labelCls}>체형</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {allBodyTypes.map((opt) => (
                    <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={filters.bodyTypes.includes(opt.key)}
                        onChange={() => toggleArr('bodyTypes', opt.key)} className={cbCls} />
                      <span className="text-xs text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* 기타 상세 */}
              <div className={rowCls}>
                <span className={labelCls}>기타 상세</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {([
                    { key: 'hasViews', label: '판매량 있는 사이트만' },
                    { key: 'deduplication', label: '동일 결과 합치기' },
                    { key: 'setOnly', label: '세트 상품만' },
                    { key: 'mainImageOnly', label: '메인 모델 컷만' },
                  ] as { key: keyof CheckboxState; label: string }[]).map((cb) => (
                    <label key={cb.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={checkboxes[cb.key]}
                        onChange={(e) => setCheckboxes((c) => ({ ...c, [cb.key]: e.target.checked }))}
                        className={cbCls} />
                      <span className="text-xs text-foreground">{cb.label}</span>
                    </label>
                  ))}
                </div>
              </div>

            </div>
          )}
        </>
      )}

      {/* ── 하단 버튼 영역 ───────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-3">
        {searchMode === 'text' ? (
          <button
            onClick={() => setDetailFilterOpen(!detailFilterOpen)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {detailFilterOpen
              ? <><span>상세검색 접기</span><ChevronUp className="w-3.5 h-3.5" /></>
              : <><span>상세검색 펼치기</span><ChevronDown className="w-3.5 h-3.5" /></>
            }
          </button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {searchMode === 'text' && (
            <button onClick={onReset}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
              필터 초기화
            </button>
          )}
          <button
            type="button"
            onClick={onSearch}
            disabled={isSearching}
            className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60 flex items-center gap-1.5"
          >
            {isSearching && <Loader2 className="w-3 h-3 animate-spin" />}
            {searchMode === 'image' ? '이미지 검색' : '검색'}
          </button>
        </div>
      </div>
    </div>
  );
};

const TrendCardSkeleton = () => (
  <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
    <Skeleton className="aspect-[3/4] w-full rounded-none" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  </div>
);

// ─── 유사도 신뢰 수준 스타일 (수정 2) ────────────────────────
function getSimilarityStyle(score: number) {
  if (score >= 0.75) return { color: 'text-green-600', bg: 'bg-green-500', label: '높음' };
  if (score >= 0.60) return { color: 'text-amber-600', bg: 'bg-amber-400', label: '보통' };
  return { color: 'text-red-500', bg: 'bg-red-400', label: '낮음' };
}

// ─── 외부 링크 라벨 (도메인 기반) ───────────────────────────
function getLinkLabel(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('1688'))     return '1688 상품 페이지 열기 ↗';
    if (hostname.includes('taobao'))   return 'Taobao 상품 페이지 열기 ↗';
    if (hostname.includes('alibaba'))  return 'Alibaba 상품 페이지 열기 ↗';
    if (hostname.includes('tmall'))    return 'Tmall 상품 페이지 열기 ↗';
    return '새 탭으로 열기 ↗';
  } catch {
    return '새 탭으로 열기 ↗';
  }
}

const MatchedProductSheetCard = ({
  product,
  trendId,
  feedbackState,
  onFeedback,
  onMatchClick,
}: {
  product: TrendMatchProduct;
  trendId: string;
  feedbackState: boolean | undefined;
  onFeedback: (productId: string, isRelevant: boolean) => void;
  onMatchClick?: () => void;
}) => {
  const [matchImgError, setMatchImgError] = useState(false);
  const score = product.combined_score ?? product.similarity;
  const simPct = Math.round(score * 100);
  const simStyle = getSimilarityStyle(score);
  // purchase_link 우선, 없으면 source_url
  const productUrl = product.purchase_link || product.source_url || null;
  const displayName = product.item_name_en || product.item_name || product.product_name || product.category || 'No Name';
  const displayCategory = product.fg_category || product.category;
  const displayPrice = product.unit_price_usd ?? product.price;

  const cardInner = (
    <>
      {/* 좌: 상품 이미지 80×96px */}
      <div className="shrink-0 w-20 h-24 rounded-md overflow-hidden bg-muted">
        {product.image_url && !matchImgError ? (
          <img
            src={product.image_url}
            alt={displayName}
            className="w-full h-full object-cover"
            onError={() => setMatchImgError(true)}
          />
        ) : (
          <NoImagePlaceholder size="md" />
        )}
      </div>
      {/* 우: 상품 정보 */}
      <div className="flex-1 min-w-0">
        {/* 상품명 + 외부링크 아이콘 */}
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-foreground truncate flex-1">{displayName}</p>
          {productUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {getLinkLabel(productUrl)}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        {/* 카테고리 */}
        {displayCategory && (
          <span className="text-xs text-muted-foreground">{displayCategory}</span>
        )}
        {/* 가격 */}
        {displayPrice != null && (
          <p className="text-sm font-semibold mt-0.5">${displayPrice.toFixed(2)}</p>
        )}
        {/* 유사도 바 — 신뢰 수준별 3단계 색상 */}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs font-semibold ${simStyle.color}`}>{simPct}%</span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${simStyle.bg} rounded-full transition-all`} style={{ width: `${simPct}%` }} />
          </div>
          <span className={`text-xs ${simStyle.color}`}>{simStyle.label}</span>
        </div>
        {/* 공장 정보 */}
        {product.factories && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <Factory className="w-3 h-3 shrink-0" />
            <a
              href={`/factories/${product.factories.id}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-medium text-foreground hover:text-primary hover:underline transition-colors group"
            >
              {product.factories.name}
              <ExternalLink className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0" />
            </a>
            {product.factories.country && (
              <span>· {product.factories.country}{product.factories.city ? `, ${product.factories.city}` : ''}</span>
            )}
            {product.factories.moq && (
              <span>· MOQ {product.factories.moq}</span>
            )}
          </div>
        )}
        {/* 피드백 버튼 */}
        {feedbackState !== undefined ? (
          <div className="flex items-center gap-1 mt-1.5">
            <span className={`text-xs ${feedbackState ? 'text-green-600' : 'text-red-500'}`}>
              {feedbackState ? '✓ 정확' : '✗ 부정확'} 피드백 완료
            </span>
          </div>
        ) : (
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFeedback(product.id, true); }}
              className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
            >
              👍 정확
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFeedback(product.id, false); }}
              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
            >
              👎 부정확
            </button>
          </div>
        )}
      </div>
    </>
  );

  const baseCls = 'flex gap-3 p-3 rounded-lg border border-border bg-card transition-all';
  if (productUrl) {
    return (
      <a
        href={productUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onMatchClick?.()}
        className={cn(baseCls, 'cursor-pointer hover:bg-accent hover:shadow-sm hover:border-border/80')}
      >
        {cardInner}
      </a>
    );
  }
  return (
    <div className={cn(baseCls, 'cursor-default opacity-90')}>
      {cardInner}
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const ImageTrendTab = ({ initialKeyword }: { initialKeyword?: string } = {}) => {
  // ── 바이어 시그널 추적 ──────────────────────────────────────
  const { trackSearch, trackView, cancelView, trackMatchClick } = useBuyerSignalTracker();

  // ── Feed state ─────────────────────────────────────────────
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sheetThumbError, setSheetThumbError] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchData, setMatchData] = useState<TrendMatchResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [feedbackGiven, setFeedbackGiven] = useState<Record<string, boolean>>({});

  // sheetThumbError — 아이템 변경 시 리셋
  useEffect(() => { setSheetThumbError(false); }, [selectedLiveItem?.id]);

  // ── Auth ─────────────────────────────────────────────────
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUserId(session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── 검색 모드 (텍스트 / 이미지) ──────────────────────────────
  const [searchMode, setSearchMode] = useState<'text' | 'image'>('text');

  // ── Image Search (inline) ──────────────────────────────────
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [imgBase64, setImgBase64] = useState<string | null>(null); // data:image/...;base64,... 형태
  const [imgAnalyzing, setImgAnalyzing] = useState(false);
  const [imgAnalyzed, setImgAnalyzed] = useState(false);
  const [imgAiDescription, setImgAiDescription] = useState('');
  const [imgSearchResults, setImgSearchResults] = useState<ImageSearchResult[] | null>(null);
  const [imgSearchLoading, setImgSearchLoading] = useState(false);
  // 이미지 AI 설명 → 텍스트 검색 모드 활성 여부 (벡터 검색 대체)
  const [imgTextSearchActive, setImgTextSearchActive] = useState(false);
  // 추출된 패션 키워드 목록 (OR 검색 + UI 표시용)
  const [imgSearchKeywords, setImgSearchKeywords] = useState<string[]>([]);
  // AI 설명에서 감지된 성별 ('men' | 'women' | null)
  const [imgDetectedGender, setImgDetectedGender] = useState<'men' | 'women' | null>(null);

  // 클로저 안전을 위해 ref로도 관리 — handleSearch 가 항상 최신 base64 를 참조하도록
  const imgBase64Ref = useRef<string | null>(null);
  const imgFileRef = useRef<File | null>(null);
  useEffect(() => { imgBase64Ref.current = imgBase64; }, [imgBase64]);
  useEffect(() => { imgFileRef.current = imgFile; }, [imgFile]);

  // ── Filter Preset ─────────────────────────────────────────
  const { presets, save: savePresetToDb, remove: deletePreset } = useFilterPresets(userId);
  const [presetDialogOpen, setPresetDialogOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetSaving, setPresetSaving] = useState(false);

  // ── Filter & sort state ────────────────────────────────────
  const defaultFilters: FilterState = {
    keyword: '',
    platforms: [...allPlatforms],
    timeRange: '', dateFrom: '', dateTo: '',
    categories: [...allCategories],
    genders: allGenders.map(g => g.key),
    colors: allColors.map(c => c.key),
    productStatuses: allProductStatuses.map(s => s.key),
    bodyTypes: allBodyTypes.map(b => b.key),
    lifecycleStages: [...allLifecycleStageKeys],
  };
  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters });
  const [checkboxes, setCheckboxes] = useState<CheckboxState>({
    hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false,
  });
  const [sortBy, setSortBy] = useState('latest');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 검색 버튼 클릭 시 적용되는 필터
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({ ...defaultFilters });
  const [appliedCheckboxes, setAppliedCheckboxes] = useState<CheckboxState>({
    hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false,
  });

  const handleSearch = useCallback(async () => {
    // ── 이미지 검색 모드 ─────────────────────────────────────
    if (searchMode === 'image') {
      const currentBase64 = imgBase64Ref.current ?? imgBase64;
      const hasImage = !!currentBase64 || !!imgFileRef.current || !!imgFile;
      if (!hasImage) {
        toast.info('검색할 이미지를 먼저 업로드해주세요.');
        return;
      }
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }

      let description = imgAiDescription;

      // ai_description이 아직 없으면 analyze_only로 먼저 획득
      if (!description && currentBase64) {
        setImgSearchLoading(true);
        try {
          const { data, error: fnErr } = await supabase.functions.invoke('search-by-image', {
            body: { image_base64: currentBase64, user_id: userId, analyze_only: true },
          });
          if (fnErr) throw fnErr;
          description = data?.ai_description ?? '';
          if (description) {
            setImgAiDescription(description);
            setImgAnalyzed(true);
          }
        } catch (e) {
          toast.error(e instanceof Error ? e.message : '이미지 분석에 실패했습니다.');
          setImgSearchLoading(false);
          return;
        } finally {
          setImgSearchLoading(false);
        }
      }

      if (!description) {
        toast.info('이미지 분석이 진행 중입니다. 잠시 후 다시 시도해주세요.');
        return;
      }

      // AI 설명 → 성별 감지 + 패션 키워드 추출 → 텍스트 검색
      const detectedGender = detectGenderFromDescription(description);
      setImgDetectedGender(detectedGender);
      const terms = extractFashionTerms(description);
      setImgSearchKeywords(terms);
      setAppliedFilters(prev => ({ ...prev, keyword: '' }));
      setAppliedCheckboxes({ ...checkboxes });
      setImgTextSearchActive(true);
      setSortBy('latest');
      setSortDirection('desc');
      return;
    }

    // ── 텍스트/필터 검색 모드 ────────────────────────────────
    setImgTextSearchActive(false);
    setAppliedFilters({ ...filters });
    setAppliedCheckboxes({ ...checkboxes });
    if (filters.keyword.trim()) trackSearch(filters.keyword);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchMode, imgBase64, imgFile, imgAiDescription, userId, filters, checkboxes, trackSearch]);

  // Hot Keyword 클릭 → 키워드 필터 즉시 적용
  const handleKeywordClick = useCallback((keyword: string) => {
    setFilters(f => ({ ...f, keyword }));
    setAppliedFilters(f => ({ ...f, keyword }));
    trackSearch(keyword);
  }, [trackSearch]);

  // ── 이미지 파일 처리 (base64 변환 + 분석) ──────────────────
  const handleImageFile = useCallback(async (file: File) => {
    const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
    const MAX_SIZE = 5 * 1024 * 1024;
    if (!ACCEPTED.includes(file.type)) { toast.error('JPG, PNG, WEBP 형식만 지원합니다.'); return; }
    if (file.size > MAX_SIZE) { toast.error('파일 크기는 5MB 이하여야 합니다.'); return; }

    setImgFile(file);
    setImgBase64(null);
    setImgAnalyzing(true);
    setImgAnalyzed(false);
    setImgAiDescription('');
    setImgSearchResults(null);

    try {
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }
      // 1. FileReader로 base64 변환 (data:image/...;base64,... 형태)
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target!.result as string);
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsDataURL(file);
      });
      setImgBase64(base64);
      // 2. 분석만 실행 (유사도 검색 없음)
      const { data, error: fnErr } = await supabase.functions.invoke('search-by-image', {
        body: { image_base64: base64, user_id: userId, analyze_only: true },
      });
      if (fnErr) throw fnErr;
      setImgAiDescription(data?.ai_description ?? '');
      setImgAnalyzed(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '이미지 분석에 실패했습니다.');
      setImgFile(null);
      setImgBase64(null);
    } finally {
      setImgAnalyzing(false);
    }
  }, [userId]);

  const handleImageRemove = useCallback(() => {
    setImgFile(null);
    setImgBase64(null);
    setImgAnalyzing(false);
    setImgAnalyzed(false);
    setImgAiDescription('');
    setImgSearchResults(null);
    setImgTextSearchActive(false);
    setImgSearchKeywords([]);
    setImgDetectedGender(null);
    // 이미지로 파생된 keyword 초기화 (일반 검색으로 복귀)
    setAppliedFilters(prev => ({ ...prev, keyword: '' }));
    setFilters(prev => ({ ...prev, keyword: '' }));
    setSortBy('latest');
    setSortDirection('desc');
  }, []);

  // ── 검색 모드 전환 핸들러 ──────────────────────────────────
  const handleSearchModeChange = useCallback((mode: 'text' | 'image') => {
    setSearchMode(mode);
    if (mode === 'text') {
      // 이미지 모드 → 텍스트 모드: 업로드된 이미지 및 검색 상태 초기화
      handleImageRemove();
    } else {
      // 텍스트 모드 → 이미지 모드: 텍스트 키워드 초기화, 이미지 검색 아닌 결과 리셋
      setFilters(f => ({ ...f, keyword: '' }));
      setAppliedFilters(f => ({ ...f, keyword: '' }));
      setImgTextSearchActive(false);
    }
  }, [handleImageRemove]);

  // 외부(트렌드 리포트 탭)에서 키워드가 전달되면 즉시 검색 적용
  useEffect(() => {
    if (!initialKeyword) return;
    setFilters(f => ({ ...f, keyword: initialKeyword }));
    setAppliedFilters(f => ({ ...f, keyword: initialKeyword }));
    trackSearch(initialKeyword);
  }, [initialKeyword, trackSearch]);

  const resetFilters = () => {
    const resetF: FilterState = {
      keyword: '',
      platforms: [...allPlatforms],
      timeRange: '', dateFrom: '', dateTo: '',
      categories: [...allCategories],
      genders: allGenders.map(g => g.key),
      colors: allColors.map(c => c.key),
      productStatuses: allProductStatuses.map(s => s.key),
      bodyTypes: allBodyTypes.map(b => b.key),
      lifecycleStages: [...allLifecycleStageKeys],
    };
    const resetCb: CheckboxState = { hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false };
    setFilters(resetF);
    setCheckboxes(resetCb);
    setAppliedFilters(resetF);
    setAppliedCheckboxes(resetCb);
    setSortBy('latest');
    setSortDirection('desc');
  };

  // ── 활성 필터 태그 계산 ────────────────────────────────────
  const filterTags = useMemo(() => {
    type Tag = { id: string; label: string; onRemove: () => void };
    const tags: Tag[] = [];

    const resetF = (patch: Partial<FilterState>) => {
      setFilters(f => ({ ...f, ...patch }));
      setAppliedFilters(f => ({ ...f, ...patch }));
    };
    const resetCb = (patch: Partial<CheckboxState>) => {
      setCheckboxes(c => ({ ...c, ...patch }));
      setAppliedCheckboxes(c => ({ ...c, ...patch }));
    };
    const abbrev = (items: string[], max = 3) =>
      items.length <= max
        ? items.join(', ')
        : `${items.slice(0, max).join(', ')} 외 ${items.length - max}개`;

    if (appliedFilters.keyword.trim()) {
      tags.push({ id: 'keyword', label: `검색: ${appliedFilters.keyword}`, onRemove: () => resetF({ keyword: '' }) });
    }
    if (appliedFilters.platforms.length < allPlatforms.length) {
      const lbls = appliedFilters.platforms.map(k => platformOptions.find(p => p.key === k)?.label ?? k);
      tags.push({ id: 'platforms', label: `사이트: ${abbrev(lbls)}`, onRemove: () => resetF({ platforms: [...allPlatforms] }) });
    }
    if (appliedFilters.timeRange) {
      tags.push({ id: 'timeRange', label: `기간: ${PERIOD_LABELS[appliedFilters.timeRange] ?? appliedFilters.timeRange}`, onRemove: () => resetF({ timeRange: '' }) });
    } else if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      tags.push({ id: 'dateRange', label: `기간: ${appliedFilters.dateFrom || '...'} ~ ${appliedFilters.dateTo || '...'}`, onRemove: () => resetF({ dateFrom: '', dateTo: '' }) });
    }
    if (appliedFilters.categories.length < allCategories.length) {
      tags.push({ id: 'categories', label: `카테고리: ${abbrev(appliedFilters.categories)}`, onRemove: () => resetF({ categories: [...allCategories] }) });
    }
    if (appliedFilters.genders.length < allGenders.length) {
      const lbls = appliedFilters.genders.map(k => allGenders.find(g => g.key === k)?.label ?? k);
      tags.push({ id: 'genders', label: `성별: ${abbrev(lbls)}`, onRemove: () => resetF({ genders: allGenders.map(g => g.key) }) });
    }
    if (appliedFilters.colors.length < allColors.length) {
      const lbls = appliedFilters.colors.map(k => allColors.find(c => c.key === k)?.label ?? k);
      tags.push({ id: 'colors', label: `색상: ${abbrev(lbls)}`, onRemove: () => resetF({ colors: allColors.map(c => c.key) }) });
    }
    if (appliedFilters.productStatuses.length < allProductStatuses.length) {
      const lbls = appliedFilters.productStatuses.map(k => allProductStatuses.find(s => s.key === k)?.label ?? k);
      tags.push({ id: 'productStatuses', label: `상품상태: ${abbrev(lbls)}`, onRemove: () => resetF({ productStatuses: allProductStatuses.map(s => s.key) }) });
    }
    if (appliedFilters.bodyTypes.length < allBodyTypes.length) {
      const lbls = appliedFilters.bodyTypes.map(k => allBodyTypes.find(b => b.key === k)?.label ?? k);
      tags.push({ id: 'bodyTypes', label: `체형: ${abbrev(lbls)}`, onRemove: () => resetF({ bodyTypes: allBodyTypes.map(b => b.key) }) });
    }
    if (appliedFilters.lifecycleStages.length < allLifecycleStageKeys.length) {
      const lbls = appliedFilters.lifecycleStages.map(k => allLifecycleStages.find(s => s.key === k)?.label ?? k);
      tags.push({ id: 'lifecycleStages', label: `배지: ${abbrev(lbls)}`, onRemove: () => resetF({ lifecycleStages: [...allLifecycleStageKeys] }) });
    }
    if (appliedCheckboxes.hasViews)      tags.push({ id: 'hasViews',      label: '판매량 있는 사이트만', onRemove: () => resetCb({ hasViews: false }) });
    if (appliedCheckboxes.deduplication) tags.push({ id: 'deduplication', label: '동일 결과 합치기',    onRemove: () => resetCb({ deduplication: false }) });
    if (appliedCheckboxes.setOnly)       tags.push({ id: 'setOnly',       label: '세트 상품만',        onRemove: () => resetCb({ setOnly: false }) });
    if (appliedCheckboxes.mainImageOnly) tags.push({ id: 'mainImageOnly', label: '메인 모델 컷만',     onRemove: () => resetCb({ mainImageOnly: false }) });
    if (sortBy !== 'latest') {
      tags.push({ id: 'sortBy', label: `정렬: ${SORT_LABELS[sortBy] ?? sortBy}`, onRemove: () => { setSortBy('latest'); setSortDirection('desc'); } });
    }
    return tags;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFilters, appliedCheckboxes, sortBy]);

  // ── 프리셋 저장 핸들러 ────────────────────────────────────
  const handleSavePreset = async () => {
    if (!presetName.trim()) return;
    setPresetSaving(true);
    const payload = {
      ...appliedFilters,
      checkboxes: appliedCheckboxes,
      sortBy,
      sortDirection,
    };
    const err = await savePresetToDb(presetName.trim(), payload);
    setPresetSaving(false);
    if (err) {
      toast.error(`저장 실패: ${err}`);
    } else {
      toast.success(`"${presetName.trim()}" 프리셋이 저장되었습니다.`);
      setPresetDialogOpen(false);
      setPresetName('');
    }
  };

  // ── 프리셋 적용 핸들러 ────────────────────────────────────
  const handleApplyPreset = (preset: FilterPreset) => {
    const f = preset.filters;
    const restored: FilterState = {
      keyword:          f.keyword         ?? '',
      platforms:        f.platforms        ?? [...allPlatforms],
      timeRange:        f.timeRange        ?? '',
      dateFrom:         f.dateFrom         ?? '',
      dateTo:           f.dateTo           ?? '',
      categories:       f.categories       ?? [...allCategories],
      genders:          f.genders          ?? allGenders.map(g => g.key),
      colors:           f.colors           ?? allColors.map(c => c.key),
      productStatuses:  f.productStatuses  ?? allProductStatuses.map(s => s.key),
      bodyTypes:        f.bodyTypes        ?? allBodyTypes.map(b => b.key),
      lifecycleStages:  f.lifecycleStages  ?? [...allLifecycleStageKeys],
    };
    const restoredCb: CheckboxState = {
      hasViews:       f.checkboxes?.hasViews       ?? false,
      deduplication:  f.checkboxes?.deduplication  ?? false,
      setOnly:        f.checkboxes?.setOnly         ?? false,
      mainImageOnly:  f.checkboxes?.mainImageOnly   ?? false,
    };
    setFilters(restored);
    setAppliedFilters(restored);
    setCheckboxes(restoredCb);
    setAppliedCheckboxes(restoredCb);
    setSortBy(f.sortBy ?? 'latest');
    setSortDirection(f.sortDirection ?? 'desc');
    toast.success(`"${preset.name}" 프리셋이 적용되었습니다.`);
  };

  const { items: liveFeedItems, loading: feedLoading, refetch } = useSnsTrendFeed('all');
  const { data: kwStatsData, fetch: fetchKwStats } = useTrendKeywordStats();

  useEffect(() => { fetchKwStats(); }, [fetchKwStats]);

  const keywordStatsMap = useMemo(() => {
    const m = new Map<string, KeywordStat>();
    for (const kw of kwStatsData?.keywords ?? []) {
      m.set(kw.keyword.toLowerCase(), kw);
    }
    return m;
  }, [kwStatsData]);

  // 사이드뷰용 — 선택된 아이템의 키워드 상승/하락 배지
  const selectedItemStats = useMemo(() => {
    if (!selectedLiveItem || !keywordStatsMap.size) return [];
    return (selectedLiveItem.trend_keywords || [])
      .map(k => keywordStatsMap.get(k.toLowerCase()))
      .filter((s): s is KeywordStat => !!s)
      .sort((a, b) => b.total_7d - a.total_7d)
      .slice(0, 4);
  }, [selectedLiveItem, keywordStatsMap]);

  // ── 이미지 검색 결과 카드 클릭 → 사이드뷰 오픈 ─────────────
  const handleImageSearchResultClick = useCallback(async (id: string) => {
    // 이미 로드된 피드에서 먼저 탐색
    const found = liveFeedItems.find(item => item.id === id);
    if (found) {
      setSelectedLiveItem(found);
      setSheetOpen(true);
      trackView(found.id);
      return;
    }
    // 없으면 DB에서 직접 조회 (오래된 아이템 등)
    try {
      const { data } = await (supabase as any)
        .from('trend_analyses')
        .select('*')
        .eq('id', id)
        .single();
      if (data) {
        const sd = data.source_data || {};
        const partial = {
          ...data,
          platform: sd.platform || 'unknown',
          image_url: sd.image_url || '',
          permalink: sd.permalink || '',
          author: sd.author || '',
          like_count: Number(sd.like_count) || 0,
          view_count: Number(sd.view_count) || 0,
          trend_name: sd.trend_name || sd.article_title || '',
          trend_score: Number(sd.trend_score) || 0,
          summary_ko: sd.summary_ko || '',
          trend_keywords: data.trend_keywords || [],
          trend_categories: data.trend_categories || [],
          search_hashtags: sd.hashtags || [],
          ai_analyzed: data.ai_analyzed ?? false,
          ai_keywords: data.ai_keywords || [],
          source_data: sd,
        } as TrendFeedItem;
        setSelectedLiveItem(partial);
        setSheetOpen(true);
        trackView(id);
      }
    } catch {
      toast.error('트렌드 상세 정보를 불러오지 못했습니다.');
    }
  }, [liveFeedItems, trackView]);

  // ── Last run state (헤더 "마지막 수집" 표시용) ─────────────
  const [lastRun, setLastRun] = useState<BatchRun | null>(null);

  const fetchBatchHistory = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('batch_runs')
        .select('id, started_at, completed_at, triggered_by, status, collected_count, analyzed_count, embedded_count, failed_count')
        .order('started_at', { ascending: false })
        .limit(1);
      const runs = (data ?? []) as BatchRun[];
      if (runs.length > 0) setLastRun(runs[0]);
    } catch {
      // non-critical — silently skip if table not yet created
    }
  }, []);

  useEffect(() => { fetchBatchHistory(); }, [fetchBatchHistory]);

  // ── Pipeline: batch-pipeline Edge Function ─────────────────
  const [collecting, setCollecting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'collecting' | 'analyzing' | 'embedding' | 'done'>('idle');
  const [pipelineInfo, setPipelineInfo] = useState('');

  const handleCollectNow = async () => {
    setCollecting(true);
    setPipelineStage('collecting');
    setPipelineInfo('');

    // Cycle collecting ↔ analyzing as visual feedback while server-side pipeline runs
    const stageTimer = setInterval(() => {
      setPipelineStage((prev) => {
        if (prev === 'collecting') return 'analyzing';
        if (prev === 'analyzing')  return 'collecting';
        return prev;
      });
    }, 15_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast.error('로그인이 필요합니다.');
        clearInterval(stageTimer);
        setCollecting(false);
        setPipelineStage('idle');
        return;
      }

      // ── Step 1: SNS/FashionGo 배치 파이프라인 ────────────────
      const { data, error } = await supabase.functions.invoke('batch-pipeline', {
        body: {
          sources: ['instagram', 'tiktok', 'magazine', 'google', 'amazon', 'pinterest', 'fashiongo'],
          analyze: true,
          embed: true,
          triggered_by: 'manual',
        },
      });

      clearInterval(stageTimer);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const collected = data?.collected ?? 0;
      const analyzed  = data?.analyzed  ?? 0;
      const bySource  = (data?.collected_by_source ?? {}) as Record<string, { count: number; failed: number }>;

      const sourceLabels: Record<string, string> = {
        sns: 'SNS', magazine: 'Magazine', google: 'Google',
        amazon: 'Amazon', pinterest: 'Pinterest', shein: 'Shein', zara: 'Zara', fashiongo: 'FashionGo',
      };
      const bySourceParts = Object.entries(bySource)
        .filter(([, v]) => (v?.count ?? 0) > 0 || (v?.failed ?? 0) > 0)
        .map(([k, v]) => `${sourceLabels[k] ?? k} ${v.count}건`);
      const bySourceStr = bySourceParts.length ? bySourceParts.join(' / ') : `수집 ${collected}건`;

      // ── Step 2: 이미지 임베딩 자동 생성 ─────────────────────
      setPipelineStage('embedding');
      let embedProcessed = 0;
      let embedFailed = 0;
      try {
        const { data: embedData, error: embedErr } = await supabase.functions.invoke(
          'batch-generate-image-embeddings',
          { body: { target: 'trend', batch_size: 20 } },
        );
        if (!embedErr && !embedData?.error) {
          embedProcessed = embedData?.processed ?? 0;
          embedFailed    = embedData?.failed    ?? 0;
        }
      } catch {
        // 임베딩 실패는 수집 성공에 영향 없음 — 경고만 표시
        toast.warning('이미지 임베딩 생성 실패 (이미지 검색에 영향 있을 수 있음)');
      }

      // ── 완료 ─────────────────────────────────────────────────
      const embedInfo = embedFailed > 0
        ? `${embedProcessed}건 생성됨 (실패 ${embedFailed}건)`
        : `${embedProcessed}건 생성됨`;
      const infoStr = `${bySourceStr} / 분석 ${analyzed}건 / 임베딩 ${embedInfo}`;

      setPipelineStage('done');
      setPipelineInfo(infoStr);
      toast.success(`트렌드 수집 완료 · 이미지 임베딩 ${embedInfo}`);

      refetch();
      fetchKwStats({ rebuild: true });
      await fetchBatchHistory();

      setTimeout(() => {
        setPipelineStage('idle');
        setPipelineInfo('');
      }, 4_000);
    } catch (e: unknown) {
      clearInterval(stageTimer);
      const msg = e instanceof Error ? e.message : '배치 수집에 실패했습니다.';
      toast.error(msg);
      setPipelineStage('idle');
      setPipelineInfo('');
    } finally {
      setCollecting(false);
    }
  };

  // ── FashionGo 바이어 데이터 수집 ───────────────────────────
  const [fgCollecting, setFgCollecting] = useState(false);

  const handleCollectFG = async () => {
    setFgCollecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }

      const { data, error } = await supabase.functions.invoke('collect-fg-buyer-signals', {
        body: { user_id: userId, limit: 20, mode: 'mock' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const saved = data?.trend_rows ?? data?.saved ?? 0;
      toast.success(`FashionGo 바이어 시그널 수집 완료 · ${saved}개 트렌드 추가`);
      refetch();
      fetchKwStats({ rebuild: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'FG 데이터 수집 실패');
    } finally {
      setFgCollecting(false);
    }
  };

  // ── Trend match helpers ────────────────────────────────────
  const [needsAnalysis, setNeedsAnalysis] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const resolveTrendAnalysisId = useCallback(async (item: TrendFeedItem) => {
    const { data: exactRow } = await supabase
      .from('trend_analyses')
      .select('id')
      .eq('id', item.id)
      .maybeSingle();
    if (exactRow?.id) return exactRow.id;

    const permalinkCandidates = [item.permalink, item.source_data?.permalink].filter(Boolean) as string[];
    for (const permalink of permalinkCandidates) {
      const { data: byPermalink } = await supabase
        .from('trend_analyses')
        .select('id')
        .eq('source_data->>permalink', permalink)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPermalink?.id) return byPermalink.id;
    }

    const postIdCandidates = [item.source_data?.post_id, item.id].filter(Boolean) as string[];
    for (const postId of postIdCandidates) {
      const { data: byPostId } = await supabase
        .from('trend_analyses')
        .select('id')
        .eq('source_data->>post_id', postId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPostId?.id) return byPostId.id;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('로그인이 필요합니다.');

    const sourceData = {
      ...(item.source_data ?? {}),
      platform: item.platform, image_url: item.image_url,
      permalink: item.permalink, author: item.author,
      like_count: item.like_count, view_count: item.view_count,
      trend_name: item.trend_name, summary_ko: item.summary_ko,
      magazine_name: item.magazine_name, article_title: item.article_title,
      search_hashtags: item.search_hashtags ?? [],
      post_id: item.source_data?.post_id ?? item.id,
      collected_at: item.created_at,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('trend_analyses')
      .insert({ user_id: userId, trend_keywords: item.trend_keywords ?? [], trend_categories: item.trend_categories ?? [], status: 'pending', source_data: sourceData })
      .select('id')
      .single();

    if (insertErr || !inserted) throw new Error(insertErr?.message || 'trend_analyses row 생성 실패');
    return inserted.id;
  }, []);

  const fetchMatches = useCallback(async (item: TrendFeedItem, opts?: { strongOnly?: boolean }) => {
    setMatchLoading(true);
    setMatchData(null);
    setMatchError(null);
    setNeedsAnalysis(false);

    try {
      const analysisId = await resolveTrendAnalysisId(item);
      const body: Record<string, unknown> = { trend_id: analysisId, max_results: 10 };
      // 기본은 서버 기본값(0.40)을 따르고, 강한 매칭만 보고 싶을 때만 0.55를 명시.
      if (opts?.strongOnly) body.threshold = 0.55;
      const { data, error } = await supabase.functions.invoke('match-trend-to-products', {
        body,
      });

      if (error) {
        let bodyText = '';
        try {
          if (error.context && typeof error.context.json === 'function') {
            bodyText = JSON.stringify(await error.context.json());
          } else if (error.context && typeof error.context.text === 'function') {
            bodyText = await error.context.text();
          }
        } catch { /* ignore */ }
        const errMsg = bodyText || error.message || String(error);
        if (errMsg.includes('embedding') || errMsg.includes('422') || errMsg.includes('analyze-trend') || errMsg.includes('404')) {
          setNeedsAnalysis(true);
          return;
        }
        throw new Error(errMsg);
      }

      if (data?.error) {
        const errStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        if (
          errStr.includes('embedding') || errStr.includes('analyze-trend') ||
          errStr.includes('trend_item_id를 찾을 수 없습니다') ||
          errStr.includes('trend_id가 필요합니다')
        ) {
          setNeedsAnalysis(true);
          return;
        }
        throw new Error(errStr);
      }

      setMatchData(data as TrendMatchResponse);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '매칭 실패';
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
    }
  }, [resolveTrendAnalysisId]);

  const handleSelectLiveItem = useCallback(async (item: TrendFeedItem) => {
    setSelectedLiveItem(item);
    setSheetOpen(true);
    setFeedbackGiven({});
    trackView(item.id); // 3초 체류 시 view 시그널 기록
    await fetchMatches(item);
  }, [fetchMatches, trackView]);

  const handleRunAnalysisForItem = useCallback(async () => {
    if (!selectedLiveItem) return;
    setAnalysisRunning(true);
    try {
      const baseAnalysisId = await resolveTrendAnalysisId(selectedLiveItem);
      const { data: aData, error: aErr } = await supabase.functions.invoke('analyze-trend', { body: { trend_item_id: baseAnalysisId } });
      if (aErr) throw aErr;
      if (aData?.error) throw new Error(aData.error);

      const analysisId: string = aData?.id || baseAnalysisId;
      const sd = selectedLiveItem.source_data ?? {};
      const textForEmbed = [
        selectedLiveItem.trend_keywords?.join(' '),
        selectedLiveItem.trend_name || sd.trend_name,
        selectedLiveItem.summary_ko  || sd.summary_ko,
        sd.caption?.substring(0, 300),
      ].filter(Boolean).join(' ') || selectedLiveItem.trend_name || sd.trend_name || '';

      const embedBody: Record<string, unknown> = { table: 'trend_analyses', id: analysisId, text: textForEmbed };
      const imageUrl = selectedLiveItem.image_url || sd.image_url;
      if (imageUrl) embedBody.image_url = imageUrl;

      const { data: eData, error: eErr } = await supabase.functions.invoke('generate-embedding', { body: embedBody });
      if (eErr) throw eErr;
      if (eData?.error) throw new Error(eData.error);

      setNeedsAnalysis(false);
      await fetchMatches(selectedLiveItem);
      toast.success('AI 분석 + 임베딩 완료, 매칭 결과를 불러왔습니다.');
      refetch();
    } catch (e: unknown) {
      toast.error(`분석 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setAnalysisRunning(false);
    }
  }, [selectedLiveItem, resolveTrendAnalysisId, fetchMatches, refetch]);

  // ── 피드백 제출 (수정 4) ───────────────────────────────────
  const submitFeedback = useCallback(async (productId: string, isRelevant: boolean) => {
    if (!selectedLiveItem) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('match_feedback')
        .upsert(
          { trend_id: selectedLiveItem.id, product_id: productId, is_relevant: isRelevant },
          { onConflict: 'trend_id,product_id' }
        );
      if (!error) {
        setFeedbackGiven(prev => ({ ...prev, [productId]: isRelevant }));
      }
    } catch {
      // non-critical — 실패해도 UX에 영향 없음
    }
  }, [selectedLiveItem]);

  // ── 매칭 상품 목록 (수정 1: products 우선, matches 하위 호환) ──
  const matchedProducts = useMemo(
    () => (matchData?.products ?? matchData?.matches ?? []) as TrendMatchProduct[],
    [matchData]
  );

  const isCollectDisabled = collecting || pipelineStage === 'done';

  // ── 클라이언트 사이드 필터 + 정렬 ─────────────────────────
  const FALLBACK_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

  const processedItems = useMemo(() => {
    let items = [...liveFeedItems];

    // 이미지 없는 아이템 제외 (null/빈 값/공백/Unsplash 플레이스홀더)
    items = items.filter(item => item.image_url && item.image_url.trim() !== '' && item.image_url !== FALLBACK_PLACEHOLDER);

    // 키워드 검색 — 가장 먼저 실행
    const matchItem = (item: TrendFeedItem, term: string) => {
      const t = term.toLowerCase();
      return (item.trend_name || '').toLowerCase().includes(t) ||
        (item.trend_keywords || []).some((k: string) => k.toLowerCase().includes(t));
    };

    if (imgTextSearchActive && imgSearchKeywords.length > 0) {
      // ── Step 1: AND 로직 (모든 키워드 매칭) — 결과 ≥ 5이면 사용 ──
      const andFiltered = items.filter(item => imgSearchKeywords.every(t => matchItem(item, t)));
      if (andFiltered.length >= 5) {
        items = andFiltered;
      } else {
        // ── Step 2: OR 로직 (하나라도 매칭) — 결과 ≥ 3이면 사용 ──
        const orFiltered = items.filter(item => imgSearchKeywords.some(t => matchItem(item, t)));
        if (orFiltered.length >= 3) {
          items = orFiltered;
        } else {
          // ── Step 3: 단어 단위 분리 → OR-union 재시도 ──────────
          const singles = [...new Set(
            imgSearchKeywords.flatMap(t => t.split(/\s+/)).filter(w => w.length > 2)
          )];
          if (singles.length > 0) {
            const singleFiltered = items.filter(item => singles.some(w => matchItem(item, w)));
            items = singleFiltered.length > 0 ? singleFiltered : orFiltered;
          } else {
            items = orFiltered;
          }
        }
      }
    } else if (appliedFilters.keyword && appliedFilters.keyword.trim()) {
      // 일반 텍스트 검색
      items = items.filter(item => matchItem(item, appliedFilters.keyword.trim()));
    }

    if (appliedFilters.platforms.length > 0 && appliedFilters.platforms.length < allPlatforms.length) {
      items = items.filter(item => appliedFilters.platforms.includes(item.platform));
    }
    if (appliedFilters.timeRange) {
      const days = parseInt(appliedFilters.timeRange);
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      items = items.filter(item => new Date(item.created_at) >= cutoff);
    } else if (appliedFilters.dateFrom || appliedFilters.dateTo) {
      items = items.filter(item => {
        const itemDate = new Date(item.created_at);
        if (appliedFilters.dateFrom && itemDate < new Date(appliedFilters.dateFrom)) return false;
        if (appliedFilters.dateTo) {
          const toDate = new Date(appliedFilters.dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (itemDate > toDate) return false;
        }
        return true;
      });
    }
    // 카테고리 — 전체 선택이 아닐 때만 필터링
    if (appliedFilters.categories.length > 0 && appliedFilters.categories.length < allCategories.length) {
      items = items.filter(item =>
        item.trend_categories?.some((c: string) =>
          appliedFilters.categories.some((fc) => c.toLowerCase() === fc.toLowerCase())
        )
      );
    }
    // 성별 — 이미지 검색 시 감지된 성별 우선, 수동 선택 시 수동 필터 우선
    const isDefaultGenders = appliedFilters.genders.length === allGenders.length;
    if (imgTextSearchActive && imgDetectedGender && isDefaultGenders) {
      // 이미지 검색: 사용자가 성별 필터를 따로 건드리지 않은 경우에만 자동 적용
      items = items.filter(item => {
        const gender = (item.source_data?.gender ?? '').toLowerCase();
        if (!gender) return true; // 성별 정보 없으면 포함
        return gender === imgDetectedGender || gender === 'unisex';
      });
    } else if (appliedFilters.genders.length > 0 && appliedFilters.genders.length < allGenders.length) {
      // 일반 검색: 수동으로 좁힌 경우만 필터링
      items = items.filter(item => {
        const gender = item.source_data?.gender;
        if (!gender) return true;
        return appliedFilters.genders.includes(gender.toLowerCase());
      });
    }
    // 색상 — 전체 선택이 아닐 때만 필터링
    if (appliedFilters.colors.length > 0 && appliedFilters.colors.length < allColors.length) {
      items = items.filter(item => {
        const sd = item.source_data;
        if (Array.isArray(sd?.colors) && sd.colors.length > 0) {
          return sd.colors.some((c: string) => appliedFilters.colors.includes(c.toLowerCase()));
        }
        const kw = item.trend_keywords || [];
        return appliedFilters.colors.some((fc) =>
          kw.some((k: string) => k.toLowerCase().includes(fc)) ||
          item.trend_name?.toLowerCase().includes(fc)
        );
      });
    }
    // 상품상태 — 전체 선택이 아닐 때만 필터링
    if (appliedFilters.productStatuses.length > 0 && appliedFilters.productStatuses.length < allProductStatuses.length) {
      items = items.filter(item => {
        const matches: boolean[] = [];
        if (appliedFilters.productStatuses.includes('new')) {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          matches.push(new Date(item.created_at) >= sevenDaysAgo);
        }
        if (appliedFilters.productStatuses.includes('analyzed')) {
          matches.push(item.ai_analyzed === true);
        }
        return matches.some(Boolean);
      });
    }
    // 체형 — 전체 선택이 아닐 때만 필터링
    if (appliedFilters.bodyTypes.length > 0 && appliedFilters.bodyTypes.length < allBodyTypes.length) {
      items = items.filter(item => {
        const bodyType = item.source_data?.body_type;
        if (!bodyType) return true;
        return appliedFilters.bodyTypes.includes(bodyType.toLowerCase());
      });
    }
    if (appliedCheckboxes.hasViews) {
      items = items.filter(item => {
        const sd = item.source_data;
        return Number(sd?.views || sd?.view_count || sd?.play_count || sd?.engagement_count || 0) > 0;
      });
    }
    if (appliedCheckboxes.setOnly) {
      items = items.filter(item => {
        const sd = item.source_data;
        // source_data.is_set 우선
        if (sd?.is_set !== undefined) return !!sd.is_set;
        // 폴백: trend_name / trend_keywords 에서 세트 관련 키워드 검사
        const name = (item.trend_name || '').toLowerCase();
        const kw = (item.trend_keywords || []).join(' ').toLowerCase();
        return (
          name.includes('set') || name.includes('coord') || name.includes('matching') || name.includes('2-piece') ||
          kw.includes('set') || kw.includes('coord') || kw.includes('matching') || kw.includes('2-piece')
        );
      });
    }
    if (appliedCheckboxes.mainImageOnly) {
      items = items.filter(item => !!item.image_url);
    }
    if (appliedCheckboxes.deduplication) {
      const seen = new Set<string>();
      items = items.filter(item => {
        const name = (item.trend_name || '').toLowerCase().trim();
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
    }

    // 배지 상태 필터 — 전체 선택이 아닐 때만 적용
    if (appliedFilters.lifecycleStages.length < allLifecycleStageKeys.length) {
      items = items.filter(item => {
        const stage = item.lifecycle_stage;
        if (stage == null) return appliedFilters.lifecycleStages.includes('unanalyzed');
        return appliedFilters.lifecycleStages.includes(stage);
      });
    }

    // 정렬 (sortBy + sortDirection 즉시 반영 — 검색 버튼과 무관)
    {
      const dir = sortDirection === 'desc' ? 1 : -1;
      items.sort((a, b) => {
        switch (sortBy) {
          case 'latest':
            return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * dir;
          case 'oldest':
            return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
          case 'engagement': {
            // engagement_rate 컬럼이 NULL인 경우가 대부분이므로
            // like_count + view_count (SNS) / fg 시그널 합산 (FashionGo) 으로 폴백
            const calcEngagement = (item: TrendFeedItem): number => {
              if (item.engagement_rate != null) return item.engagement_rate;
              if (item.platform === 'fashiongo') {
                return (
                  (item.fg_view_count    || 0) +
                  (item.fg_click_count   || 0) * 5 +
                  (item.fg_wishlist_count || 0) * 10
                );
              }
              return (item.like_count || 0) + (item.view_count || 0) * 0.1;
            };
            return (calcEngagement(b) - calcEngagement(a)) * dir;
          }
          case 'platform': {
            // platform_count DESC, NULL 맨 뒤
            const pa = a.platform_count ?? -1;
            const pb = b.platform_count ?? -1;
            return (pb - pa) * dir;
          }
          case 'keywords': {
            // trend_keywords 배열 길이 DESC, NULL 맨 뒤
            const ka = a.trend_keywords?.length ?? -1;
            const kb = b.trend_keywords?.length ?? -1;
            return (kb - ka) * dir;
          }
          case 'lifecycle': {
            // Peak → Rising → Emerging → Classic → Declining → NULL
            const LIFECYCLE_ORDER: Record<string, number> = {
              peak: 0, rising: 1, emerging: 2, classic: 3, declining: 4,
            };
            const la = a.lifecycle_stage != null ? (LIFECYCLE_ORDER[a.lifecycle_stage] ?? 5) : 6;
            const lb = b.lifecycle_stage != null ? (LIFECYCLE_ORDER[b.lifecycle_stage] ?? 5) : 6;
            return (la - lb) * dir;
          }
          default: return 0;
        }
      });
    }

    return items;
  }, [liveFeedItems, appliedFilters, appliedCheckboxes, sortBy, sortDirection, imgTextSearchActive, imgSearchKeywords, imgDetectedGender]);

  const hasLiveFeed = !feedLoading && liveFeedItems.length > 0;

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      <div>
        {/* 타이틀 + 액션 버튼 — 한 행 */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">트렌드 상품 탐색</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              SNS·커머스 트렌드를 AI로 분석하고 매칭 공장 상품을 탐색합니다
            </p>
          </div>

          {/* 우측 액션 버튼 */}
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {/* 수집 설정 Sheet */}
            <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
              <SheetTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 w-8 p-0" title="수집 설정">
                  <Settings className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[640px] sm:max-w-[640px] flex flex-col p-0">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
                  <SheetTitle>수집 설정</SheetTitle>
                  <p className="text-sm text-muted-foreground">
                    사이트별 수집 키워드와 해시태그를 관리합니다.
                  </p>
                </SheetHeader>
                <div className="flex-1 overflow-y-auto px-5 pt-4">
                  <CollectionSettingsPanel onSaved={() => setSettingsOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>

            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              disabled={isCollectDisabled}
              onClick={handleCollectNow}
            >
              {collecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : pipelineStage === 'done'
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
              {pipelineStage === 'collecting' && '트렌드 수집 중...'}
              {pipelineStage === 'analyzing'  && 'AI 분석 중...'}
              {pipelineStage === 'embedding'  && '이미지 임베딩 생성 중...'}
              {pipelineStage === 'done'       && `완료! ${pipelineInfo}`}
              {pipelineStage === 'idle'       && '트렌드 수집하기'}
            </Button>
          </div>
        </div>

        {/* ── 필터 패널 (항상 펼침 — 검색/이미지검색 포함) ──── */}
        <TrendFilterPanel
          filters={filters}
          setFilters={setFilters}
          checkboxes={checkboxes}
          setCheckboxes={setCheckboxes}
          onReset={resetFilters}
          onSearch={handleSearch}
          searchMode={searchMode}
          onSearchModeChange={handleSearchModeChange}
          imageState={imgBase64 ? {
            previewUrl: imgBase64,
            fileName: imgFile?.name ?? null,
            analyzing: imgAnalyzing,
            analyzed: imgAnalyzed,
            aiDescription: imgAiDescription,
          } : null}
          onImageFile={handleImageFile}
          onImageRemove={handleImageRemove}
          isSearching={imgSearchLoading}
        />

        {/* ── 툴바: 건수 · 정렬 · 프리셋 · 배지설명 ──────────── */}
        <div className="mt-2 flex items-center gap-2 flex-wrap min-h-[32px]">
          {/* 건수 */}
          <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
            {imgTextSearchActive
              ? `이미지 검색 결과 ${processedItems.length}건`
              : imgSearchResults !== null
                ? `이미지 검색 결과 ${imgSearchResults.length}건`
                : `${processedItems.length}건`}
          </span>

          {/* 정렬 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {SORT_LABELS[sortBy] ?? '정렬'}
                <span className="text-[10px]">{sortDirection === 'desc' ? '▼' : '▲'}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {([
                { key: 'latest',     label: '최신순' },
                { key: 'oldest',     label: '오래된순' },
                { key: 'platform',   label: '플랫폼 등장순' },
                { key: 'keywords',   label: '키워드 많은순' },
                { key: 'lifecycle',  label: '라이프사이클순' },
                { key: 'engagement', label: '인게이지먼트순' },
                { key: 'similarity', label: '유사도순' },
              ] as const).map(opt => (
                <DropdownMenuItem
                  key={opt.key}
                  onSelect={() => {
                    if (sortBy === opt.key) {
                      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
                    } else {
                      setSortBy(opt.key);
                      setSortDirection('desc');
                    }
                  }}
                  className={cn('flex items-center justify-between gap-4', sortBy === opt.key && 'text-primary font-medium')}
                >
                  <span>{opt.label}</span>
                  {sortBy === opt.key && <span className="text-[10px]">{sortDirection === 'desc' ? '▼' : '▲'}</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 프리셋 저장 / 불러오기 (로그인 시만) */}
          {userId && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (presets.length >= MAX_PRESETS) {
                    toast.error(`프리셋은 최대 ${MAX_PRESETS}개까지 저장할 수 있습니다.`);
                    return;
                  }
                  setPresetName('');
                  setPresetDialogOpen(true);
                }}
                disabled={presets.length >= MAX_PRESETS}
                className={cn(
                  'inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors',
                  presets.length >= MAX_PRESETS
                    ? 'opacity-40 cursor-not-allowed border-border text-muted-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted',
                )}
                title={presets.length >= MAX_PRESETS ? `최대 ${MAX_PRESETS}개 저장 가능` : '현재 필터 저장'}
              >
                <Bookmark className="w-3 h-3" />
                필터 저장
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    저장된 필터
                    {presets.length > 0 && (
                      <span className="bg-primary text-primary-foreground text-[9px] font-bold px-1 rounded-full leading-none">
                        {presets.length}
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  {presets.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      저장된 필터가 없습니다
                    </div>
                  ) : (
                    presets.map((preset, idx) => (
                      <div key={preset.id}>
                        {idx > 0 && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          onSelect={() => handleApplyPreset(preset)}
                          className="flex items-center justify-between gap-2 pr-1"
                        >
                          <span className="flex-1 truncate text-xs">{preset.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              deletePreset(preset.id);
                              toast.success(`"${preset.name}" 프리셋이 삭제되었습니다.`);
                            }}
                            className="shrink-0 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-colors"
                            aria-label="프리셋 삭제"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </DropdownMenuItem>
                      </div>
                    ))
                  )}
                  {presets.length > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <div className="px-3 py-1.5 text-[10px] text-muted-foreground text-right">
                        {presets.length}/{MAX_PRESETS}개 사용 중
                      </div>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* 우측: 배지 설명 */}
          <div className="ml-auto">
            <Popover>
              <PopoverTrigger asChild>
                <button className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Info className="w-3 h-3" />
                  배지설명
                </button>
              </PopoverTrigger>
              <PopoverContent side="bottom" align="end" className="w-80 p-4 max-h-[70vh] overflow-y-auto">
                <h4 className="text-sm font-semibold mb-3">트렌드 라이프사이클 배지 안내</h4>
                <div className="space-y-3">
                  {LIFECYCLE_BADGE_INFO.map(b => (
                    <div key={b.stage}>
                      <p className="text-xs font-medium">{b.icon} {b.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{b.desc}</p>
                    </div>
                  ))}
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-medium">↑ 키워드 +N%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      해당 트렌드의 핵심 키워드가 최근 7일간 이전 대비 N% 더 많이 수집된 경우 표시. 수치가 높을수록 급상승 중인 키워드.
                    </p>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>


        {/* 이미지 검색 결과 배너 */}
        {(imgSearchResults !== null || imgTextSearchActive) && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-sm">
            <span>🖼️</span>
            <span className="text-blue-700 text-xs flex-1">
              {imgTextSearchActive && imgSearchKeywords.length > 0
                ? `AI 설명 기반 키워드 검색: ${imgSearchKeywords.map(k => `"${k}"`).join(', ')}${imgDetectedGender ? ` | 감지된 성별: ${imgDetectedGender === 'men' ? '남성' : '여성'}` : ''}`
                : '이미지 검색 결과입니다.'}
            </span>
            <button
              type="button"
              onClick={handleImageRemove}
              className="text-xs text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors shrink-0"
            >
              일반 검색으로 돌아가기
            </button>
          </div>
        )}

        {/* 이미지 검색 로딩 */}
        {imgSearchLoading && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <TrendCardSkeleton key={i} />)}
          </div>
        )}

        {/* Loading skeleton */}
        {feedLoading && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <TrendCardSkeleton key={i} />)}
          </div>
        )}

        {/* 빈 상태 — 수집된 트렌드 없음 */}
        {!feedLoading && !imgSearchLoading && imgSearchResults === null && liveFeedItems.length === 0 && (
          <div className="mt-3 text-center py-12 space-y-3 border border-dashed border-border rounded-xl">
            <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">트렌드를 수집 중입니다...</p>
            <p className="text-xs text-muted-foreground">"지금 수집" 버튼을 누르거나 자동 스케줄을 기다려주세요.</p>
          </div>
        )}

        {/* 빈 상태 — 이미지 검색 결과 없음 */}
        {!feedLoading && !imgSearchLoading && imgSearchResults === null && liveFeedItems.length > 0 && processedItems.length === 0 && imgTextSearchActive && (
          <div className="mt-3 text-center py-16 space-y-4 rounded-xl border border-dashed border-border">
            <SearchX className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">이미지와 유사한 트렌드를 찾지 못했습니다</p>
              <p className="text-xs text-muted-foreground mt-1">키워드를 직접 입력하거나 다른 이미지로 시도해보세요.</p>
            </div>
            <Button size="sm" variant="outline" onClick={handleImageRemove}>
              일반 검색으로 돌아가기
            </Button>
          </div>
        )}

        {/* 빈 상태 — 일반 필터 결과 없음 */}
        {!feedLoading && !imgSearchLoading && imgSearchResults === null && liveFeedItems.length > 0 && processedItems.length === 0 && !imgTextSearchActive && (
          <div className="mt-3 text-center py-16 space-y-4 rounded-xl border border-dashed border-border">
            <SearchX className="w-12 h-12 mx-auto text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-foreground">검색 결과가 없습니다</p>
              <p className="text-xs text-muted-foreground mt-1">필터 조건을 줄이거나 다른 키워드로 검색해보세요.</p>
            </div>
            <Button size="sm" variant="outline" onClick={resetFilters}>
              필터 초기화
            </Button>
          </div>
        )}

        {/* 이미지 검색 결과 카드 */}
        {!imgSearchLoading && imgSearchResults !== null && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {imgSearchResults.map(result => {
              // liveFeedItems에서 일치하는 아이템 찾기, 없으면 최소 변환
              const feedItem: TrendFeedItem = liveFeedItems.find(i => i.id === result.id) ?? {
                id: result.id,
                trend_name: result.trend_name,
                image_url: result.image_url,
                platform: result.platform,
                lifecycle_stage: result.lifecycle_stage,
                permalink: result.permalink ?? null,
                trend_keywords: [],
                trend_categories: [],
                ai_analyzed: false,
                ai_keywords: [],
                like_count: 0,
                view_count: 0,
                author: '',
                created_at: '',
                trend_score: 0,
                summary_ko: '',
                search_hashtags: [],
                source_data: {},
              } as TrendFeedItem;
              return (
                <LiveTrendCard
                  key={result.id}
                  item={feedItem}
                  selected={selectedLiveItem?.id === result.id}
                  onClick={() => handleSelectLiveItem(feedItem)}
                  keywordStatsMap={keywordStatsMap}
                  similarityPct={Math.round(result.similarity * 100)}
                />
              );
            })}
          </div>
        )}

        {/* Live feed cards (일반 검색) */}
        {!imgSearchLoading && imgSearchResults === null && hasLiveFeed && (
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {processedItems.map(item => (
              <LiveTrendCard
                key={item.id}
                item={item}
                selected={selectedLiveItem?.id === item.id}
                onClick={() => handleSelectLiveItem(item)}
                keywordStatsMap={keywordStatsMap}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Sheet Panel ── */}
      <Sheet open={sheetOpen} onOpenChange={(o) => {
        setSheetOpen(o);
        if (!o && selectedLiveItem) cancelView(selectedLiveItem.id); // 3초 미만 이탈 취소
      }}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 flex flex-col">
          {selectedLiveItem && (
            <>
              <SheetHeader className="px-5 py-4 border-b border-border">
                <SheetDescription className="sr-only">유사상품 패널</SheetDescription>
                {/* 좌(썸네일) / 우(피드 정보) 가로 배치 */}
                <div className="flex gap-4">
                  {/* 좌: 썸네일 */}
                  <div className="w-32 h-40 shrink-0 rounded-lg overflow-hidden bg-muted">
                    {selectedLiveItem.image_url && !sheetThumbError ? (
                      <img
                        src={selectedLiveItem.image_url}
                        alt={cleanTitle(selectedLiveItem.trend_name)}
                        className="w-full h-full object-cover"
                        onError={() => setSheetThumbError(true)}
                      />
                    ) : (
                      <NoImagePlaceholder size="lg" />
                    )}
                  </div>
                  {/* 우: 피드 정보 + AI 분석 정보 통합 (수정 8) */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* 출처 + 라이프사이클 배지 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <PlatformLogo platform={selectedLiveItem.platform} size="md" />
                      <span className="text-xs text-muted-foreground font-medium">
                        {getPlatformBadge(selectedLiveItem.platform).label}
                      </span>
                      {selectedLiveItem.lifecycle_stage && LIFECYCLE_MAP[selectedLiveItem.lifecycle_stage] && (() => {
                        const lc = LIFECYCLE_MAP[selectedLiveItem.lifecycle_stage!];
                        return (
                          <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', lc.cls)}>
                            {lc.emoji} {lc.label}
                          </span>
                        );
                      })()}
                    </div>
                    {/* 타이틀 — HTML 태그 제거 */}
                    <SheetTitle className="text-base leading-snug line-clamp-3">
                      {cleanTitle(selectedLiveItem.trend_name)}
                    </SheetTitle>
                    {/* 원본 보기 */}
                    {selectedLiveItem.permalink && (
                      <a
                        href={selectedLiveItem.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        원본 보기
                      </a>
                    )}
                    {/* AI 분석 배지 */}
                    {selectedLiveItem.ai_analyzed && selectedLiveItem.trend_score > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AI 분석</span>
                        <span className="text-[10px] text-muted-foreground">{selectedLiveItem.trend_score}점</span>
                      </div>
                    )}
                    {/* 상승/하락 키워드 배지 */}
                    {selectedItemStats.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedItemStats.map(stat => <KeywordGrowthBadge key={stat.keyword} stat={stat} />)}
                      </div>
                    )}
                    {/* ── AI 분석 정보 통합 ── */}
                    {/* 키워드 */}
                    {selectedLiveItem.trend_keywords?.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">키워드</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {(selectedLiveItem.ai_keywords?.length
                            ? selectedLiveItem.ai_keywords.map((k: { keyword: string }) => k.keyword)
                            : selectedLiveItem.trend_keywords
                          ).slice(0, 10).map((kw: string) => (
                            <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 성별 / 체형 */}
                    {(selectedLiveItem.source_data?.gender || selectedLiveItem.source_data?.body_type) && (
                      <div className="flex gap-3">
                        {selectedLiveItem.source_data?.gender && (
                          <div>
                            <span className="text-xs text-muted-foreground">성별</span>
                            <p className="font-medium text-xs">
                              {selectedLiveItem.source_data.gender === 'women' ? '여성'
                                : selectedLiveItem.source_data.gender === 'men' ? '남성' : '유니섹스'}
                            </p>
                          </div>
                        )}
                        {selectedLiveItem.source_data?.body_type && (
                          <div>
                            <span className="text-xs text-muted-foreground">체형</span>
                            <p className="font-medium text-xs">
                              {selectedLiveItem.source_data.body_type === 'slim' ? '슬림'
                                : selectedLiveItem.source_data.body_type === 'regular' ? '레귤러' : '플러스'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* 색상 */}
                    {Array.isArray(selectedLiveItem.source_data?.colors) && selectedLiveItem.source_data.colors.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">색상</span>
                        <div className="flex flex-wrap gap-1 mt-0.5">
                          {selectedLiveItem.source_data.colors.map((color: string, idx: number) => (
                            <span key={idx} className="text-xs flex items-center gap-1">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-gray-200"
                                style={{ backgroundColor: getColorHex(color) }} />
                              {color}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 세트상품 */}
                    {selectedLiveItem.source_data?.is_set !== undefined && (
                      <div>
                        <span className="text-xs text-muted-foreground">세트상품</span>
                        <p className="font-medium text-xs">{selectedLiveItem.source_data.is_set ? '예' : '아니오'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    유사상품
                    {matchData && (
                      <span className="font-normal text-muted-foreground text-xs">{matchedProducts.length}건</span>
                    )}
                  </h4>
                  {/* ⓘ 매칭 조건 팝오버 (click 트리거) */}
                  {matchData && (() => {
                    const SIGNAL_LABELS: Record<string, string> = { text: '텍스트', image: '이미지', attr: '속성' };
                    const usedSignalsSet = new Set<string>();
                    matchedProducts.forEach(p => (p.used_signals ?? []).forEach(s => usedSignalsSet.add(s)));
                    const usedSignalsLabel = [...usedSignalsSet].map(s => SIGNAL_LABELS[s] ?? s).join(' + ');
                    const threshold = matchData.debug?.applied_threshold ?? 0.3;
                    const keywords: string[] = matchData.debug?.query_attribute_keywords
                      ?? matchData.trend.ai_keywords.map(k => k.keyword);
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center text-muted-foreground hover:text-foreground transition-colors"
                            aria-label="추출 조건 보기"
                          >
                            <Info className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="left" align="start" className="w-72 text-xs">
                          <div className="space-y-1.5">
                            <p className="font-semibold text-sm mb-2">유사상품 추출 조건</p>
                            <p>• 매칭 신호: {usedSignalsLabel || '없음'}</p>
                            <p>• 임계값: {threshold} 이상</p>
                            <p>• 정렬: 종합 점수 내림차순</p>
                            <p>• 최대 결과: {matchedProducts.length}건</p>
                            {keywords.length > 0 && (
                              <>
                                <p className="font-medium pt-1.5 mt-1.5 border-t border-border">트렌드 키워드</p>
                                <p className="text-muted-foreground">{keywords.join(', ')}</p>
                              </>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>

                {matchLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                        <Skeleton className="w-20 h-20 rounded-md" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-2 w-full" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!matchLoading && needsAnalysis && (
                  <div className="text-center py-8 space-y-3 border border-dashed border-border rounded-lg">
                    <Bot className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">이 트렌드 아이템은 아직 AI 분석이 되지 않았습니다.</p>
                    <p className="text-xs text-muted-foreground">분석 → 임베딩 → 매칭을 순차적으로 실행합니다.</p>
                    <Button size="sm" onClick={handleRunAnalysisForItem} disabled={analysisRunning} className="gap-1.5">
                      {analysisRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                      {analysisRunning ? 'AI 분석 실행 중...' : 'AI 분석 실행'}
                    </Button>
                  </div>
                )}

                {!matchLoading && !needsAnalysis && matchError && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm text-destructive font-medium">⚠️ {matchError}</p>
                  </div>
                )}

                {/* 수정 3: 0건 안내 문구 */}
                {!matchLoading && !matchError && matchData && matchedProducts.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground">유사한 소싱 상품을 찾지 못했습니다</p>
                    <p className="text-xs text-muted-foreground mt-1">상품 데이터가 보강되면 매칭 정확도가 향상됩니다</p>
                  </div>
                )}

                {/* 수정 1, 4: products 배열 + 피드백 props */}
                {!matchLoading && matchData && matchedProducts.length > 0 && (
                  <div className="space-y-2">
                    {matchedProducts.map(p => (
                      <MatchedProductSheetCard
                        key={p.id}
                        product={p}
                        trendId={selectedLiveItem!.id}
                        feedbackState={feedbackGiven[p.id]}
                        onFeedback={submitFeedback}
                        onMatchClick={() => trackMatchClick(selectedLiveItem!.id, p.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* ── 프리셋 저장 다이얼로그 ──────────────────────────── */}
      <Dialog open={presetDialogOpen} onOpenChange={setPresetDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">필터 프리셋 저장</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground block mb-1.5">
              프리셋 이름
            </label>
            <input
              type="text"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
              placeholder="예: 인스타 여성 트렌드"
              maxLength={40}
              autoFocus
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">
              현재 적용된 필터 {filterTags.length > 0 ? `(${filterTags.length}개)` : ''} 및 정렬 설정이 저장됩니다.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setPresetDialogOpen(false)}
              className="text-xs px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSavePreset}
              disabled={!presetName.trim() || presetSaving}
              className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {presetSaving && <Loader2 className="w-3 h-3 animate-spin" />}
              저장
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ImageTrendTab;
