import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Eye, Heart, MessageCircle, BarChart3 } from 'lucide-react';

export interface ReportData {
  current: any[];
  previous: any[];
  periodDays: number;
}

interface ReportSummaryCardsProps {
  data: ReportData | null;
  loading: boolean;
}

export const ReportSummaryCards = ({ data, loading }: ReportSummaryCardsProps) => {
  if (loading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-4 bg-muted rounded w-20 mb-2" />
              <div className="h-7 bg-muted rounded w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const { current, previous } = data;

  const metrics = [
    {
      label: '총 수집',
      value: current.length,
      prevValue: previous.length,
      icon: BarChart3,
      format: (v: number) => `${v.toLocaleString()}건`,
    },
    {
      label: '조회수',
      value: current.reduce((sum, item) => sum + (item.view_count || 0), 0),
      prevValue: previous.reduce((sum, item) => sum + (item.view_count || 0), 0),
      icon: Eye,
      format: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString(),
    },
    {
      label: '좋아요',
      value: current.reduce((sum, item) => sum + (item.like_count || 0), 0),
      prevValue: previous.reduce((sum, item) => sum + (item.like_count || 0), 0),
      icon: Heart,
      format: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString(),
    },
    {
      label: '댓글',
      value: current.reduce((sum, item) => sum + (item.comment_count || 0), 0),
      prevValue: previous.reduce((sum, item) => sum + (item.comment_count || 0), 0),
      icon: MessageCircle,
      format: (v: number) => v >= 10000 ? `${(v / 10000).toFixed(1)}만` : v.toLocaleString(),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => {
        const changeRate = metric.prevValue > 0
          ? Math.round(((metric.value - metric.prevValue) / metric.prevValue) * 100)
          : metric.value > 0 ? 100 : 0;
        const isUp = changeRate >= 0;

        return (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{metric.label}</span>
                <metric.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold">{metric.format(metric.value)}</span>
                <span className={`text-xs font-medium flex items-center gap-0.5 ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                  {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {isUp ? '▲' : '▼'}{Math.abs(changeRate)}%
                </span>
              </div>
              <span className="text-[10px] text-muted-foreground">전기간 대비</span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
