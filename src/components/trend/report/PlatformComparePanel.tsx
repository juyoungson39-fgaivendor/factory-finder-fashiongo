import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Flame } from 'lucide-react';
import type { ReportData } from './ReportSummaryCards';

interface PlatformComparePanelProps {
  data: ReportData | null;
  loading: boolean;
}

const PLATFORM_COLORS: Record<string, string> = {
  tiktok:       '#6366f1',
  instagram:    '#f59e0b',
  vogue:        '#000000',
  elle:         '#dc2626',
  wwd:          '#1f2937',
  hypebeast:    '#15803d',
  highsnobiety: '#7e22ce',
  footwearnews: '#b45309',
  google:       '#f472b6',
  shein:        '#8b5cf6',
  amazon:       '#ef4444',
  pinterest:    '#ec4899',
  fashiongo:    '#06b6d4',
};

export const PlatformComparePanel = ({ data, loading }: PlatformComparePanelProps) => {

  // 플랫폼별 집계
  const platformStats = useMemo(() => {
    if (!data) return [];
    const stats: Record<string, { count: number; views: number; likes: number }> = {};
    data.current.forEach((item) => {
      const platform = (item.platform || 'unknown').toLowerCase();
      if (!stats[platform]) stats[platform] = { count: 0, views: 0, likes: 0 };
      stats[platform].count++;
      stats[platform].views += item.view_count || 0;
      stats[platform].likes += item.like_count || 0;
    });
    return Object.entries(stats)
      .map(([platform, s]) => ({ platform, ...s }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  // 크로스 플랫폼 키워드 (2개 이상 플랫폼에 등장하는 키워드)
  const crossPlatformKeywords = useMemo(() => {
    if (!data) return [];

    const platformKeywords: Record<string, Set<string>> = {};
    data.current.forEach((item) => {
      const platform = (item.platform || 'unknown').toLowerCase();
      if (!platformKeywords[platform]) platformKeywords[platform] = new Set();
      const keywords: string[] = Array.isArray(item.trend_keywords) ? item.trend_keywords : [];
      keywords.forEach((kw) => {
        if (kw?.trim()) platformKeywords[platform].add(kw.trim().toLowerCase());
      });
    });

    const allKeywords = new Set<string>();
    Object.values(platformKeywords).forEach((s) => s.forEach((kw) => allKeywords.add(kw)));

    const crossKeywords: { keyword: string; platforms: string[]; count: number }[] = [];
    allKeywords.forEach((kw) => {
      const platforms = Object.entries(platformKeywords)
        .filter(([, kwSet]) => kwSet.has(kw))
        .map(([platform]) => platform);
      if (platforms.length >= 2) {
        const count = data.current.filter((item) => {
          const keywords: string[] = Array.isArray(item.trend_keywords) ? item.trend_keywords : [];
          return keywords.some((k) => k?.trim().toLowerCase() === kw);
        }).length;
        crossKeywords.push({ keyword: kw, platforms, count });
      }
    });

    return crossKeywords
      .sort((a, b) => b.platforms.length - a.platforms.length || b.count - a.count)
      .slice(0, 15);
  }, [data]);

  if (loading || !data) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      {/* 1. 플랫폼별 수집 현황 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">플랫폼별 수집 현황</CardTitle>
        </CardHeader>
        <CardContent>
          {platformStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">데이터가 없습니다.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, platformStats.length * 45)}>
              <BarChart data={platformStats} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="platform" tick={{ fontSize: 12 }} width={75} />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === 'count') return [`${value}건`, '수집'];
                    return [value.toLocaleString(), name];
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {platformStats.map((entry) => (
                    <Cell
                      key={entry.platform}
                      fill={PLATFORM_COLORS[entry.platform] || '#94a3b8'}
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 2. 크로스 플랫폼 트렌드 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <Flame className="h-4 w-4 text-orange-500" />
            크로스 플랫폼 트렌드
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            2개 이상 플랫폼에서 동시에 뜨는 키워드 — 소싱 신뢰도 높음
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {crossPlatformKeywords.map((item, idx) => (
              <div key={item.keyword} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                  <span className="text-sm font-medium">{item.keyword}</span>
                </div>
                <div className="flex items-center gap-2">
                  {item.platforms.map((p) => (
                    <span
                      key={p}
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${PLATFORM_COLORS[p] || '#94a3b8'}20`,
                        color: PLATFORM_COLORS[p] || '#94a3b8',
                      }}
                    >
                      {p}
                    </span>
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">{item.count}건</span>
                </div>
              </div>
            ))}
            {crossPlatformKeywords.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                크로스 플랫폼 트렌드가 아직 없습니다.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
