import { type TrendKeyword, CATEGORY_COLORS } from '@/data/trendMockData';
import { cn } from '@/lib/utils';
import { useTrend } from '@/contexts/TrendContext';

const CircularScore = ({ score }: { score: number }) => {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = score >= 80 ? '#16a34a' : score >= 70 ? '#d97706' : '#dc2626';

  return (
    <div className="relative w-[72px] h-[72px] flex items-center justify-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e5e7eb" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          transform="rotate(-90 36 36)" className="transition-all duration-500" />
      </svg>
      <span className="absolute text-lg font-bold" style={{ color }}>{score}</span>
    </div>
  );
};

const TrendScoreCard = ({ trend }: { trend: TrendKeyword }) => {
  const { selectedKeyword, setSelectedKeyword } = useTrend();
  const isSelected = selectedKeyword === trend.keyword;
  const catColor = CATEGORY_COLORS[trend.category] || '#6b7280';

  return (
    <button
      onClick={() => setSelectedKeyword(isSelected ? null : trend.keyword)}
      className={cn(
        "flex-shrink-0 w-[220px] rounded-xl border p-4 text-left transition-all hover:shadow-md",
        isSelected ? "border-[#4f46e5] bg-[#f5f3ff] shadow-md" : "border-border bg-card"
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm text-[#202223] leading-tight">{trend.keyword}</h3>
          <span className="inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: catColor }}>
            {trend.category}
          </span>
        </div>
        <CircularScore score={trend.trend_score} />
      </div>

      <div className="flex gap-1.5 mb-2">
        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">🔍 {trend.google}</span>
        <span className="text-[10px] bg-pink-50 text-pink-700 px-1.5 py-0.5 rounded">📱 {trend.social}</span>
        <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">🛒 {trend.sales}</span>
      </div>

      <div className={cn(
        "text-xs font-semibold",
        trend.change >= 0 ? "text-green-600" : "text-red-500"
      )}>
        {trend.change >= 0 ? `▲ +${trend.change}` : `▼ ${trend.change}`} <span className="text-[#6d7175] font-normal">7일</span>
      </div>
    </button>
  );
};

export default TrendScoreCard;
