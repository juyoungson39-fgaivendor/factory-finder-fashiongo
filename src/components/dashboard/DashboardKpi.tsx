import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Kpi = {
  registered_this_week: number;
  registered_prev_week: number;
  gmv_this_week: number;
  gmv_prev_week: number;
  match_accuracy: number;
  match_accuracy_prev: number;
};

function Delta({
  curr,
  prev,
  unit = '',
  positive = true,
}: {
  curr: number;
  prev: number;
  unit?: string;
  positive?: boolean;
}) {
  if (prev === 0 && curr === 0) return <span className="text-xs text-muted-foreground">-</span>;
  const diff = Number(curr) - Number(prev);
  const pct = prev > 0 ? Math.round((100 * diff) / prev) : 100;
  const isGood = positive ? diff >= 0 : diff <= 0;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        diff === 0 ? 'text-muted-foreground' : isGood ? 'text-green-600' : 'text-destructive'
      )}
    >
      <Icon className="w-3 h-3" />
      {diff > 0 ? '+' : ''}
      {typeof diff === 'number' && Number.isFinite(diff) ? diff.toLocaleString() : diff}
      {unit} ({pct > 0 ? '+' : ''}
      {pct}%)
    </span>
  );
}

export default function DashboardKpi() {
  const { data: kpi } = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_kpi' as any);
      if (error) return null;
      return (data as unknown) as Kpi;
    },
    refetchInterval: 60000,
  });

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">📈 이번 주 성과</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="border rounded-md px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">🆕 신규 등록</p>
            <p className="text-2xl font-semibold">{kpi?.registered_this_week ?? 0} <span className="text-sm font-normal text-muted-foreground">건</span></p>
            <Delta curr={kpi?.registered_this_week ?? 0} prev={kpi?.registered_prev_week ?? 0} unit="건" />
          </div>
          <div className="border rounded-md px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">💰 GMV</p>
            <p className="text-2xl font-semibold">${(kpi?.gmv_this_week ?? 0).toLocaleString()}</p>
            <Delta curr={kpi?.gmv_this_week ?? 0} prev={kpi?.gmv_prev_week ?? 0} unit="$" />
          </div>
          <div className="border rounded-md px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">📊 매칭 정확도</p>
            <p className="text-2xl font-semibold">{kpi?.match_accuracy ?? 0} <span className="text-sm font-normal text-muted-foreground">%</span></p>
            <Delta curr={kpi?.match_accuracy ?? 0} prev={kpi?.match_accuracy_prev ?? 0} unit="%p" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
