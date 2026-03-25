import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { MOCK_TRENDS, MOCK_PRODUCTS, type TrendKeyword, type RecommendedProduct } from '@/data/trendMockData';

interface Weights {
  trend_match: number;
  profitability: number;
  reliability: number;
  season_fit: number;
}

interface ChannelWeights {
  google: { enabled: boolean; weight: number };
  tiktok: { enabled: boolean; weight: number };
  amazon: { enabled: boolean; weight: number };
  shein: { enabled: boolean; weight: number };
}

interface TrendContextType {
  trends: TrendKeyword[];
  products: RecommendedProduct[];
  weights: Weights;
  channelWeights: ChannelWeights;
  threshold: number;
  hideBelow: boolean;
  selectedKeyword: string | null;
  registrationList: string[];
  categoryFilter: string;
  sortBy: string;
  minScore: number;
  setWeights: (w: Weights) => void;
  setChannelWeights: (c: ChannelWeights) => void;
  setThreshold: (t: number) => void;
  setHideBelow: (h: boolean) => void;
  setSelectedKeyword: (k: string | null) => void;
  toggleRegistration: (id: string) => void;
  addTrend: (t: TrendKeyword) => void;
  setCategoryFilter: (c: string) => void;
  setSortBy: (s: string) => void;
  setMinScore: (n: number) => void;
  scoredProducts: (RecommendedProduct & { computed_score: number })[];
}

const TrendContext = createContext<TrendContextType | null>(null);

export const useTrend = () => {
  const ctx = useContext(TrendContext);
  if (!ctx) throw new Error('useTrend must be inside TrendProvider');
  return ctx;
};

export const TrendProvider = ({ children }: { children: React.ReactNode }) => {
  const [trends, setTrends] = useState<TrendKeyword[]>(MOCK_TRENDS);
  const [weights, setWeights] = useState<Weights>({ trend_match: 40, profitability: 30, reliability: 20, season_fit: 10 });
  const [channelWeights, setChannelWeights] = useState<ChannelWeights>({
    google: { enabled: true, weight: 35 },
    tiktok: { enabled: true, weight: 30 },
    amazon: { enabled: true, weight: 20 },
    shein: { enabled: true, weight: 15 },
  });
  const [threshold, setThreshold] = useState(70);
  const [hideBelow, setHideBelow] = useState(false);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [registrationList, setRegistrationList] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState('total');
  const [minScore, setMinScore] = useState(0);

  const toggleRegistration = useCallback((id: string) => {
    setRegistrationList(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }, []);

  const addTrend = useCallback((t: TrendKeyword) => {
    setTrends(prev => [...prev, t]);
  }, []);

  const scoredProducts = useMemo(() => {
    const total = weights.trend_match + weights.profitability + weights.reliability + weights.season_fit;
    return MOCK_PRODUCTS.map(p => {
      const computed_score = total > 0
        ? Math.round(
            (p.trend_match * weights.trend_match +
             p.profitability * weights.profitability +
             p.reliability * weights.reliability +
             p.season_fit * weights.season_fit) / total
          )
        : 0;
      return { ...p, computed_score };
    })
    .filter(p => {
      if (selectedKeyword && p.keyword !== selectedKeyword) return false;
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      if (p.computed_score < minScore) return false;
      if (hideBelow && p.computed_score < threshold) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'trend') return b.trend_match - a.trend_match;
      if (sortBy === 'margin') return b.margin_pct - a.margin_pct;
      return b.computed_score - a.computed_score;
    });
  }, [weights, selectedKeyword, categoryFilter, minScore, hideBelow, threshold, sortBy]);

  return (
    <TrendContext.Provider value={{
      trends, products: MOCK_PRODUCTS, weights, channelWeights, threshold, hideBelow,
      selectedKeyword, registrationList, categoryFilter, sortBy, minScore,
      setWeights, setChannelWeights, setThreshold, setHideBelow, setSelectedKeyword,
      toggleRegistration, addTrend, setCategoryFilter, setSortBy, setMinScore, scoredProducts,
    }}>
      {children}
    </TrendContext.Provider>
  );
};
