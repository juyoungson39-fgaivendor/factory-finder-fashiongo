import { useState } from 'react';
import { useTrend } from '@/contexts/TrendContext';
import ProductCard from './ProductCard';
import ImageTrendTab from './ImageTrendTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

type SubTab = 'keyword' | 'image';

const ProductRecommendations = () => {
  const [subTab, setSubTab] = useState<SubTab>('keyword');
  const { scoredProducts, categoryFilter, setCategoryFilter, sortBy, setSortBy, minScore, setMinScore, weights, selectedKeyword, setSelectedKeyword } = useTrend();

  const categories = ['All', 'Bottoms', 'Tops', 'Outerwear', 'Shoes', 'Accessories'];

  return (
    <div className="space-y-5">
      {/* Pill Toggle */}
      <div className="flex items-center gap-1 bg-secondary rounded-full p-1 w-fit">
        <button
          onClick={() => setSubTab('keyword')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            subTab === 'keyword'
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          키워드 추천
        </button>
        <button
          onClick={() => setSubTab('image')}
          className={cn(
            "px-4 py-1.5 rounded-full text-xs font-medium transition-colors",
            subTab === 'image'
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          이미지 트렌드
        </button>
      </div>

      {subTab === 'image' ? (
        <ImageTrendTab />
      ) : (
        <>
          {/* Score Formula */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
            <strong>스코어 공식:</strong> Total = (Trend Match × {weights.trend_match}%) + (Profitability × {weights.profitability}%) + (Reliability × {weights.reliability}%) + (Season Fit × {weights.season_fit}%)
            &nbsp;|&nbsp; <strong>추천 기준:</strong> Score ≥ 70
          </div>

          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="w-36">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">정렬</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="total">Total Score</SelectItem>
                  <SelectItem value="trend">Trend Score</SelectItem>
                  <SelectItem value="margin">Margin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">최소 점수: {minScore}</label>
              <Slider value={[minScore]} onValueChange={v => setMinScore(v[0])} min={0} max={100} step={5} />
            </div>
            {selectedKeyword && (
              <button onClick={() => setSelectedKeyword(null)}
                className="text-xs text-primary underline self-end pb-2">
                키워드 필터 해제: "{selectedKeyword}"
              </button>
            )}
          </div>

          {/* Product Grid */}
          {scoredProducts.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">조건에 맞는 상품이 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scoredProducts.map(p => (
                <ProductCard key={p.id} product={p} computedScore={p.computed_score} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ProductRecommendations;
