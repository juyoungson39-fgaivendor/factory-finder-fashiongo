import { useState } from 'react';
import { useTrend } from '@/contexts/TrendContext';
import ProductCard from './ProductCard';
import ScoringSettingsTab from './ScoringSettingsTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { ChevronDown, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const ProductRecommendations = () => {
  const [scoringOpen, setScoringOpen] = useState(false);
  const { scoredProducts, categoryFilter, setCategoryFilter, sortBy, setSortBy, minScore, setMinScore, weights, selectedKeyword, setSelectedKeyword } = useTrend();

  const categories = ['All', 'Bottoms', 'Tops', 'Outerwear', 'Shoes', 'Accessories'];

  const settingSummary = `트렌드 ${weights.trend_match}% · 수익성 ${weights.profitability}% · 임계값 ${minScore}`;

  return (
    <div className="space-y-5">
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

      {/* Collapsible Scoring Settings */}
      <div className="rounded-xl border" style={{ background: '#f9fafb', borderColor: '#e5e7eb' }}>
        <button
          onClick={() => setScoringOpen(!scoringOpen)}
          className="w-full flex items-center justify-between transition-colors rounded-xl"
          style={{ padding: '16px 20px', background: scoringOpen ? '#f3f4f6' : 'transparent' }}
          onMouseEnter={e => { if (!scoringOpen) e.currentTarget.style.background = '#f3f4f6'; }}
          onMouseLeave={e => { if (!scoringOpen) e.currentTarget.style.background = 'transparent'; }}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">스코어링 설정</span>
            <span className="text-xs text-muted-foreground ml-2">{settingSummary}</span>
          </div>
          <ChevronDown
            className={cn("w-4 h-4 text-muted-foreground transition-transform duration-300", scoringOpen && "rotate-180")}
          />
        </button>
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{ maxHeight: scoringOpen ? 1200 : 0, opacity: scoringOpen ? 1 : 0 }}
        >
          <div style={{ padding: '0 20px 20px' }}>
            <ScoringSettingsTab />
          </div>
        </div>
      </div>

      {/* Score Formula */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-primary">
        <strong>스코어 공식:</strong> Total = (Trend Match × {weights.trend_match}%) + (Profitability × {weights.profitability}%) + (Reliability × {weights.reliability}%) + (Season Fit × {weights.season_fit}%)
        &nbsp;|&nbsp; <strong>추천 기준:</strong> Score ≥ 70
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
    </div>
  );
};

export default ProductRecommendations;
