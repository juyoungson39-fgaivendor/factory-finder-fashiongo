import { useState } from 'react';
import { MOCK_SNS_TRENDS, MOCK_MATCHED_PRODUCTS, CATEGORY_ICONS, CATEGORY_GRADIENTS, type SNSTrend, type MatchedProduct } from '@/data/trendMockData';
import { useTrend } from '@/contexts/TrendContext';
import { Star, Plus, Check, Search, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

const scoreColor = (v: number) => v >= 80 ? '#16a34a' : v >= 70 ? '#d97706' : '#dc2626';

const SimilarityBar = ({ label, value }: { label: string; value: number }) => (
  <div className="flex items-center gap-2 text-[11px]">
    <span className="w-14 text-muted-foreground shrink-0">{label}</span>
    <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
      <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${value}%` }} />
    </div>
    <span className="w-7 text-right font-medium text-foreground">{value}%</span>
  </div>
);

/* ── SNS Trend Card ── */
const TrendCard = ({ trend, selected, onClick }: { trend: SNSTrend; selected: boolean; onClick: () => void }) => {
  const gradient = CATEGORY_GRADIENTS[trend.category] || 'from-gray-400 to-gray-600';
  const icon = CATEGORY_ICONS[trend.category] || '📦';

  return (
    <button
      onClick={onClick}
      className={cn(
        "shrink-0 w-[220px] rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md",
        selected ? "border-primary ring-2 ring-primary/20 shadow-lg" : "border-border"
      )}
    >
      {/* Image placeholder */}
      <div className={cn("h-[200px] bg-gradient-to-br flex flex-col items-center justify-center relative", gradient)}>
        <span className="text-5xl drop-shadow-lg">{icon}</span>
        <span className="mt-2 text-white/90 text-xs font-semibold drop-shadow px-3 text-center">{trend.style_name}</span>
      </div>

      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm text-foreground truncate">🔥 {trend.style_name}</p>
        <p className="text-[11px] text-muted-foreground">📱 {trend.source} · {trend.views}</p>
        <p className="text-[13px] font-bold" style={{ color: trend.change_pct > 0 ? '#16a34a' : '#dc2626' }}>
          📈 {trend.change_pct > 0 ? '+' : ''}{trend.change_pct}% (7일)
        </p>
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{icon} {trend.category}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">👤 {trend.celebrity}</span>
        </div>
      </div>
    </button>
  );
};

/* ── Matched Product Card ── */
const MatchedProductCard = ({ product }: { product: MatchedProduct }) => {
  const { toggleRegistration, registrationList } = useTrend();
  const isAdded = registrationList.includes(product.id);
  const simColor = scoreColor(product.similarity);
  const icon = CATEGORY_ICONS[product.category] || '📦';
  const gradient = CATEGORY_GRADIENTS[product.category] || 'from-gray-400 to-gray-600';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow">
      <div className={cn("h-32 bg-gradient-to-br flex items-center justify-center", gradient)}>
        <span className="text-4xl drop-shadow-lg">{icon}</span>
      </div>

      <div className="p-3 space-y-2.5">
        {/* Similarity score */}
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

  const activeTrend = MOCK_SNS_TRENDS.find(t => t.id === selectedTrend);
  const rawMatches = selectedTrend ? (MOCK_MATCHED_PRODUCTS[selectedTrend] || []) : [];
  const filteredMatches = rawMatches
    .filter(p => p.similarity >= minSimilarity)
    .sort((a, b) => {
      if (sortBy === 'margin') return b.margin_pct - a.margin_pct;
      if (sortBy === 'price') return a.source_price_cny - b.source_price_cny;
      return b.similarity - a.similarity;
    });

  // Average similarity for the detail panel
  const avgDetail = activeTrend && filteredMatches.length > 0
    ? {
        color: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.color, 0) / filteredMatches.length),
        silhouette: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.silhouette, 0) / filteredMatches.length),
        material: Math.round(filteredMatches.reduce((s, p) => s + p.similarity_detail.material, 0) / filteredMatches.length),
      }
    : null;

  return (
    <div className="space-y-5">
      {/* ① SNS Trend Feed */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-primary" /> SNS 트렌드 피드
        </h3>
        <ScrollArea className="w-full">
          <div className="flex gap-3 pb-3">
            {MOCK_SNS_TRENDS.map(trend => (
              <TrendCard
                key={trend.id}
                trend={trend}
                selected={selectedTrend === trend.id}
                onClick={() => setSelectedTrend(trend.id)}
              />
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
                <div className={cn("h-[280px] rounded-xl bg-gradient-to-br flex flex-col items-center justify-center", CATEGORY_GRADIENTS[activeTrend.category] || 'from-gray-400 to-gray-600')}>
                  <span className="text-6xl drop-shadow-lg">{CATEGORY_ICONS[activeTrend.category] || '📦'}</span>
                  <span className="mt-3 text-white font-bold text-lg drop-shadow">{activeTrend.style_name}</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-foreground">{activeTrend.style_name}</h3>
                  <p className="text-sm text-muted-foreground">👤 {activeTrend.celebrity}</p>
                  <p className="text-sm text-muted-foreground">📱 {activeTrend.source} · {activeTrend.views}</p>
                  <p className="text-sm text-muted-foreground">📅 감지일: {activeTrend.detected_at}</p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activeTrend.tags.map(tag => (
                      <span key={tag} className="text-xs px-3 py-1 rounded-full bg-secondary text-secondary-foreground">#{tag}</span>
                    ))}
                  </div>
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
            {/* Sort & Filter controls */}
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
