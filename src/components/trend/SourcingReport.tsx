import { useTrend } from '@/contexts/TrendContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CATEGORY_COLORS } from '@/data/trendMockData';
import { Download, TrendingUp, Package, DollarSign, Tag } from 'lucide-react';

const SourcingReport = () => {
  const { trends, scoredProducts, threshold, registrationList } = useTrend();

  const aboveThreshold = scoredProducts.filter(p => p.computed_score >= threshold);
  const avgMargin = scoredProducts.length > 0 ? Math.round(scoredProducts.reduce((s, p) => s + p.margin_pct, 0) / scoredProducts.length) : 0;

  // Category distribution
  const catCounts: Record<string, number> = {};
  aboveThreshold.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const pieData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));

  // Top category
  const topCat = pieData.sort((a, b) => b.value - a.value)[0]?.name || '-';

  const exportCSV = () => {
    const headers = ['순위', '상품명', '매칭 키워드', '총점', '마진%'];
    const rows = aboveThreshold.slice(0, 20).map((p, i) => [i + 1, p.name_en, p.keyword, p.computed_score, p.margin_pct]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sourcing-report.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const summaryCards = [
    { label: '추적 키워드', value: trends.length, icon: TrendingUp, color: '#4f46e5' },
    { label: '추천 상품', value: aboveThreshold.length, icon: Package, color: '#16a34a' },
    { label: '평균 마진', value: `${avgMargin}%`, icon: DollarSign, color: '#d97706' },
    { label: '주간 TOP 카테고리', value: topCat, icon: Tag, color: '#ec4899' },
  ];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(c => (
          <Card key={c.label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${c.color}15` }}>
                <c.icon className="w-5 h-5" style={{ color: c.color }} />
              </div>
              <div>
                <div className="text-xs text-[#6d7175]">{c.label}</div>
                <div className="text-xl font-bold text-[#202223]">{c.value}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">카테고리 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" label={({ name, value }) => `${name} (${value})`}>
                    {pieData.map(entry => (
                      <Cell key={entry.name} fill={CATEGORY_COLORS[entry.name] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Top 5 Table */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">TOP 추천 상품</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="w-4 h-4" /> 리포트 내보내기 (CSV)
            </Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-[#6d7175] border-b border-border">
                  <th className="text-left py-2 font-medium">#</th>
                  <th className="text-left py-2 font-medium">상품명</th>
                  <th className="text-left py-2 font-medium">키워드</th>
                  <th className="text-center py-2 font-medium">총점</th>
                  <th className="text-center py-2 font-medium">마진</th>
                  <th className="text-center py-2 font-medium">등록</th>
                </tr>
              </thead>
              <tbody>
                {aboveThreshold.slice(0, 5).map((p, i) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-gray-50/50">
                    <td className="py-2.5 font-bold text-[#6d7175]">{i + 1}</td>
                    <td className="py-2.5">
                      <div className="font-medium text-[#202223]">{p.name_ko}</div>
                      <div className="text-xs text-[#6d7175]">{p.name_en}</div>
                    </td>
                    <td className="py-2.5 text-xs">{p.keyword}</td>
                    <td className="py-2.5 text-center">
                      <span className="font-bold" style={{ color: p.computed_score >= 80 ? '#16a34a' : '#d97706' }}>{p.computed_score}</span>
                    </td>
                    <td className="py-2.5 text-center text-green-600 font-medium">{p.margin_pct}%</td>
                    <td className="py-2.5 text-center">
                      {registrationList.includes(p.id) ? '✅' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SourcingReport;
