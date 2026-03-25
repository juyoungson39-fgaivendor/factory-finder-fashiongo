import { type RecommendedProduct, CATEGORY_COLORS, CATEGORY_ICONS } from '@/data/trendMockData';
import { useTrend } from '@/contexts/TrendContext';
import { Star, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const ScoreBar = ({ label, value }: { label: string; value: number }) => {
  const color = value >= 80 ? '#16a34a' : value >= 70 ? '#d97706' : '#dc2626';
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-16 text-[#6d7175] shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${value}%`, backgroundColor: color }} />
      </div>
      <span className="w-7 text-right font-medium" style={{ color }}>{value}</span>
    </div>
  );
};

const ProductCard = ({ product, computedScore }: { product: RecommendedProduct; computedScore: number }) => {
  const { toggleRegistration, registrationList } = useTrend();
  const isAdded = registrationList.includes(product.id);
  const scoreColor = computedScore >= 80 ? '#16a34a' : computedScore >= 70 ? '#d97706' : '#dc2626';
  const catColor = CATEGORY_COLORS[product.category] || '#6b7280';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden hover:shadow-lg transition-shadow">
      {/* Product Image */}
      <div className="relative h-48 overflow-hidden">
        {product.image ? (
          <>
            <img
              src={product.image}
              alt={product.name_en}
              className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
              loading="lazy"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  const fallback = document.createElement('div');
                  fallback.className = 'w-full h-full flex items-center justify-center text-4xl';
                  fallback.style.backgroundColor = `${catColor}18`;
                  fallback.textContent = CATEGORY_ICONS[product.category] || '📦';
                  target.parentElement.appendChild(fallback);
                }
              }}
            />
            <span className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
              {product.category}
            </span>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl" style={{ backgroundColor: `${catColor}18` }}>
            {CATEGORY_ICONS[product.category] || '📦'}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-sm text-[#202223]">{product.name_ko}</h3>
            <p className="text-xs text-[#6d7175]">{product.name_en}</p>
          </div>
          <div className="text-2xl font-bold shrink-0" style={{ color: scoreColor }}>{computedScore}</div>
        </div>

        <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#4f46e5] text-[#4f46e5]">
          🔗 {product.keyword}
        </span>

        <div className="space-y-1.5">
          <ScoreBar label="트렌드" value={product.trend_match} />
          <ScoreBar label="수익성" value={product.profitability} />
          <ScoreBar label="신뢰도" value={product.reliability} />
          <ScoreBar label="시즌핏" value={product.season_fit} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-[11px] bg-gray-50 rounded-lg p-2">
          <div>
            <div className="text-[#6d7175]">소싱가</div>
            <div className="font-semibold text-[#202223]">¥{product.source_price_cny}</div>
          </div>
          <div>
            <div className="text-[#6d7175]">판매가</div>
            <div className="font-semibold text-[#202223]">${product.retail_price_usd}</div>
          </div>
          <div>
            <div className="text-[#6d7175]">마진</div>
            <div className="font-semibold text-green-600">{product.margin_pct}%</div>
          </div>
        </div>

        <div className="flex items-center gap-1 text-xs text-[#6d7175]">
          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium text-[#202223]">{product.supplier_rating}</span>
          <span>({product.review_count})</span>
        </div>

        <Button
          onClick={() => toggleRegistration(product.id)}
          className={cn("w-full text-xs h-9", isAdded && "bg-green-600 hover:bg-green-700")}
          variant={isAdded ? "default" : "default"}
        >
          {isAdded ? <><Check className="w-3.5 h-3.5" /> 등록 후보 추가됨</> : <><Plus className="w-3.5 h-3.5" /> 패션고 등록 후보 추가</>}
        </Button>
      </div>
    </div>
  );
};

export default ProductCard;
