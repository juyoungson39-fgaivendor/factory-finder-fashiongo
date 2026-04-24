import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ReportData } from './ReportSummaryCards';

// image_trends.category 컬럼 없음 → trend_keywords + trend_name 기반 카테고리 추론
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Dresses':    ['dress', 'mini dress', 'midi dress', 'maxi dress', 'gown', 'sundress'],
  'Tops':       ['top', 'blouse', 'shirt', 'crop top', 'tank', 'tee', 't-shirt', 'sweater', 'hoodie', 'cardigan', 'knitwear'],
  'Bottoms':    ['pants', 'jeans', 'skirt', 'shorts', 'trousers', 'leggings', 'wide leg', 'wide-leg'],
  'Outerwear':  ['jacket', 'coat', 'blazer', 'vest', 'parka', 'windbreaker', 'trench'],
  'Activewear': ['activewear', 'sportswear', 'yoga', 'gym', 'athletic', 'workout', 'legging'],
  'Swimwear':   ['swimwear', 'bikini', 'swimsuit', 'cover up', 'coverup'],
  'Accessories':['bag', 'hat', 'jewelry', 'scarf', 'belt', 'sunglasses', 'watch', 'handbag', 'purse'],
};

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f472b6', '#8b5cf6', '#06b6d4', '#94a3b8'];

interface CategoryTrendPanelProps {
  data: ReportData | null;
  loading: boolean;
}

// 키워드 기반 카테고리 추론
const inferCategory = (item: any): string => {
  const keywords: string[] = (Array.isArray(item.trend_keywords) ? item.trend_keywords : [])
    .map((k: string) => k?.toLowerCase() || '');
  // trend_categories 컬럼도 활용
  const trendCats: string[] = (Array.isArray(item.trend_categories) ? item.trend_categories : [])
    .map((c: string) => c?.toLowerCase() || '');
  const trendName = (item.trend_name || '').toLowerCase();
  const allText = [...keywords, ...trendCats, trendName].join(' ');

  for (const [category, catKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (catKeywords.some((ck) => allText.includes(ck))) return category;
  }
  return 'Others';
};

export const CategoryTrendPanel = ({ data, loading }: CategoryTrendPanelProps) => {

  const categoryStats = useMemo(() => {
    if (!data) return [];
    const stats: Record<string, { count: number; views: number; likes: number }> = {};

    data.current.forEach((item) => {
      const category = inferCategory(item);
      if (!stats[category]) stats[category] = { count: 0, views: 0, likes: 0 };
      stats[category].count++;
      stats[category].views += item.view_count || 0;
      stats[category].likes += item.like_count || 0;
    });

    const total = Object.values(stats).reduce((sum, s) => sum + s.count, 0);
    return Object.entries(stats)
      .map(([category, s]) => ({
        category,
        ...s,
        share: total > 0 ? Math.round((s.count / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (loading || !data) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  if (categoryStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">카테고리 데이터가 없습니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 도넛 차트 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">카테고리별 분포</CardTitle>
          <p className="text-xs text-muted-foreground">키워드 기반 카테고리 추론</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={categoryStats}
                dataKey="count"
                nameKey="category"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {categoryStats.map((_, idx) => (
                  <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${value}건`, '수집']} />
              <Legend
                formatter={(value) => <span className="text-xs">{value}</span>}
                wrapperStyle={{ fontSize: '11px' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 상세 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">카테고리별 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2">카테고리</th>
                <th className="text-right py-2">수집</th>
                <th className="text-right py-2">조회수</th>
                <th className="text-right py-2">좋아요</th>
                <th className="text-right py-2">점유율</th>
              </tr>
            </thead>
            <tbody>
              {categoryStats.map((cat, idx) => (
                <tr key={cat.category} className="border-b border-border/50">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                      />
                      {cat.category}
                    </div>
                  </td>
                  <td className="text-right py-2">{cat.count}</td>
                  <td className="text-right py-2">
                    {cat.views >= 10000 ? `${(cat.views / 10000).toFixed(1)}만` : cat.views.toLocaleString()}
                  </td>
                  <td className="text-right py-2">
                    {cat.likes >= 10000 ? `${(cat.likes / 10000).toFixed(1)}만` : cat.likes.toLocaleString()}
                  </td>
                  <td className="text-right py-2 font-medium">{cat.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
