import { useState, useMemo, useEffect, useCallback } from 'react';
import TrendKeywordRanking from '@/components/trend/TrendKeywordRanking';
import { useTrendKeywordStats, type KeywordStat } from '@/hooks/useTrendKeywordStats';

import { useSnsTrendFeed, type TrendFeedItem } from '@/hooks/useSnsTrendFeed';
import { Search, TrendingUp, ExternalLink, Loader2, Bot, RefreshCw, Trash2, Factory, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import ScoreBadge from '@/components/ScoreBadge';

/* ── Fixed boutique hashtags (fallback) ── */
const BOUTIQUE_HASHTAGS = [
  '#WomensBoutique', '#OnlineBoutique', '#BoutiqueLife', '#ShopSmall',
  '#SupportSmallBusiness', '#WomensOOTD', '#NewArrivals', '#BoutiqueFinds',
  '#FashionForWomen', '#StyleInspo', '#WomensClothing', '#BoutiqueStyle',
];

/* ── Platform badge config ── */
const PLATFORM_BADGE: Record<string, { label: string; bg: string }> = {
  instagram: { label: 'IG', bg: 'rgba(0,0,0,0.6)' },
  tiktok: { label: 'TT', bg: 'rgba(0,0,0,0.6)' },
  magazine: { label: '매거진', bg: 'rgba(0,0,0,0.6)' },
  google: { label: 'Google', bg: '#4285F4' },
  amazon: { label: 'Amazon', bg: '#FF9900' },
  pinterest: { label: 'Pinterest', bg: '#E60023' },
};

/* ── Keyword Growth Badge ── */
const KeywordGrowthBadge = ({ stat }: { stat: KeywordStat }) => {
  const growth = stat.growth_7d;
  if (growth === null) return null;

  const isUp = growth > 0;
  const isDown = growth < 0;

  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      isUp   && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
      isDown && 'bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-300',
      !isUp && !isDown && 'bg-secondary text-secondary-foreground'
    )}>
      {isUp ? '↑' : isDown ? '↓' : '→'} {stat.keyword} {growth !== 0 ? `${growth > 0 ? '+' : ''}${growth}%` : ''}
    </span>
  );
};

/* ── Live SNS Feed Card ── */
const LiveTrendCard = ({ item, selected, onClick, keywordStatsMap }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
  keywordStatsMap: Map<string, KeywordStat>;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const badge = PLATFORM_BADGE[item.platform] || { label: item.magazine_name || item.platform, bg: 'rgba(0,0,0,0.6)' };
  const platformLabel = item.platform === 'magazine' ? (item.magazine_name || '매거진') : badge.label;
  const metric = item.platform === 'tiktok' ? `▶ ${(item.view_count || 0).toLocaleString()}` : `❤ ${(item.like_count || 0).toLocaleString()}`;

  const matchedStats = useMemo(() => {
    if (!keywordStatsMap.size) return [];
    return item.trend_keywords
      .map(k => keywordStatsMap.get(k.toLowerCase()))
      .filter((s): s is KeywordStat => !!s)
      .sort((a, b) => (b.total_7d) - (a.total_7d))
      .slice(0, 2);
  }, [item.trend_keywords, keywordStatsMap]);

  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 w-[220px] rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-border"
      )}
    >
      {/* Image */}
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
            className={cn("w-full h-full object-cover transition-transform duration-300 group-hover:scale-105", !loaded && "opacity-0")}
            style={{ objectPosition: 'center 70%' }}
          />
        )}
        {/* Score badge — 변경3: ai_analyzed 여부에 따른 동적 점수 */}
        {loaded && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-md text-white"
            style={{
              background: item.ai_analyzed
                ? (item.trend_score >= 80 ? 'hsl(var(--chart-2))' : item.trend_score >= 60 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))')
                : 'hsl(var(--muted-foreground))'
            }}
          >
            {item.ai_analyzed ? `${item.trend_score}점` : '-'}
          </span>
        )}
        {/* Selected indicator */}
        {selected && loaded && (
          <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-bold">
            ✓ 선택됨
          </span>
        )}
        {/* Engagement badge */}
        {loaded && (
          <span className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-md text-white backdrop-blur-sm" style={{ background: badge.bg }}>
            {platformLabel} · {metric}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm text-foreground truncate">🔥 {item.trend_name}</p>
        {item.author && <p className="text-[11px] text-muted-foreground">📱 @{item.author.replace(/^@/, '')}</p>}
        {item.summary_ko && <p className="text-[11px] text-muted-foreground line-clamp-2">{item.summary_ko}</p>}

        {/* 변경2: 조건부 AI 분석 뱃지 */}
        {item.ai_analyzed ? (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Bot className="w-3 h-3" /> AI 분석완료 · {item.trend_score}점
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            GPT 미연동 - 기본 수집
          </span>
        )}

        <div className="flex gap-1 flex-wrap">
          {(item.search_hashtags?.length ? item.search_hashtags : BOUTIQUE_HASHTAGS.slice(0, 3)).map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
          ))}
        </div>
        {matchedStats.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {matchedStats.map(stat => (
              <KeywordGrowthBadge key={stat.keyword} stat={stat} />
            ))}
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

/* ── Platform filter tabs ── */
const PLATFORM_TABS: { value: 'all' | 'instagram' | 'tiktok' | 'magazine' | 'google' | 'amazon' | 'pinterest'; label: string; icon: string }[] = [
  { value: 'all', label: '전체', icon: '🌐' },
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'magazine', label: '매거진', icon: '📰' },
  { value: 'google', label: 'Google', icon: '🔍' },
  { value: 'amazon', label: 'Amazon', icon: '🛒' },
  { value: 'pinterest', label: 'Pinterest', icon: '📌' },
];

/* ── Skeleton cards for loading ── */
const TrendCardSkeleton = () => (
  <div className="shrink-0 w-[220px] rounded-xl border border-border bg-card overflow-hidden">
    <Skeleton className="aspect-[3/4] w-full rounded-none" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  </div>
);

/* ── Match result types ── */
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

/* ── Matched Product Card in Sheet ── */
const MatchedProductSheetCard = ({ product }: { product: TrendMatchProduct }) => {
  const simPct = Math.round(product.similarity * 100);
  const simColor = simPct >= 80 ? 'text-emerald-600' : simPct >= 60 ? 'text-amber-500' : 'text-destructive';
  const simBg = simPct >= 80 ? 'bg-emerald-100 dark:bg-emerald-900/30' : simPct >= 60 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30';

  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
      {/* Image */}
      <div className="shrink-0 w-20 h-24 rounded-lg overflow-hidden bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Search className="w-5 h-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.product_name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Factory className="w-3 h-3" /> {product.factory_name}
        </p>
        <div className="flex items-center gap-2">
          <span className={cn("text-sm font-bold", simColor)}>
            {simPct}%
          </span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", simBg)}
              style={{ width: `${simPct}%` }}
            />
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

/* ── Main ImageTrendTab ── */
const ImageTrendTab = () => {
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<TrendMatchResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);

  // Supabase live feed
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'tiktok' | 'magazine' | 'google' | 'amazon' | 'pinterest'>('all');
  const { items: liveFeedItems, loading: feedLoading, refetch } = useSnsTrendFeed(platformFilter);

  // 키워드 통계 (카드 뱃지용)
  const { data: kwStatsData, fetch: fetchKwStats } = useTrendKeywordStats();
  useEffect(() => { fetchKwStats(); }, [fetchKwStats]);
  const keywordStatsMap = useMemo(() => {
    const m = new Map<string, KeywordStat>();
    for (const kw of kwStatsData?.keywords ?? []) {
      m.set(kw.keyword.toLowerCase(), kw);
    }
    return m;
  }, [kwStatsData]);

  // Reset data
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
    } catch (e: any) {
      toast.error(e.message || '초기화에 실패했습니다.');
    }
  };

  // Collect now — 3-stage pipeline
  const [collecting, setCollecting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'collecting' | 'analyzing' | 'embedding' | 'done'>('idle');
  const [pipelineInfo, setPipelineInfo] = useState('');

  const handleCollectNow = async () => {
    setCollecting(true);
    setPipelineStage('collecting');
    setPipelineInfo('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        toast.error('로그인이 필요합니다.');
        setCollecting(false);
        setPipelineStage('idle');
        return;
      }

      // ── Stage 1: Collect ──
      const [snsResult, magResult, googleResult, amazonResult, pinterestResult] = await Promise.allSettled([
        supabase.functions.invoke('collect-sns-trends', { body: { source: 'all', limit: 20, user_id: userId } }),
        supabase.functions.invoke('collect-magazine-trends', { body: { user_id: userId } }),
        supabase.functions.invoke('collect-google-image-trends', { body: { user_id: userId, limit: 20 } }),
        supabase.functions.invoke('collect-amazon-image-trends', { body: { user_id: userId, limit: 20 } }),
        supabase.functions.invoke('collect-pinterest-image-trends', { body: { user_id: userId, limit: 20 } }),
      ]);
      const getCount = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value.data?.saved ?? r.value.data?.inserted ?? 0) : 0;
      const totalCollected = getCount(snsResult) + getCount(magResult) + getCount(googleResult) + getCount(amazonResult) + getCount(pinterestResult);

      // ── Stage 2: AI Analyze ──
      setPipelineStage('analyzing');
      setPipelineInfo(`${totalCollected}건 분석 중`);

      let analyzedCount = 0;
      try {
        const { data: analyzeData, error: analyzeErr } = await supabase.functions.invoke('analyze-trend', { body: { batch: true } });
        if (analyzeErr) throw analyzeErr;
        if (analyzeData?.error) throw new Error(analyzeData.error);
        analyzedCount = analyzeData?.processed ?? analyzeData?.analyzed ?? 0;
      } catch (e: any) {
        toast.error(`AI 분석 실패: ${e.message || '알 수 없는 오류'}`);
        toast.info(`수집 ${totalCollected}건은 정상 저장되었습니다.`);
        refetch();
        fetchKwStats({ rebuild: true });
        return;
      }

      // ── Stage 3: Generate Embeddings ──
      setPipelineStage('embedding');
      setPipelineInfo(`임베딩 생성 중`);

      let embeddedCount = 0;
      try {
        const { data: embedData, error: embedErr } = await supabase.functions.invoke('generate-embedding', { body: { batch: true, table: 'trend_analyses' } });
        if (embedErr) throw embedErr;
        if (embedData?.error) throw new Error(embedData.error);
        embeddedCount = embedData?.processed ?? 0;
      } catch (e: any) {
        toast.error(`임베딩 생성 실패: ${e.message || '알 수 없는 오류'}`);
        toast.info(`수집 ${totalCollected}건 / 분석 ${analyzedCount}건은 정상 완료되었습니다.`);
        refetch();
        fetchKwStats({ rebuild: true });
        return;
      }

      // ── Done ──
      setPipelineStage('done');
      setPipelineInfo(`수집 ${totalCollected}건 / 분석 ${analyzedCount}건 / 임베딩 ${embeddedCount}건`);
      toast.success(`파이프라인 완료 · 수집 ${totalCollected} / 분석 ${analyzedCount} / 임베딩 ${embeddedCount}`);
      refetch();
      fetchKwStats({ rebuild: true });

      setTimeout(() => {
        setPipelineStage('idle');
        setPipelineInfo('');
      }, 3000);
    } catch (e: any) {
      toast.error(e.message || '트렌드 수집에 실패했습니다.');
    } finally {
      if (pipelineStage !== 'done') {
        setPipelineStage('idle');
        setPipelineInfo('');
      }
      setCollecting(false);
    }
  };

  // Handle card click → open sheet + call match-trend-to-products
  const handleSelectLiveItem = useCallback(async (item: TrendFeedItem) => {
    setSelectedLiveItem(item);
    setSheetOpen(true);
    setMatchLoading(true);
    setMatchResult(null);
    setMatchError(null);

    try {
      const { data, error } = await supabase.functions.invoke('match-trend-to-products', {
        body: { trend_item_id: item.id, match_count: 20, match_threshold: 0.3 },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setMatchResult(data as TrendMatchResponse);
    } catch (e: any) {
      const msg = e.message || '매칭 실패';
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
    }
  }, []);

  const hasLiveFeed = !feedLoading && liveFeedItems.length > 0;

  return (
    <div className="space-y-5">

      {/* ① 트렌드 키워드 랭킹 */}
      <TrendKeywordRanking />

      {/* ② SNS Trend Feed from Supabase */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> SNS 트렌드 피드
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleResetData}>
              <Trash2 className="w-3.5 h-3.5" /> 🗑️ 데이터 초기화
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={collecting} onClick={handleCollectNow}>
              {collecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              {collecting ? '수집 중...' : '지금 수집'}
            </Button>
          </div>
        </div>

        {/* Platform filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PLATFORM_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setPlatformFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                platformFilter === tab.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {feedLoading && (
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-3">
              {Array.from({ length: 5 }).map((_, i) => <TrendCardSkeleton key={i} />)}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Empty state */}
        {!feedLoading && liveFeedItems.length === 0 && (
          <div className="text-center py-12 space-y-3 border border-dashed border-border rounded-xl">
            <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">트렌드를 수집 중입니다...</p>
            <p className="text-xs text-muted-foreground">collect-sns-trends 또는 collect-magazine-trends 함수를 실행하면 여기에 표시됩니다.</p>
          </div>
        )}

        {/* Live feed cards */}
        {hasLiveFeed && (
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-3">
              {liveFeedItems.map(item => (
                <LiveTrendCard
                  key={item.id}
                  item={item}
                  selected={selectedLiveItem?.id === item.id}
                  onClick={() => handleSelectLiveItem(item)}
                  keywordStatsMap={keywordStatsMap}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}
      </div>

      {/* Empty state when nothing selected */}
      {!selectedLiveItem && (
        <div className="text-center py-16 space-y-3">
          <Search className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">트렌드 이미지를 선택하면 매칭 공장 상품을 추천합니다.</p>
        </div>
      )}

      {/* ── Sheet Panel (변경1) ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
          {selectedLiveItem && (
            <>
              {/* Header: trend image + info */}
              <SheetHeader className="p-5 pb-3 space-y-3 border-b border-border">
                <div className="flex gap-3">
                  <div className="shrink-0 w-24 h-32 rounded-lg overflow-hidden border border-border">
                    <img
                      src={selectedLiveItem.image_url}
                      alt={selectedLiveItem.trend_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <SheetTitle className="text-base truncate">🔥 {selectedLiveItem.trend_name}</SheetTitle>
                    <SheetDescription className="sr-only">매칭 공장 상품 패널</SheetDescription>
                    <div className="flex items-center gap-2">
                      {selectedLiveItem.ai_analyzed ? (
                        <ScoreBadge score={selectedLiveItem.trend_score} size="sm" />
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                      {selectedLiveItem.ai_analyzed && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium">
                          AI 분석완료
                        </span>
                      )}
                    </div>
                    {/* AI keywords chips */}
                    <div className="flex gap-1 flex-wrap">
                      {(selectedLiveItem.ai_keywords?.length
                        ? selectedLiveItem.ai_keywords.map(k => k.keyword)
                        : (selectedLiveItem.search_hashtags?.length ? selectedLiveItem.search_hashtags : BOUTIQUE_HASHTAGS.slice(0, 4))
                      ).slice(0, 6).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              {/* Match results area */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Factory className="w-4 h-4 text-primary" /> 매칭 공장 상품
                  </h4>
                  {matchResult && (
                    <span className="text-xs text-muted-foreground">{matchResult.total_matches}건</span>
                  )}
                </div>

                {/* Loading */}
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

                {/* Error */}
                {!matchLoading && matchError && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm text-destructive font-medium">⚠️ {matchError}</p>
                  </div>
                )}

                {/* Empty */}
                {!matchLoading && !matchError && matchResult && matchResult.matches.length === 0 && (
                  <div className="text-center py-8 space-y-2 border border-dashed border-border rounded-lg">
                    <Search className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">아직 매칭된 공장 상품이 없습니다.</p>
                    <p className="text-xs text-muted-foreground">공장 상품 임베딩을 먼저 실행해주세요.</p>
                  </div>
                )}

                {/* Results */}
                {!matchLoading && matchResult && matchResult.matches.length > 0 && (
                  <div className="space-y-2">
                    {matchResult.matches.map(p => (
                      <MatchedProductSheetCard key={p.id} product={p} />
                    ))}
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
