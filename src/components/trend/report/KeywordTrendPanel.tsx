import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { ReportData } from './ReportSummaryCards';

interface KeywordTrendPanelProps {
  data: ReportData | null;
  loading: boolean;
}

const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#f472b6', '#8b5cf6'];

export const KeywordTrendPanel = ({ data, loading }: KeywordTrendPanelProps) => {
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);

  // 키워드 빈도 집계
  const keywordStats = useMemo(() => {
    if (!data) return { current: [], rising: [], declining: [] };

    const countKeywords = (items: any[]) => {
      const freq: Record<string, number> = {};
      items.forEach((item) => {
        // trend_keywords는 TEXT[] 컬럼 → 직접 배열 접근
        const keywords: string[] = Array.isArray(item.trend_keywords) ? item.trend_keywords : [];
        keywords.forEach((kw) => {
          if (kw?.trim()) {
            const normalized = kw.trim().toLowerCase();
            freq[normalized] = (freq[normalized] || 0) + 1;
          }
        });
      });
      return freq;
    };

    const currentFreq = countKeywords(data.current);
    const prevFreq = countKeywords(data.previous);

    // 상승/하강 계산
    const allKeywords = new Set([...Object.keys(currentFreq), ...Object.keys(prevFreq)]);
    const changes: { keyword: string; current: number; previous: number; growth: number }[] = [];

    allKeywords.forEach((kw) => {
      const curr = currentFreq[kw] || 0;
      const prev = prevFreq[kw] || 0;
      const growth = prev > 0 ? Math.round(((curr - prev) / prev) * 100) : (curr > 0 ? 999 : 0);
      if (curr > 0 || prev > 0) {
        changes.push({ keyword: kw, current: curr, previous: prev, growth });
      }
    });

    const sorted = [...changes].sort((a, b) => b.current - a.current);
    const rising = changes
      .filter((c) => c.growth > 0 && c.current >= 2)
      .sort((a, b) => b.growth - a.growth)
      .slice(0, 10);
    const declining = changes
      .filter((c) => c.growth < 0)
      .sort((a, b) => a.growth - b.growth)
      .slice(0, 10);

    return { current: sorted.slice(0, 30), rising, declining };
  }, [data]);

  // 키워드별 날짜별 추이 (라인 차트)
  const trendLineData = useMemo(() => {
    if (!data || selectedKeywords.length === 0) return [];

    const dateMap: Record<string, Record<string, number>> = {};
    data.current.forEach((item) => {
      const date = new Date(item.created_at).toISOString().split('T')[0];
      if (!dateMap[date]) dateMap[date] = {};
      const keywords: string[] = Array.isArray(item.trend_keywords) ? item.trend_keywords : [];
      keywords.forEach((kw) => {
        const normalized = kw?.trim().toLowerCase();
        if (normalized && selectedKeywords.includes(normalized)) {
          dateMap[date][normalized] = (dateMap[date][normalized] || 0) + 1;
        }
      });
    });

    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, kwCounts]) => ({
        date: date.slice(5), // MM-DD 형식
        ...kwCounts,
      }));
  }, [data, selectedKeywords]);

  if (loading || !data) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  const maxFreq = keywordStats.current[0]?.current || 1;

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(keyword)
        ? prev.filter((k) => k !== keyword)
        : [...prev.slice(0, 4), keyword]
    );
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        수집된 데이터의 키워드 빈도와 기간별 증감을 기반으로 트렌드 흐름을 보여줍니다.
      </p>
      {/* 1. 태그 클라우드 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">인기 키워드 TOP 30</CardTitle>
          <p className="text-xs text-muted-foreground">클릭하면 추이 차트에 추가됩니다 (최대 5개)</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {keywordStats.current.map(({ keyword, current }) => {
              const ratio = current / maxFreq;
              const sizeClass = ratio > 0.7 ? 'text-base font-bold' : ratio > 0.4 ? 'text-sm font-medium' : 'text-xs';
              const opacityClass = ratio > 0.5 ? 'opacity-100' : ratio > 0.2 ? 'opacity-80' : 'opacity-60';
              const isSelected = selectedKeywords.includes(keyword);

              return (
                <button
                  key={keyword}
                  onClick={() => toggleKeyword(keyword)}
                  className={`px-2.5 py-1 rounded-full transition-colors ${sizeClass} ${opacityClass} ${
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-primary/10 text-primary hover:bg-primary/20'
                  }`}
                >
                  {keyword}
                  <span className="ml-1 text-[10px] opacity-70">{current}</span>
                </button>
              );
            })}
          </div>
          {keywordStats.current.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              선택한 기간에 수집된 키워드가 없습니다.
            </p>
          )}
        </CardContent>
      </Card>

      {/* 2. 상승/하강 키워드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-green-600" />
              상승 키워드 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {keywordStats.rising.map((item, idx) => (
                <div key={item.keyword} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <span>{item.keyword}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.current}건</span>
                    <span className="text-xs font-medium text-green-600">
                      ▲{item.growth > 500 ? 'NEW' : `${item.growth}%`}
                    </span>
                  </div>
                </div>
              ))}
              {keywordStats.rising.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">데이터 부족</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-1.5">
              <TrendingDown className="h-4 w-4 text-red-500" />
              하강 키워드 TOP 10
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {keywordStats.declining.map((item, idx) => (
                <div key={item.keyword} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <span>{item.keyword}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{item.current}건</span>
                    <span className="text-xs font-medium text-red-500">
                      ▼{Math.abs(item.growth)}%
                    </span>
                  </div>
                </div>
              ))}
              {keywordStats.declining.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">데이터 부족</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 3. 키워드 추이 차트 */}
      {selectedKeywords.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              키워드 추이 — {selectedKeywords.join(', ')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {trendLineData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">추이 데이터가 없습니다.</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendLineData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  {selectedKeywords.map((kw, idx) => (
                    <Line
                      key={kw}
                      type="monotone"
                      dataKey={kw}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
