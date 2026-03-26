import { useState } from 'react';
import { useTrend } from '@/contexts/TrendContext';
import TrendScoreCard from './TrendScoreCard';
import { CATEGORY_COLORS } from '@/data/trendMockData';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, TrendingUp } from 'lucide-react';
import { GoogleLogo, InstagramLogo, AmazonLogo } from './ChannelLogos';

const TrendDashboard = () => {
  const { trends, addTrend, selectedKeyword } = useTrend();
  const [newKeyword, setNewKeyword] = useState('');
  const [channel, setChannel] = useState('all');
  const [loading, setLoading] = useState(false);

  const handleAnalyze = () => {
    if (!newKeyword.trim()) return;
    setLoading(true);
    setTimeout(() => {
      const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
      const g = rand(50, 95);
      const s = rand(50, 95);
      const sl = rand(50, 95);
      addTrend({
        keyword: newKeyword.trim().toLowerCase(),
        trend_score: Math.round((g + s + sl) / 3),
        google: g, social: s, sales: sl,
        change: rand(-10, 20),
        category: ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Accessories'][rand(0, 4)],
        history: Array.from({ length: 30 }, () => rand(40, 95)),
      });
      setNewKeyword('');
      setLoading(false);
    }, 1500);
  };

  // Chart data
  const visibleTrends = selectedKeyword ? trends.filter(t => t.keyword === selectedKeyword) : trends.slice(0, 4);
  const chartData = Array.from({ length: 30 }, (_, i) => {
    const point: Record<string, number | string> = { day: `D${i + 1}` };
    visibleTrends.forEach(t => {
      point[t.keyword] = t.history?.[i] ?? t.trend_score;
    });
    return point;
  });

  // Channel breakdown
  const channelData = trends.map(t => ({
    keyword: t.keyword,
    google: t.google,
    social: t.social,
    sales: t.sales,
    total: t.trend_score,
  }));

  return (
    <div className="space-y-6">
      {/* Trend Score Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[#6d7175] mb-3 flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4" /> 트렌드 키워드
          {selectedKeyword && (
            <button onClick={() => {}} className="ml-2 text-xs text-[#4f46e5] underline">
              필터 해제
            </button>
          )}
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {trends.map(t => <TrendScoreCard key={t.keyword} trend={t} />)}
        </div>
      </div>

      {/* Input Panel */}
      <div className="flex gap-2 items-end p-4 rounded-xl border border-border bg-card">
        <div className="flex-1">
          <label className="text-xs font-medium text-[#6d7175] mb-1 block">키워드 직접 입력</label>
          <Input
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            placeholder="e.g. cargo pants, satin dress"
            onKeyDown={e => e.key === 'Enter' && handleAnalyze()}
          />
        </div>
        <div className="w-40">
          <label className="text-xs font-medium text-[#6d7175] mb-1 block">채널</label>
          <Select value={channel} onValueChange={setChannel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="google">Google Trends</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="pinterest">Pinterest</SelectItem>
              <SelectItem value="amazon">Amazon</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleAnalyze} disabled={loading || !newKeyword.trim()}>
          <Search className="w-4 h-4" /> 트렌드 분석 실행
        </Button>
      </div>

      {loading && (
        <div className="grid grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      )}

      {/* Trend Chart */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-[#202223] mb-3">30일 검색량 트렌드</h3>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={4} />
              <YAxis tick={{ fontSize: 10 }} domain={[30, 100]} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {visibleTrends.map(t => (
                <Line key={t.keyword} type="monotone" dataKey={t.keyword} stroke={CATEGORY_COLORS[t.category] || '#6b7280'}
                  strokeWidth={2} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Channel Breakdown Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <h3 className="text-sm font-semibold text-[#202223] p-4 pb-2">채널별 점수 분석</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-[#6d7175] text-xs">
              <th className="text-left px-4 py-2 font-medium">키워드</th>
              <th className="text-center px-4 py-2 font-medium"><span className="inline-flex items-center gap-1"><GoogleLogo size={14} /> Google</span></th>
              <th className="text-center px-4 py-2 font-medium"><span className="inline-flex items-center gap-1"><InstagramLogo size={14} /> Instagram</span></th>
              <th className="text-center px-4 py-2 font-medium"><span className="inline-flex items-center gap-1"><AmazonLogo size={14} /> Amazon</span></th>
              <th className="text-center px-4 py-2 font-medium">종합</th>
            </tr>
          </thead>
          <tbody>
            {channelData.map(row => (
              <tr key={row.keyword} className="border-t border-border hover:bg-gray-50/50">
                <td className="px-4 py-2.5 font-medium text-[#202223]">{row.keyword}</td>
                <td className="text-center px-4 py-2.5">{row.google}</td>
                <td className="text-center px-4 py-2.5">{row.social}</td>
                <td className="text-center px-4 py-2.5">{row.sales}</td>
                <td className="text-center px-4 py-2.5">
                  <span className="font-bold" style={{ color: row.total >= 80 ? '#16a34a' : row.total >= 70 ? '#d97706' : '#dc2626' }}>
                    {row.total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TrendDashboard;
