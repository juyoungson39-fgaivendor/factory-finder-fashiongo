import { useState } from 'react';
import { SOURCING_PRODUCT_POOL } from '@/data/sourcingProductPool';
import { useTrend } from '@/contexts/TrendContext';
import { useInstagramTrends } from '@/hooks/use-instagram-trends';
import { useAIMatching } from '@/hooks/useAIMatching';
import { useSnsTrendFeed, type TrendFeedItem } from '@/hooks/useSnsTrendFeed';
import type { AIMatchedProduct } from '@/types/matching';
import { Star, Plus, Check, Search, TrendingUp, AlertTriangle, ExternalLink, Instagram, Loader2, CheckCircle2, Bot, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const scoreColor = (v: number) => v >= 80 ? 'hsl(var(--chart-2))' : v >= 60 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))';


/* ── Image with loading state ── */
const TrendImage = ({ src, alt, className, badge, onClick }: { src: string; alt: string; className?: string; badge?: React.ReactNode; onClick?: () => void }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)} onClick={onClick}>
        <span className="text-4xl">📷</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden group", className, onClick && "cursor-pointer")} onClick={onClick}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "w-full h-full object-cover transition-transform duration-300 group-hover:scale-105",
          !loaded && "opacity-0"
        )}
      />
      {badge && loaded && badge}
    </div>
  );
};

/* ── Engagement overlay badge ── */
const EngagementBadge = ({ source, engagement }: { source: string; engagement: string }) => {
  const icon = source === 'TikTok' ? 'TT' : 'IG';
  const metric = source === 'TikTok' ? '▶' : '❤';
  return (
    <span className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-md text-white backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }}>
      {icon} · {engagement} {metric}
    </span>
  );
};

/* ── Fallback badge ── */
const FallbackBadge = () => (
  <span className="absolute bottom-2 right-2 text-[9px] px-1.5 py-0.5 rounded text-white" style={{ background: 'rgba(0,0,0,0.5)' }}>
    샘플 이미지
  </span>
);

/* ── Article links section ── */
const ArticleLinks = ({ articles }: { articles: { url: string; publisher: string }[] }) => {
  const [expanded, setExpanded] = useState(false);
  const maxVisible = 2;
  const hasMore = articles.length > maxVisible;
  const visible = expanded ? articles : articles.slice(0, maxVisible);

  return (
    <div className="space-y-1 pt-1">
      <p className="text-[10px] text-muted-foreground font-medium">📰 기사 출처:</p>
      {visible.map((a, i) => (
        <a
          key={i}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary hover:underline transition-colors"
        >
          • {a.publisher} ↗
        </a>
      ))}
      {hasMore && !expanded && (
        <button
          onClick={e => { e.stopPropagation(); setExpanded(true); }}
          className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 transition-colors"
        >
          <ChevronDown className="w-3 h-3" /> +{articles.length - maxVisible} 더보기
        </button>
      )}
    </div>
  );
};

/* ── API Status Banner ── */
const ApiStatusBanner = ({ source, onFetch, loading }: { source: string; onFetch: () => void; loading: boolean }) => {
  if (source === 'instagram_api') {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        <span>Instagram API 연동 완료 — 실시간 트렌드 이미지를 표시 중입니다.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
      <span>패션 기사 OG 이미지로 표시 중입니다. 실패 시 샘플 이미지로 전환됩니다.</span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-7 text-xs gap-1.5"
        onClick={onFetch}
        disabled={loading}
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Instagram className="w-3 h-3" />}
        {loading ? '가져오는 중...' : 'Instagram 실시간 트렌드 가져오기'}
      </Button>
    </div>
  );
};

/* ── AI Loading State ── */
const AILoadingPanel = ({ progress }: { progress: { current: number; total: number } }) => (
  <div className="flex flex-col items-center justify-center py-16 space-y-4">
    <div className="relative">
      <Bot className="w-12 h-12 text-primary animate-pulse" />
    </div>
    <p className="text-sm font-semibold text-foreground">🤖 AI 이미지 분석 중...</p>
    <div className="w-64 space-y-2">
      <Progress value={(progress.current / Math.max(progress.total, 1)) * 100} className="h-2.5 [&>div]:bg-gradient-to-r [&>div]:from-violet-500 [&>div]:to-indigo-500" />
      <p className="text-xs text-muted-foreground text-center">
        상품 {progress.current}/{progress.total} 분석 중
      </p>
    </div>
    <p className="text-xs text-muted-foreground text-center">
      CLIP 모델이 트렌드 이미지와<br />소싱 상품 이미지를 비교하고 있습니다
    </p>
  </div>
);

/* ── AI Result Header ── */
const AIResultHeader = ({ isAI, elapsedMs, totalPool, error }: { isAI: boolean; elapsedMs: number; totalPool: number; error?: string | null }) => {
  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
        <p className="text-sm font-semibold text-destructive">⚠️ AI 분석 오류</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <p className="text-xs text-muted-foreground">Mock 데이터로 대체하여 표시합니다.</p>
      </div>
    );
  }

  if (!isAI) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3 space-y-1">
        <p className="text-sm font-semibold text-foreground">🎯 유사 상품 매칭 (Mock 데이터)</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          ⚠️ AI 분석을 사용하려면 Hugging Face API 토큰을 환경 변수(HUGGINGFACE_API_TOKEN)에 설정하세요
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Bot className="w-4 h-4 text-primary" /> AI 이미지 분석 결과
        </p>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-medium">
          Powered by CLIP
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {totalPool}개 소싱 상품 중 유사도 상위 6개를 선별했습니다 · 분석 소요 시간: {(elapsedMs / 1000).toFixed(1)}초
      </p>
    </div>
  );
};

/* ── AI Matched Product Card ── */
const AIMatchedProductCard = ({ product }: { product: AIMatchedProduct }) => {
  const { toggleRegistration, registrationList } = useTrend();
  const isAdded = registrationList.includes(product.id);
  const simColor = scoreColor(product.similarity);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <TrendImage
          src={product.image}
          alt={product.name}
          className="h-[180px]"
          badge={
            product.matchedByAI ? (
              <span className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded bg-violet-600 text-white flex items-center gap-0.5">
                <Bot className="w-3 h-3" /> AI
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="p-3 space-y-2.5">
        {/* AI Similarity score */}
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xl font-bold" style={{ color: simColor }}>
            <Bot className="w-4 h-4" /> {product.similarity}%
          </span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${product.similarity}%`, backgroundColor: simColor }} />
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-sm text-foreground">{product.name}</h4>
          <p className="text-[11px] text-muted-foreground">{product.name_cn}</p>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span>{product.price_range}</span>
          <span className="text-muted-foreground">MOQ: {product.moq}</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium text-foreground">{product.supplier_rating}</span>
          <span>· {product.supplier}</span>
        </div>

        <div className="flex gap-1 flex-wrap">
          {product.tags.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">#{t}</span>
          ))}
        </div>

        <Button
          onClick={() => toggleRegistration(product.id)}
          className={cn("w-full text-xs h-9", isAdded && "bg-green-600 hover:bg-green-700")}
        >
          {isAdded ? <><Check className="w-3.5 h-3.5" /> 등록 후보 추가됨</> : <><Plus className="w-3.5 h-3.5" /> 패션고 등록 후보 추가</>}
        </Button>
      </div>
    </div>
  );
};

/* ── Live SNS Feed Card (Supabase) ── */
const LiveTrendCard = ({ item, selected, onClick }: { item: TrendFeedItem; selected: boolean; onClick: () => void }) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const platformLabel = item.platform === 'instagram' ? 'IG' : item.platform === 'tiktok' ? 'TT' : item.magazine_name || '매거진';
  const metric = item.platform === 'tiktok' ? `▶ ${(item.view_count || 0).toLocaleString()}` : `❤ ${(item.like_count || 0).toLocaleString()}`;

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
        {/* Score badge */}
        {item.trend_score > 0 && loaded && (
          <span
            className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-md text-white"
            style={{ background: item.trend_score >= 80 ? 'hsl(var(--chart-2))' : item.trend_score >= 60 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))' }}
          >
            {item.trend_score}점
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
          <span className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-md text-white backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.6)' }}>
            {platformLabel} · {metric}
          </span>
        )}
      </div>
      {/* Info */}
      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm text-foreground truncate">🔥 {item.trend_name}</p>
        {item.author && <p className="text-[11px] text-muted-foreground">📱 @{item.author.replace(/^@/, '')}</p>}
        {item.summary_ko && <p className="text-[11px] text-muted-foreground line-clamp-2">{item.summary_ko}</p>}
        <div className="flex gap-1 flex-wrap">
          {item.trend_keywords.slice(0, 3).map(k => (
            <span key={k} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">#{k}</span>
          ))}
        </div>
        {/* 원본 보기 button */}
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
const PLATFORM_TABS: { value: 'all' | 'instagram' | 'tiktok' | 'magazine'; label: string; icon: string }[] = [
  { value: 'all', label: '전체', icon: '🌐' },
  { value: 'instagram', label: 'Instagram', icon: '📸' },
  { value: 'tiktok', label: 'TikTok', icon: '🎵' },
  { value: 'magazine', label: '매거진', icon: '📰' },
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

/* ── Main ImageTrendTab ── */
const ImageTrendTab = () => {
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sortBy, setSortBy] = useState('similarity');
  const [minSimilarity, setMinSimilarity] = useState(30);
  const { fetchTrends, loading: igLoading } = useInstagramTrends();
  const [liveSource, setLiveSource] = useState<string>('mock');
  const { matchedProducts: aiProducts, isMatching, matchError, progress, elapsedMs, runMatching } = useAIMatching();
  const [useAIMode, setUseAIMode] = useState(false);

  // Supabase live feed — default to Instagram
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'tiktok' | 'magazine'>('instagram');
  const { items: liveFeedItems, loading: feedLoading, refetch } = useSnsTrendFeed(platformFilter);

  // Collect now
  const [collecting, setCollecting] = useState(false);
  const handleCollectNow = async () => {
    setCollecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) {
        toast.error('로그인이 필요합니다.');
        setCollecting(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke('collect-sns-trends', {
        body: { source: 'all', limit: 20, user_id: userId },
      });
      if (error) throw error;
      const saved = data?.saved ?? data?.inserted ?? 0;
      toast.success(`수집 완료 · ${saved}개 저장됨`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || '트렌드 수집에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };

  const handleFetchLive = async () => {
    const result = await fetchTrends({
      hashtags: ['streetstyle', 'ootd', 'fashiontrend', 'celebritystyle', 'streetfashion'],
      limit: 20,
    });
    if (result?.source) {
      setLiveSource(result.source);
    }
  };

  // Handle live feed card selection
  const handleSelectLiveItem = async (item: TrendFeedItem) => {
    if (selectedLiveItem?.id === item.id) {
      setSelectedLiveItem(null);
      return;
    }
    setSelectedLiveItem(item);

    try {
      setUseAIMode(true);
      await runMatching(item.image_url, SOURCING_PRODUCT_POOL);
    } catch {
      setUseAIMode(false);
      setFallbackProducts([]);
    }
  };

  const filteredAIProducts = (useAIMode && aiProducts.length > 0 ? aiProducts : [])
    .filter(p => p.similarity >= minSimilarity)
    .sort((a, b) => {
      if (sortBy === 'price') return (a.moq) - (b.moq);
      return b.similarity - a.similarity;
    });

  // Use live feed if available, otherwise fall back to mock
  const hasLiveFeed = !feedLoading && liveFeedItems.length > 0;

  return (
    <div className="space-y-5">
      <ApiStatusBanner source={liveSource} onFetch={handleFetchLive} loading={igLoading} />

      {/* ① SNS Trend Feed from Supabase */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> SNS 트렌드 피드
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5"
            disabled={collecting}
            onClick={handleCollectNow}
          >
            {collecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {collecting ? '수집 중...' : '지금 수집'}
          </Button>
        </div>

        {/* Platform filter tabs */}
        <div className="flex gap-1.5 mb-3">
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
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Live feed — selected item product recommendations */}
        {selectedLiveItem && (
          <div className="mt-4 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={selectedLiveItem.image_url} alt={selectedLiveItem.trend_name} className="w-12 h-16 rounded-lg object-cover border border-border" />
                <div>
                  <p className="text-sm font-semibold text-foreground">🔥 {selectedLiveItem.trend_name}</p>
                  <div className="flex gap-1 mt-1">
                    {selectedLiveItem.trend_keywords.slice(0, 4).map(k => (
                      <span key={k} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">#{k}</span>
                    ))}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedLiveItem(null)}>✕ 닫기</Button>
            </div>

            {/* AI Result Header */}
            <AIResultHeader
              isAI={useAIMode && !matchError}
              elapsedMs={elapsedMs}
              totalPool={SOURCING_PRODUCT_POOL.length}
              error={matchError}
            />

            {isMatching ? (
              <AILoadingPanel progress={progress} />
            ) : (
              <>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="w-40">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">정렬</label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="similarity">유사도순</SelectItem>
                        <SelectItem value="price">MOQ순</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-52">
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">최소 유사도: {minSimilarity}%</label>
                    <Slider value={[minSimilarity]} onValueChange={v => setMinSimilarity(v[0])} min={0} max={100} step={5} />
                  </div>
                </div>

                {filteredAIProducts.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredAIProducts.map(p => (
                      <AIMatchedProductCard key={p.id} product={p} />
                    ))}
                  </div>
                )}

                {filteredAIProducts.length === 0 && !isMatching && (
                  <div className="text-center py-8 text-muted-foreground text-sm">조건에 맞는 매칭 상품이 없습니다.</div>
                )}
              </>
            )}
          </div>
        )}

      </div>

      {/* Empty state when nothing selected */}
      {!selectedLiveItem && (
        <div className="text-center py-16 space-y-3">
          <Search className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">트렌드 이미지를 선택하면 AI가 유사한 소싱 상품을 추천합니다.</p>
        </div>
      )}
    </div>
  );
};

export default ImageTrendTab;
