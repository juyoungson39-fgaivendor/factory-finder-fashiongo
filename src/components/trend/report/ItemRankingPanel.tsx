import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReportData } from './ReportSummaryCards';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Dresses':   ['dress', 'mini dress', 'midi dress', 'maxi dress', 'gown'],
  'Tops':      ['top', 'blouse', 'shirt', 'crop top', 'tank', 'tee', 'sweater', 'hoodie'],
  'Bottoms':   ['pants', 'jeans', 'skirt', 'shorts', 'trousers', 'wide leg'],
  'Outerwear': ['jacket', 'coat', 'blazer', 'vest', 'parka'],
};

const CATEGORY_COLORS: Record<string, string> = {
  Dresses:   '#6366f1',
  Tops:      '#f59e0b',
  Bottoms:   '#10b981',
  Outerwear: '#f472b6',
  Others:    '#94a3b8',
};

interface ItemRankingPanelProps {
  data: ReportData | null;
  loading: boolean;
}

const inferCategory = (item: any): string => {
  const keywords: string[] = (Array.isArray(item.trend_keywords) ? item.trend_keywords : [])
    .map((k: string) => k?.toLowerCase() || '');
  const trendName = (item.trend_name || '').toLowerCase();
  const allText = [...keywords, trendName].join(' ');

  for (const [category, catKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (catKeywords.some((ck) => allText.includes(ck))) return category;
  }
  return 'Others';
};

export const ItemRankingPanel = ({ data, loading }: ItemRankingPanelProps) => {

  // 상승/하강 아이템 랭킹
  const itemRankings = useMemo(() => {
    if (!data) return { rising: [], declining: [] };

    const countKeywords = (items: any[]) => {
      const freq: Record<string, number> = {};
      items.forEach((item) => {
        const keywords: string[] = Array.isArray(item.trend_keywords) ? item.trend_keywords : [];
        keywords.forEach((kw) => {
          if (kw?.trim()) {
            const key = kw.trim().toLowerCase();
            freq[key] = (freq[key] || 0) + 1;
          }
        });
      });
      return freq;
    };

    const currentFreq = countKeywords(data.current);
    const prevFreq = countKeywords(data.previous);

    const rising = Object.entries(currentFreq)
      .map(([kw, curr]) => {
        const prev = prevFreq[kw] || 0;
        const growth = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr >= 2 ? 999 : 0);
        return { keyword: kw, current: curr, previous: prev, growth };
      })
      .filter((c) => c.growth > 0 && c.current >= 2)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10);

    const declining = Object.entries(prevFreq)
      .filter(([kw]) => (currentFreq[kw] || 0) < prevFreq[kw])
      .map(([kw, prev]) => {
        const curr = currentFreq[kw] || 0;
        const growth = Math.round(((curr - prev) / prev) * 100);
        return { keyword: kw, current: curr, previous: prev, growth };
      })
      .sort((a, b) => a.growth - b.growth)
      .slice(0, 10);

    return { rising, declining };
  }, [data]);

  // 플랫폼 × 카테고리 스택 바 차트
  const platformCategoryData = useMemo(() => {
    if (!data) return [];

    const matrix: Record<string, Record<string, number>> = {};
    data.current.forEach((item) => {
      const platform = (item.platform || 'unknown').toLowerCase();
      const category = inferCategory(item);
      if (!matrix[platform]) matrix[platform] = {};
      matrix[platform][category] = (matrix[platform][category] || 0) + 1;
    });

    return Object.entries(matrix)
      .map(([platform, cats]) => {
        const total = Object.values(cats).reduce((s, v) => s + v, 0);
        return { platform, ...cats, _total: total };
      })
      .sort((a, b) => b._total - a._total);
  }, [data]);

  if (loading || !data) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  const categories = [...Object.keys(CATEGORY_COLORS)];

  return (
    <div className="space-y-6">
      {/* 1. 상승/하강 아이템 랭킹 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" />
              상승 아이템 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {itemRankings.rising.map((item, idx) => (
                <div key={item.keyword} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <span>{item.keyword}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.current}건/주</span>
                    <span className="text-xs font-medium text-green-600">
                      ▲{item.growth > 500 ? 'NEW' : `${item.growth}%`}
                    </span>
                  </div>
                </div>
              ))}
              {itemRankings.rising.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">데이터 부족</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-500" />
              하강 아이템 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {itemRankings.declining.map((item, idx) => (
                <div key={item.keyword} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <span>{item.keyword}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.current}건/주</span>
                    <span className="text-xs font-medium text-red-500">
                      ▼{Math.abs(item.growth)}%
                    </span>
                  </div>
                </div>
              ))}
              {itemRankings.declining.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">데이터 부족</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 2. 플랫폼별 카테고리 구성비 스택 바 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">플랫폼별 카테고리 구성비</CardTitle>
        </CardHeader>
        <CardContent>
          {platformCategoryData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, platformCategoryData.length * 45)}>
              <BarChart data={platformCategoryData} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="platform" tick={{ fontSize: 12 }} width={75} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                {categories.map((cat) => (
                  <Bar key={cat} dataKey={cat} stackId="a" fill={CATEGORY_COLORS[cat]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
