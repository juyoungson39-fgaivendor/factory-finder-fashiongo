import { useState } from 'react';
import { MOCK_SNS_TRENDS, MOCK_MATCHED_PRODUCTS, CATEGORY_ICONS, type SNSTrend, type MatchedProduct } from '@/data/trendMockData';
import { getTrendImage, getProductImage } from '@/lib/trendImageUtils';
import { useTrend } from '@/contexts/TrendContext';
import { useInstagramTrends } from '@/hooks/use-instagram-trends';
import { Star, Plus, Check, Search, TrendingUp, AlertTriangle, ExternalLink, Newspaper, Instagram, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const scoreColor = (v: number) => v >= 80 ? 'hsl(var(--chart-2))' : v >= 70 ? 'hsl(var(--chart-4))' : 'hsl(var(--destructive))';

const SimilarityBar = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2 text-[11px]">
    <span className="w-14 text-muted-foreground shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
    <span className="w-7 text-right font-medium text-foreground">{value}%</span>
  </div>
);

/* ── Image with loading state ── */
const TrendImage = ({ src, alt, className, badge }: { src: string; alt: string; className?: string; badge?: React.ReactNode }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={cn("bg-muted flex items-center justify-center", className)}>
        <span className="text-4xl">📷</span>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden group", className)}>
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          "w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]",
          !loaded && "opacity-0"
        )}
      />
      {badge && loaded && badge}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
        <span className="text-white text-xs font-medium flex items-center gap-1">
          <ExternalLink className="w-3 h-3" /> 원본 보기
        </span>
      </div>
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
      <span>샘플 이미지로 표시 중입니다.</span>
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

/* ── SNS Trend Card ── */
const TrendCard = ({ trend, selected, onClick }: { trend: SNSTrend; selected: boolean; onClick: () => void }) => {
  const icon = CATEGORY_ICONS[trend.category] || '📦';

  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 w-[220px] rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-border"
      )}
    >
      <TrendImage
        src={getTrendImage(trend)}
        alt={trend.style_name}
        className="h-[200px]"
        badge={<EngagementBadge source={trend.source} engagement={trend.engagement} />}
      />
      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm text-foreground truncate">🔥 {trend.style_name}</p>
        <p className="text-[13px] font-semibold text-primary">👤 {trend.celebrity}</p>
        <p className="text-[11px] text-muted-foreground">📱 {trend.source_handle}</p>
        <p className="text-[13px] font-bold" style={{ color: trend.change_pct > 0 ? 'hsl(var(--chart-2))' : 'hsl(var(--destructive))' }}>
          📈 {trend.change_pct > 0 ? '+' : ''}{trend.change_pct}% (7일)
        </p>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{icon} {trend.category}</span>
        </div>
        <a
          href={trend.article_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors pt-0.5"
        >
          <Newspaper className="w-3 h-3" /> {trend.article_ref} ↗
        </a>
      </div>
    </button>
  );
};

/* ── Matched Product Card ── */
const MatchedProductCard = ({ product }: { product: MatchedProduct }) => {
  const { toggleRegistration, registrationList } = useTrend();
  const isAdded = registrationList.includes(product.id);
  const simColor = scoreColor(product.similarity);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative">
        <TrendImage
          src={getProductImage(product)}
          alt={product.name_en}
          className="h-[180px]"
          badge={
            <span className="absolute bottom-2 right-2 text-[10px] px-1.5 py-0.5 rounded text-white" style={{ background: 'rgba(0,0,0,0.6)' }}>
              모델컷
            </span>
          }
        />
      </div>

      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold" style={{ color: simColor }}>{product.similarity}%</span>
          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${product.similarity}%`, backgroundColor: simColor }} />
          </div>
        </div>

        <div>
          <h4 className="font-semibold text-sm text-foreground">{product.name_ko}</h4>
          <p className="text-[11px] text-muted-foreground">{product.name_en}</p>
        </div>

        <div className="flex items-center justify-between text-[11px]">
          <span>🇨🇳 ¥{product.source_price_cny}</span>
          <span className="text-muted-foreground">→</span>
          <span>🇺🇸 ${product.retail_price_usd}</span>
          <span className="font-semibold text-green-600">마진 {product.margin_pct}%</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium text-foreground">{product.supplier_rating}</span>
          <span>({product.review_count}건)</span>
        </div>

        <div className="flex gap-1 flex-wrap">
          {product.matched_tags.map(t => (
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

/* ── Main ImageTrendTab ── */
const ImageTrendTab = () => {
  const [selectedTrend, setSelectedTrend] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState('similarity');
  const [minSimilarity, setMinSimilarity] = useState(60);
  const { fetchTrends, trends, loading: igLoading } = useInstagramTrends();
  const [liveSource, setLiveSource] = useState<string>('mock');

  const handleFetchLive = async () => {
    const result = await fetchTrends({
      hashtags: ['streetstyle', 'ootd', 'fashiontrend', 'celebritystyle', 'streetfashion'],
      limit: 20,
    });
    if (result?.source) {
      setLiveSource(result.source);
    }
  };

  const activeTrend = MOCK_SNS_TRENDS.find(t => t.id === selectedTrend);
  const rawMatches = selectedTrend ? (MOCK_MATCHED_PRODUCTS[selectedTrend] || []) : [];
  const filteredMatches = rawMatches
    .filter(p => p.similarity >= minSimilarity)
    .sort((a, b) => {
      if (sortBy === 'margin') return b.margin_pct - a.margin_pct;
      if (sortBy === 'price') return a.source_price_cny - b.source_price_cny;
      return b.similarity - a.similarity;
    });

  const avgDetail = activeTrend && filteredMatches.length > 0
    ? {
        color: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.color, 0) / filteredMatches.length),
        silhouette: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.silhouette, 0) / filteredMatches.length),
        material: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.material, 0) / filteredMatches.length),
      }
    : null;

  return (
    <div className="space-y-5">
      <ApiStatusBanner source={liveSource} onFetch={handleFetchLive} loading={igLoading} />

      {/* ① SNS Trend Feed */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" /> SNS 트렌드 피드
        </h3>
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-3">
            {MOCK_SNS_TRENDS.map(trend => (
              <TrendCard key={trend.id} trend={trend} selected={selectedTrend === trend.id} onClick={() => setSelectedTrend(trend.id)} />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* ② Detail + Matched Products */}
      {!selectedTrend ? (
        <div className="text-center py-16 space-y-3">
          <Search className="w-12 h-12 mx-auto text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">트렌드 이미지를 선택하면 AI가 유사한 소싱 상품을 추천합니다.</p>
        </div>
      ) : (
        <div className="flex gap-5 flex-col lg:flex-row">
          {/* Left: Trend Detail */}
          <div className="w-full lg:w-[320px] shrink-0 space-y-4">
            {activeTrend && (
              <>
                <TrendImage
                  src={getTrendImage(activeTrend)}
                  alt={activeTrend.style_name}
                  className="h-[280px] rounded-xl"
                  badge={<EngagementBadge source={activeTrend.source} engagement={activeTrend.engagement} />}
                />

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-foreground">{activeTrend.style_name}</h3>
                  <p className="text-sm text-muted-foreground italic">{activeTrend.description}</p>
                  <p className="text-sm font-semibold text-primary">👤 {activeTrend.celebrity}</p>
                  <p className="text-xs text-muted-foreground">📱 {activeTrend.source_handle} · {activeTrend.source}</p>
                  <p className="text-xs text-muted-foreground">📅 감지일: {activeTrend.detected_at}</p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeTrend.tags.map(tag => (
                      <span key={tag} className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">#{tag}</span>
                    ))}
                  </div>

                  <a
                    href={activeTrend.article_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors pt-1"
                  >
                    <Newspaper className="w-3.5 h-3.5" /> 📰 {activeTrend.article_ref} 기사 보기 ↗
                  </a>
                </div>

                {avgDetail && (
                  <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <p className="text-xs font-semibold text-foreground">AI 유사도 분석 기준</p>
                    <SimilarityBar label="색상" value={avgDetail.color} />
                    <SimilarityBar label="실루엣" value={avgDetail.silhouette} />
                    <SimilarityBar label="소재감" value={avgDetail.material} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right: Matched Product Grid */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="w-40">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">정렬</label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="similarity">유사도순</SelectItem>
                    <SelectItem value="margin">마진순</SelectItem>
                    <SelectItem value="price">가격순</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-52">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">최소 유사도: {minSimilarity}%</label>
                <Slider value={[minSimilarity]} onValueChange={v => setMinSimilarity(v[0])} min={30} max={100} step={5} />
              </div>
            </div>

            {filteredMatches.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">조건에 맞는 매칭 상품이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredMatches.map(p => (
                  <MatchedProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageTrendTab;
