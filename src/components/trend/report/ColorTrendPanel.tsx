import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { ReportData } from './ReportSummaryCards';

// 색상명 → HEX 매핑
const COLOR_HEX: Record<string, string> = {
  black:  '#1a1a1a',
  white:  '#f5f5f5',
  red:    '#ef4444',
  blue:   '#3b82f6',
  pink:   '#ec4899',
  green:  '#22c55e',
  beige:  '#d4b896',
  brown:  '#92400e',
  gray:   '#6b7280',
  grey:   '#6b7280',
  navy:   '#1e3a5f',
  yellow: '#eab308',
  orange: '#f97316',
  purple: '#a855f7',
  cream:  '#fffdd0',
  khaki:  '#bdb76b',
  tan:    '#d2b48c',
  ivory:  '#fffff0',
  camel:  '#c19a6b',
  olive:  '#808000',
  rust:   '#b7410e',
  sage:   '#87ae73',
  lavender: '#e6e6fa',
  coral:  '#ff7f7f',
};

interface ColorTrendPanelProps {
  data: ReportData | null;
  loading: boolean;
}

export const ColorTrendPanel = ({ data, loading }: ColorTrendPanelProps) => {

  const colorStats = useMemo(() => {
    if (!data) return [];
    const freq: Record<string, number> = {};

    // trend_analyses.source_data.colors에서 색상 데이터 추출
    data.current.forEach((item) => {
      const colors = item.source_data?.colors;
      if (Array.isArray(colors)) {
        colors.forEach((color: string) => {
          const normalized = color?.toLowerCase().trim();
          if (normalized) freq[normalized] = (freq[normalized] || 0) + 1;
        });
      }
    });

    const total = Object.values(freq).reduce((sum, v) => sum + v, 0);
    return Object.entries(freq)
      .map(([color, count]) => ({
        color,
        count,
        share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        hex: COLOR_HEX[color] || '#94a3b8',
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (loading || !data) {
    return <div className="animate-pulse h-64 bg-muted rounded-lg" />;
  }

  if (colorStats.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            색상 데이터가 아직 충분하지 않습니다.
          </p>
          <p className="text-xs text-muted-foreground">
            새로 수집·분석되는 트렌드부터 색상 정보가 포함됩니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  const chartData = colorStats.slice(0, 10);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* 도넛 차트 + 색상 스와치 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">색상 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="color"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.color}
                    fill={entry.hex}
                    stroke={entry.color === 'white' || entry.color === 'cream' || entry.color === 'ivory' ? '#e5e7eb' : 'transparent'}
                    strokeWidth={1}
                  />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => [`${value}건`, '수집']} />
            </PieChart>
          </ResponsiveContainer>

          {/* 색상 스와치 범례 */}
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {chartData.map((c) => (
              <div key={c.color} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm border border-border/50 shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-xs">{c.color} {c.share}%</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 상세 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">색상별 상세</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2">색상</th>
                <th className="text-right py-2">수집건수</th>
                <th className="text-right py-2">점유율</th>
              </tr>
            </thead>
            <tbody>
              {colorStats.map((c) => (
                <tr key={c.color} className="border-b border-border/50">
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-sm border border-border/50 shrink-0"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.color}
                    </div>
                  </td>
                  <td className="text-right py-2">{c.count}</td>
                  <td className="text-right py-2 font-medium">{c.share}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
