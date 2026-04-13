import { useState, useRef } from 'react';
import { useTrend } from '@/contexts/TrendContext';

import { useAIMatching } from '@/hooks/useAIMatching';
import { useSnsTrendFeed, type TrendFeedItem } from '@/hooks/useSnsTrendFeed';
import { useQuery } from '@tanstack/react-query';
import type { AIMatchedProduct, SourcingProduct } from '@/types/matching';
import { Star, Plus, Check, Search, TrendingUp, ExternalLink, Loader2, Bot, RefreshCw } from 'lucide-react';
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
        <Search className="w-6 h-6 text-muted-foreground/40" />
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
        소싱가능상품 {totalPool}개 중 유사도 상위 6개를 선별했습니다 · 분석 소요 시간: {(elapsedMs / 1000).toFixed(1)}초
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
          {BOUTIQUE_HASHTAGS.slice(0, 4).map(t => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
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

/* ── Platform badge config ── */
const PLATFORM_BADGE: Record<string, { label: string; bg: string }> = {
  instagram: { label: 'IG', bg: 'rgba(0,0,0,0.6)' },
  tiktok: { label: 'TT', bg: 'rgba(0,0,0,0.6)' },
  magazine: { label: '매거진', bg: 'rgba(0,0,0,0.6)' },
  google: { label: 'Google', bg: '#4285F4' },
  amazon: { label: 'Amazon', bg: '#FF9900' },
  pinterest: { label: 'Pinterest', bg: '#E60023' },
};

/* ── Live SNS Feed Card (Supabase) ── */
const LiveTrendCard = ({ item, selected, onClick }: { item: TrendFeedItem; selected: boolean; onClick: () => void }) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const badge = PLATFORM_BADGE[item.platform] || { label: item.magazine_name || item.platform, bg: 'rgba(0,0,0,0.6)' };
  const platformLabel = item.platform === 'magazine' ? (item.magazine_name || '매거진') : badge.label;
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
        <div className="flex gap-1 flex-wrap">
          {BOUTIQUE_HASHTAGS.slice(0, 3).map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
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

/* ── Main ImageTrendTab ── */
const ImageTrendTab = () => {
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sortBy, setSortBy] = useState('similarity');
  const [minSimilarity, setMinSimilarity] = useState(30);
  const { matchedProducts: aiProducts, isMatching, matchError, progress, elapsedMs, runMatching } = useAIMatching();
  const [useAIMode, setUseAIMode] = useState(false);
  const resultPanelRef = useRef<HTMLDivElement>(null);

  // Fetch sourceable products with images
  const { data: sourceableProducts = [] } = useQuery({
    queryKey: ['sourceable-products-with-image'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sourceable_products')
        .select('*')
        .not('image_url', 'is', null);
      if (error) throw error;
      return data || [];
    },
  });
  // Only use images hosted on our public storage (skip dead external URLs like alicdn)
  const fgWithImage = sourceableProducts.filter(p =>
    p.image_url && p.image_url.includes('supabase.co/storage/')
  );

  // Supabase live feed — default to Instagram
  const [platformFilter, setPlatformFilter] = useState<'all' | 'instagram' | 'tiktok' | 'magazine' | 'google' | 'amazon' | 'pinterest'>('all');
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
      const [snsResult, magResult, googleResult, amazonResult, pinterestResult] = await Promise.allSettled([
        supabase.functions.invoke('collect-sns-trends', {
          body: { source: 'all', limit: 20, user_id: userId },
        }),
        supabase.functions.invoke('collect-magazine-trends', {
          body: { user_id: userId },
        }),
        supabase.functions.invoke('collect-google-image-trends', {
          body: { user_id: userId, limit: 20 },
        }),
        supabase.functions.invoke('collect-amazon-image-trends', {
          body: { user_id: userId, limit: 20 },
        }),
        supabase.functions.invoke('collect-pinterest-image-trends', {
          body: { user_id: userId, limit: 20 },
        }),
      ]);
      const getCount = (r: PromiseSettledResult<any>) => r.status === 'fulfilled' ? (r.value.data?.saved ?? r.value.data?.inserted ?? 0) : 0;
      const snsSaved = getCount(snsResult);
      const magSaved = getCount(magResult);
      const googleSaved = getCount(googleResult);
      const amazonSaved = getCount(amazonResult);
      const pinterestSaved = getCount(pinterestResult);
      const totalSaved = snsSaved + magSaved + googleSaved + amazonSaved + pinterestSaved;
      
      toast.success(`수집 완료 · 총 ${totalSaved}개 저장 (SNS ${snsSaved} + 매거진 ${magSaved} + Google ${googleSaved} + Amazon ${amazonSaved} + Pinterest ${pinterestSaved})`);
      refetch();
    } catch (e: any) {
      toast.error(e.message || '트렌드 수집에 실패했습니다.');
    } finally {
      setCollecting(false);
    }
  };


  // Handle live feed card selection
  const handleSelectLiveItem = async (item: TrendFeedItem) => {
    if (selectedLiveItem?.id === item.id) {
      setSelectedLiveItem(null);
      return;
    }
    setSelectedLiveItem(item);

    // Scroll to result panel after render
    setTimeout(() => {
      resultPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);

    if (fgWithImage.length === 0) {
      setUseAIMode(false);
      return;
    }

    try {
      setUseAIMode(true);
      const sourcingProducts: SourcingProduct[] = fgWithImage.map(p => ({
        id: p.id,
        name: p.item_name || p.item_name_en || '상품',
        name_cn: p.item_name || '',
        price_range: p.unit_price ? `$${p.unit_price}` : p.price ? `¥${p.price}` : '-',
        moq: 1,
        supplier: p.vendor_name || p.source || '-',
        supplier_rating: 0,
        category: p.category || '',
        image: p.image_url!,
        tags: [],
      }));
      await runMatching(item.image_url, sourcingProducts);
    } catch {
      setUseAIMode(false);
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
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Live feed — selected item product recommendations */}
        {selectedLiveItem && (
          <div ref={resultPanelRef} className="mt-4 space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img src={selectedLiveItem.image_url} alt={selectedLiveItem.trend_name} className="w-12 h-16 rounded-lg object-cover border border-border" />
                <div>
                  <p className="text-sm font-semibold text-foreground">🔥 {selectedLiveItem.trend_name}</p>
                  <div className="flex gap-1 mt-1">
                    {BOUTIQUE_HASHTAGS.slice(0, 4).map(t => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setSelectedLiveItem(null)}>✕ 닫기</Button>
            </div>

            {fgWithImage.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <p className="font-medium mb-1">소싱가능상품이 없습니다.</p>
                <p>상품 목록 &gt; 소싱가능상품에서 먼저 상품을 등록해주세요.</p>
              </div>
            ) : (
              <>
                {/* AI Result Header */}
                <AIResultHeader
                  isAI={useAIMode && !matchError}
                  elapsedMs={elapsedMs}
                  totalPool={fgWithImage.length}
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
