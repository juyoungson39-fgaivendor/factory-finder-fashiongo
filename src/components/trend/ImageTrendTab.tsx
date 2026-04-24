import { useState, useMemo, useEffect, useCallback } from 'react';
import { useTrendKeywordStats, type KeywordStat } from '@/hooks/useTrendKeywordStats';
import { useSnsTrendFeed, type TrendFeedItem, type PlatformFilter } from '@/hooks/useSnsTrendFeed';
import {
  Search, ExternalLink, Loader2, Bot, RefreshCw,
  Factory, CheckCircle2, Settings,
  ShoppingBag, Eye, MousePointerClick, Heart,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';
import ScoreBadge from '@/components/ScoreBadge';
import { CollectionSettingsPanel } from './CollectionSettingsPanel';

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
  factory_name: string;
  factory_id: string;
  image_url: string | null;
  price: number | null;
  stock_quantity: number | null;
  category: string | null;
  fg_category: string | null;
  similarity: number;
}

interface TrendMatchResponse {
  trend: {
    id: string;
    title: string;
    image_url: string | null;
    ai_keywords: Array<{ keyword: string; type: string }>;
    trend_score: number;
  };
  matches: TrendMatchProduct[];
  total_matches: number;
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
}

interface CheckboxState {
  hasViews: boolean;
  deduplication: boolean;
  setOnly: boolean;
  mainImageOnly: boolean;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const allPlatforms = ['tiktok', 'instagram', 'vogue', 'elle', 'wwd', 'hypebeast', 'highsnobiety', 'footwearnews', 'google', 'amazon', 'pinterest', 'fashiongo', 'shein'];

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
};

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

const LiveTrendCard = ({ item, selected, onClick, keywordStatsMap }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
  keywordStatsMap: Map<string, KeywordStat>;
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
        'w-full rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border'
      )}
    >
      {/* 썸네일 — 이미지 위 오버레이 배지 없음 (수정 9) */}
      <div className="relative aspect-[3/4] w-full overflow-hidden group">
        {!loaded && !imgError && <Skeleton className="absolute inset-0 rounded-none" />}
        {imgError ? (
          <div className="w-full h-full bg-muted flex items-center justify-center"><span className="text-4xl">📷</span></div>
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
      </div>
      <div className="p-3 space-y-1">
        {/* 출처 — 타이틀 위 (수정 7) */}
        <span className="block text-[11px] text-muted-foreground font-medium leading-none">
          {getPlatformBadge(item.platform).label}
        </span>
        {/* 타이틀 */}
        <p className="font-semibold text-sm text-foreground line-clamp-2 leading-snug">{item.trend_name}</p>
        {/* AI 분석 배지 — 타이틀 아래 (수정 11) */}
        {item.ai_analyzed && item.trend_score > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AI 분석</span>
            <span className="text-[10px] text-muted-foreground">{item.trend_score}점</span>
          </div>
        )}
        {/* 요약 */}
        {item.summary_ko && <p className="text-[11px] text-muted-foreground line-clamp-2">{item.summary_ko}</p>}
        {matchedStats.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {matchedStats.map(stat => <KeywordGrowthBadge key={stat.keyword} stat={stat} />)}
          </div>
        )}
        {/* 메타데이터 태그 — AI 분석 결과 */}
        {(item.source_data?.gender ||
          (item.source_data?.body_type && item.source_data.body_type !== 'regular') ||
          (Array.isArray(item.source_data?.colors) && item.source_data.colors.length > 0) ||
          item.source_data?.is_set === true) && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {item.source_data?.gender && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                {item.source_data.gender === 'women' ? '여성' : item.source_data.gender === 'men' ? '남성' : '유니섹스'}
              </span>
            )}
            {item.source_data?.body_type && item.source_data.body_type !== 'regular' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                {item.source_data.body_type === 'slim' ? '슬림' : item.source_data.body_type === 'plus' ? '플러스' : item.source_data.body_type}
              </span>
            )}
            {Array.isArray(item.source_data?.colors) && item.source_data.colors.slice(0, 3).map((color: string, idx: number) => (
              <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full border border-gray-300" style={{ backgroundColor: getColorHex(color) }} />
                {color}
              </span>
            ))}
            {item.source_data?.is_set === true && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">세트상품</span>
            )}
          </div>
        )}
        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors mt-1"
          >
            <ExternalLink className="w-3 h-3" /> 원본 보기 ↗
          </a>
        )}
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// FashionGo Buyer Signal Card
// ─────────────────────────────────────────────────────────────
const FashionGoTrendCard = ({ item, selected, onClick }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const signalScore = item.signal_strength ?? item.trend_score ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md',
        selected
          ? 'border-violet-500 ring-2 ring-violet-400/30 shadow-lg'
          : 'border-violet-200 dark:border-violet-800'
      )}
    >
      {/* Image — 이미지 위 오버레이 배지 없음 (수정 9) */}
      <div className="relative aspect-[3/4] w-full overflow-hidden group">
        {!loaded && !imgError && <Skeleton className="absolute inset-0 rounded-none" />}
        {imgError ? (
          <div className="w-full h-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-violet-300" />
          </div>
        ) : (
          <img
            src={item.image_url}
            alt={item.trend_name}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-105', !loaded && 'opacity-0')}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="font-semibold text-sm text-foreground truncate">
          {(item.trend_name || '(트렌드명 없음)').replace(/\s*—\s*.+$/, '')}
        </p>
        {item.trend_categories?.[0] && (
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium">
            {item.trend_categories[0]}
          </span>
        )}

        {/* Buyer signal metrics */}
        <div className="grid grid-cols-3 gap-1.5 py-1">
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold tabular-nums">
              {item.fg_view_count != null
                ? item.fg_view_count >= 1000
                  ? `${(item.fg_view_count / 1000).toFixed(1)}k`
                  : item.fg_view_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">조회</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <MousePointerClick className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold tabular-nums">
              {item.fg_click_count != null
                ? item.fg_click_count >= 1000
                  ? `${(item.fg_click_count / 1000).toFixed(1)}k`
                  : item.fg_click_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">클릭</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <Heart className="w-3 h-3 text-rose-400" />
            <span className="text-[10px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {item.fg_wishlist_count != null
                ? item.fg_wishlist_count >= 1000
                  ? `${(item.fg_wishlist_count / 1000).toFixed(1)}k`
                  : item.fg_wishlist_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">위시</span>
          </div>
        </div>

        {/* 메타데이터 태그 — AI 분석 결과 */}
        {(item.source_data?.gender ||
          (item.source_data?.body_type && item.source_data.body_type !== 'regular') ||
          (Array.isArray(item.source_data?.colors) && item.source_data.colors.length > 0) ||
          item.source_data?.is_set === true) && (
          <div className="flex flex-wrap gap-1">
            {item.source_data?.gender && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">
                {item.source_data.gender === 'women' ? '여성' : item.source_data.gender === 'men' ? '남성' : '유니섹스'}
              </span>
            )}
            {item.source_data?.body_type && item.source_data.body_type !== 'regular' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-600 border border-purple-200">
                {item.source_data.body_type === 'slim' ? '슬림' : item.source_data.body_type === 'plus' ? '플러스' : item.source_data.body_type}
              </span>
            )}
            {Array.isArray(item.source_data?.colors) && item.source_data.colors.slice(0, 3).map((color: string, idx: number) => (
              <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full border border-gray-300" style={{ backgroundColor: getColorHex(color) }} />
                {color}
              </span>
            ))}
            {item.source_data?.is_set === true && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200">세트상품</span>
            )}
          </div>
        )}

      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Filter Panel
// ─────────────────────────────────────────────────────────────
const TrendFilterPanel = ({
  filters,
  setFilters,
  checkboxes,
  setCheckboxes,
  onReset,
  onSearch,
}: {
  filters: FilterState;
  setFilters: (value: FilterState | ((prev: FilterState) => FilterState)) => void;
  checkboxes: CheckboxState;
  setCheckboxes: (value: CheckboxState | ((prev: CheckboxState) => CheckboxState)) => void;
  onReset: () => void;
  onSearch: () => void;
}) => {
  const [detailFilterOpen, setDetailFilterOpen] = useState(false);

  const rowCls = 'flex items-start gap-3 py-2 border-b border-border/50';
  const labelCls = 'text-xs font-medium text-muted-foreground min-w-[72px] pt-1 shrink-0';
  const cbCls = 'w-3.5 h-3.5 rounded accent-primary';

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
  ];

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

      {/* 행 0: 검색 (항상 노출) */}
      <div className="flex items-center gap-3 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground min-w-[72px] shrink-0">검색</span>
        <div className="flex-1">
          <input
            type="text"
            value={filters.keyword}
            onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
            placeholder="트렌드명 또는 키워드로 검색"
            className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* 행 1: 사이트 (항상 노출 · 체크박스 복수선택) */}
      <div className={rowCls}>
        <span className={labelCls}>사이트</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
          {platformOptions.map((opt) => (
            <label key={opt.key} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={filters.platforms.includes(opt.key)}
                onChange={() => toggleArr('platforms', opt.key)} className={cbCls} />
              <span className={cn('w-2 h-2 rounded-full shrink-0', PLATFORM_DOT_COLORS[opt.key] ?? 'bg-gray-400')} />
              <span className="text-xs text-foreground">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* 행 2: 수집기간 (항상 노출 · 세그먼트 그룹 버튼 + 날짜 직접 선택) */}
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

      {/* 상세 필터 영역 — 접기/펼치기 */}
      {detailFilterOpen && (
        <div className="border-t border-border/50 space-y-0">

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

          {/* 기타 상세 (OFF가 기본) */}
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

      {/* 하단 버튼 영역 — 상세검색 토글(왼쪽) + 필터초기화·검색(오른쪽) */}
      <div className="flex items-center justify-between pt-3">
        <button
          onClick={() => setDetailFilterOpen(!detailFilterOpen)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {detailFilterOpen
            ? <><span>상세검색 접기</span><ChevronUp className="w-3.5 h-3.5" /></>
            : <><span>상세검색 펼치기</span><ChevronDown className="w-3.5 h-3.5" /></>
          }
        </button>
        <div className="flex items-center gap-3">
          <button onClick={onReset}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            필터 초기화
          </button>
          <button onClick={onSearch}
            className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            검색
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

const MatchedProductSheetCard = ({ product }: { product: TrendMatchProduct }) => {
  const simPct = Math.round(product.similarity * 100);
  const simColor = simPct >= 80 ? 'text-emerald-600' : simPct >= 60 ? 'text-amber-500' : 'text-destructive';
  const simBg   = simPct >= 80 ? 'bg-emerald-100' : simPct >= 60 ? 'bg-amber-100' : 'bg-red-100';
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
      <div className="shrink-0 w-20 h-24 rounded-lg overflow-hidden bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Search className="w-5 h-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.product_name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Factory className="w-3 h-3" /> {product.factory_name}
        </p>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-bold', simColor)}>{simPct}%</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', simBg)} style={{ width: `${simPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {product.price != null && <span className="font-medium text-foreground">${product.price}</span>}
          {product.stock_quantity != null && <span>재고: {product.stock_quantity}</span>}
          {(product.category || product.fg_category) && (
            <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px]">
              {product.category || product.fg_category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const ImageTrendTab = () => {
  // ── Feed state ─────────────────────────────────────────────
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<TrendMatchResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

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
  };
  const [filters, setFilters] = useState<FilterState>({ ...defaultFilters });
  const [checkboxes, setCheckboxes] = useState<CheckboxState>({
    hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false,
  });
  const [sortBy, setSortBy] = useState('all');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // 검색 버튼 클릭 시 적용되는 필터
  const [appliedFilters, setAppliedFilters] = useState<FilterState>({ ...defaultFilters });
  const [appliedCheckboxes, setAppliedCheckboxes] = useState<CheckboxState>({
    hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false,
  });

  const handleSearch = () => {
    setAppliedFilters({ ...filters });
    setAppliedCheckboxes({ ...checkboxes });
  };

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
    };
    const resetCb: CheckboxState = { hasViews: false, deduplication: false, setOnly: false, mainImageOnly: false };
    setFilters(resetF);
    setCheckboxes(resetCb);
    setAppliedFilters(resetF);
    setAppliedCheckboxes(resetCb);
    setSortBy('all');
    setSortDirection('desc');
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

    // Cycle stage labels as visual feedback while server-side pipeline runs
    const stageTimer = setInterval(() => {
      setPipelineStage((prev) => {
        if (prev === 'collecting') return 'analyzing';
        if (prev === 'analyzing') return 'embedding';
        return prev; // stay at 'embedding' until response arrives
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

      // ── 기존 SNS/FashionGo 배치 파이프라인 ───────────────────
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
      const embedded  = data?.embedded  ?? 0;

      setPipelineStage('done');
      setPipelineInfo(`수집 ${collected}건 / 분석 ${analyzed}건 / 임베딩 ${embedded}건`);
      toast.success(`파이프라인 완료 · 수집 ${collected} / 분석 ${analyzed} / 임베딩 ${embedded}`);

      refetch();
      fetchKwStats({ rebuild: true });
      await fetchBatchHistory();

      setTimeout(() => {
        setPipelineStage('idle');
        setPipelineInfo('');
      }, 3_000);
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

  // ── Reset data ─────────────────────────────────────────────
  const handleResetData = async () => {
    if (!confirm('기존 트렌드 데이터를 모두 삭제합니다. 계속하시겠습니까?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }
      const { error } = await supabase.from('trend_analyses').delete().eq('user_id', userId);
      if (error) throw error;
      toast.success('데이터 초기화 완료');
      refetch();
      fetchKwStats({ rebuild: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '초기화에 실패했습니다.');
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

  const fetchMatches = useCallback(async (item: TrendFeedItem) => {
    setMatchLoading(true);
    setMatchResult(null);
    setMatchError(null);
    setNeedsAnalysis(false);

    try {
      const analysisId = await resolveTrendAnalysisId(item);
      const { data, error } = await supabase.functions.invoke('match-trend-to-products', {
        body: { trend_item_id: analysisId, match_count: 20, match_threshold: 0.3 },
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
        if (errStr.includes('embedding') || errStr.includes('analyze-trend') || errStr.includes('trend_item_id를 찾을 수 없습니다')) {
          setNeedsAnalysis(true);
          return;
        }
        throw new Error(errStr);
      }

      setMatchResult(data as TrendMatchResponse);
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
    await fetchMatches(item);
  }, [fetchMatches]);

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

  const isCollectDisabled = collecting || pipelineStage === 'done';

  // ── 클라이언트 사이드 필터 + 정렬 ─────────────────────────
  const FALLBACK_PLACEHOLDER = 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

  const processedItems = useMemo(() => {
    let items = [...liveFeedItems];

    // 이미지 없는 아이템 제외 (빈 값 + Unsplash 플레이스홀더)
    items = items.filter(item => item.image_url && item.image_url !== FALLBACK_PLACEHOLDER);

    // 키워드 검색 — 가장 먼저 실행
    if (appliedFilters.keyword && appliedFilters.keyword.trim()) {
      const query = appliedFilters.keyword.trim().toLowerCase();
      items = items.filter(item => {
        const nameMatch = (item.trend_name || '').toLowerCase().includes(query);
        const keywordMatch = (item.trend_keywords || []).some(
          (k: string) => k.toLowerCase().includes(query)
        );
        return nameMatch || keywordMatch;
      });
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
    // 성별 — 전체 선택이 아닐 때만 필터링
    if (appliedFilters.genders.length > 0 && appliedFilters.genders.length < allGenders.length) {
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

    // 정렬 (sortBy + sortDirection 즉시 반영 — 검색 버튼과 무관)
    if (sortBy !== 'all') {
      const dir = sortDirection === 'desc' ? 1 : -1;
      items.sort((a, b) => {
        switch (sortBy) {
          case 'latest':
            return (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * dir;
          case 'views': {
            const av = Number(a.source_data?.views || a.source_data?.view_count || a.source_data?.play_count || 0);
            const bv = Number(b.source_data?.views || b.source_data?.view_count || b.source_data?.play_count || 0);
            return (bv - av) * dir;
          }
          case 'wishes': {
            const aw = Number(a.source_data?.wishes || a.source_data?.like_count || 0);
            const bw = Number(b.source_data?.wishes || b.source_data?.like_count || 0);
            return (bw - aw) * dir;
          }
          default: return 0;
        }
      });
    }

    return items;
  }, [liveFeedItems, appliedFilters, appliedCheckboxes, sortBy, sortDirection]);

  const hasLiveFeed = !feedLoading && liveFeedItems.length > 0;

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* SNS 트렌드 피드 */}
      <div>
        {/* 액션 버튼 영역 */}
        <div className="flex justify-end gap-2 mb-4">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleResetData}>
            데이터 초기화
          </Button>

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
            {pipelineStage === 'collecting' && '수집 중...'}
            {pipelineStage === 'analyzing' && 'AI 분석 중...'}
            {pipelineStage === 'embedding' && '임베딩 생성 중...'}
            {pipelineStage === 'done'      && `완료! ${pipelineInfo}`}
            {pipelineStage === 'idle'      && '트렌드 수집하기'}
          </Button>
        </div>

        {/* Filter panel */}
        <TrendFilterPanel
          filters={filters}
          setFilters={setFilters}
          checkboxes={checkboxes}
          setCheckboxes={setCheckboxes}
          onReset={resetFilters}
          onSearch={handleSearch}
        />

        {/* 정렬 바 */}
        <div className="flex items-center gap-4 mt-4 mb-4 py-2">
          <span className="text-[11px] text-muted-foreground">{processedItems.length}건</span>
          {[
            { key: 'all',    label: '전체' },
            { key: 'latest', label: '수집기간' },
            { key: 'views',  label: '조회수' },
            { key: 'wishes', label: '위시순' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                if (opt.key === 'all') { setSortBy('all'); setSortDirection('desc'); }
                else if (sortBy === opt.key) { setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc'); }
                else { setSortBy(opt.key); setSortDirection('desc'); }
              }}
              className={cn(
                'text-xs pb-1 transition-colors border-b-2 flex items-center gap-0.5',
                sortBy === opt.key
                  ? 'text-red-500 font-medium border-red-500'
                  : 'text-muted-foreground border-transparent hover:text-foreground'
              )}
            >
              {opt.label}
              {sortBy === opt.key && opt.key !== 'all' && (
                <span className="text-[10px]">{sortDirection === 'desc' ? '▼' : '▲'}</span>
              )}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {feedLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <TrendCardSkeleton key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!feedLoading && liveFeedItems.length === 0 && (
          <div className="text-center py-12 space-y-3 border border-dashed border-border rounded-xl">
            <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">트렌드를 수집 중입니다...</p>
            <p className="text-xs text-muted-foreground">"지금 수집" 버튼을 누르거나 자동 스케줄을 기다려주세요.</p>
          </div>
        )}

        {/* Live feed cards */}
        {hasLiveFeed && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {processedItems.map(item => (
              item.platform === 'fashiongo' ? (
                item.image_url ? (
                  <FashionGoTrendCard
                    key={item.id}
                    item={item}
                    selected={selectedLiveItem?.id === item.id}
                    onClick={() => handleSelectLiveItem(item)}
                  />
                ) : null
              ) : (
                <LiveTrendCard
                  key={item.id}
                  item={item}
                  selected={selectedLiveItem?.id === item.id}
                  onClick={() => handleSelectLiveItem(item)}
                  keywordStatsMap={keywordStatsMap}
                />
              )
            ))}
          </div>
        )}
      </div>

      {/* ── Sheet Panel ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 flex flex-col">
          {selectedLiveItem && (
            <>
              <SheetHeader className="border-b border-border">
                {/* 텍스트 영역 */}
                <div className="px-5 pt-5 pb-3 space-y-1.5">
                  {/* 플랫폼 출처 */}
                  <span className="block text-[11px] text-muted-foreground font-medium leading-none">
                    {getPlatformBadge(selectedLiveItem.platform).label}
                  </span>
                  <SheetTitle className="text-base leading-snug">{selectedLiveItem.trend_name}</SheetTitle>
                  <SheetDescription className="sr-only">매칭 공장 상품 패널</SheetDescription>
                  {/* AI 배지 */}
                  {selectedLiveItem.ai_analyzed && (
                    <div className="flex items-center gap-2">
                      <ScoreBadge score={selectedLiveItem.trend_score} size="sm" />
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                        AI 분석완료
                      </span>
                    </div>
                  )}
                  {/* 키워드 태그 */}
                  <div className="flex gap-1 flex-wrap pt-0.5">
                    {(selectedLiveItem.ai_keywords?.length
                      ? selectedLiveItem.ai_keywords.map(k => k.keyword)
                      : (selectedLiveItem.search_hashtags?.length ? selectedLiveItem.search_hashtags : BOUTIQUE_HASHTAGS.slice(0, 4))
                    ).slice(0, 6).map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
                    ))}
                  </div>
                </div>
                {/* 전체 너비 이미지 */}
                {selectedLiveItem.image_url && (
                  <div className="w-full aspect-[16/9] overflow-hidden bg-muted">
                    <img
                      src={selectedLiveItem.image_url}
                      alt={selectedLiveItem.trend_name}
                      className="w-full h-full object-cover"
                      style={{ objectPosition: 'center 30%' }}
                    />
                  </div>
                )}
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {/* AI 분석 메타데이터 섹션 */}
                {selectedLiveItem && (
                  selectedLiveItem.source_data?.gender ||
                  selectedLiveItem.source_data?.body_type ||
                  (Array.isArray(selectedLiveItem.source_data?.colors) && selectedLiveItem.source_data.colors.length > 0) ||
                  selectedLiveItem.source_data?.is_set !== undefined
                ) && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <p className="text-[11px] font-semibold text-muted-foreground">AI 분석 정보</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      {selectedLiveItem!.source_data?.gender && (
                        <div>
                          <p className="text-[10px] text-muted-foreground">성별</p>
                          <p className="text-xs font-medium">
                            {selectedLiveItem!.source_data.gender === 'women' ? '여성'
                              : selectedLiveItem!.source_data.gender === 'men' ? '남성' : '유니섹스'}
                          </p>
                        </div>
                      )}
                      {selectedLiveItem!.source_data?.body_type && (
                        <div>
                          <p className="text-[10px] text-muted-foreground">체형</p>
                          <p className="text-xs font-medium">
                            {selectedLiveItem!.source_data.body_type === 'slim' ? '슬림'
                              : selectedLiveItem!.source_data.body_type === 'regular' ? '레귤러' : '플러스'}
                          </p>
                        </div>
                      )}
                      {Array.isArray(selectedLiveItem!.source_data?.colors) && selectedLiveItem!.source_data.colors.length > 0 && (
                        <div className="col-span-2">
                          <p className="text-[10px] text-muted-foreground mb-1">색상</p>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedLiveItem!.source_data.colors.map((color: string, idx: number) => (
                              <span key={idx} className="text-[11px] flex items-center gap-1">
                                <span className="w-3 h-3 rounded-full border border-gray-200 shrink-0"
                                  style={{ backgroundColor: getColorHex(color) }} />
                                {color}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedLiveItem!.source_data?.is_set !== undefined && (
                        <div>
                          <p className="text-[10px] text-muted-foreground">세트상품</p>
                          <p className="text-xs font-medium">{selectedLiveItem!.source_data.is_set ? '예' : '아니오'}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Factory className="w-4 h-4 text-primary" /> 매칭 공장 상품
                  </h4>
                  {matchResult && <span className="text-xs text-muted-foreground">{matchResult.total_matches}건</span>}
                </div>

                {matchLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                        <Skeleton className="w-20 h-24 rounded-lg" />
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

                {!matchLoading && !matchError && matchResult && matchResult.matches.length === 0 && (
                  <div className="text-center py-8 space-y-2 border border-dashed border-border rounded-lg">
                    <Search className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">아직 매칭된 공장 상품이 없습니다.</p>
                    <p className="text-xs text-muted-foreground">공장 상품 임베딩을 먼저 실행해주세요.</p>
                  </div>
                )}

                {!matchLoading && matchResult && matchResult.matches.length > 0 && (
                  <div className="space-y-2">
                    {matchResult.matches.map(p => <MatchedProductSheetCard key={p.id} product={p} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ImageTrendTab;
