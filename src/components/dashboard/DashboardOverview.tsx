import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Factory, Award, Star, Package, DollarSign, Target } from 'lucide-react';
import { cn } from '@/lib/utils';

type Overview = {
  factory_total: number;
  factory_total_prev: number;
  factory_avg_score: number;
  top_factory_name: string | null;
  top_factory_score: number;
  registered_this_week: number;
  registered_prev_week: number;
  gmv_this_week: number;
  gmv_prev_week: number;
  match_accuracy: number;
  match_accuracy_prev: number;
};

function Delta({ curr, prev, unit = '' }: { curr: number; prev: number; unit?: string }) {
  const c = Number(curr) || 0;
  const p = Number(prev) || 0;
  if (c === 0 && p === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const diff = c - p;
  const pct = p > 0 ? Math.round((100 * diff) / p) : (c > 0 ? 100 : 0);
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-medium',
        diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-green-600' : 'text-destructive'
      )}
    >
      <Icon className="w-3 h-3" />
      {diff > 0 ? '+' : ''}{diff.toLocaleString()}{unit}
      <span className="text-muted-foreground">({pct > 0 ? '+' : ''}{pct}%)</span>
    </span>
  );
}

type Cell = {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  hint?: string;
  delta?: React.ReactNode;
};

function CellView({ icon: Icon, label, value, hint, delta }: Cell) {
  return (
    <div className="flex flex-col gap-1 px-4 py-3 flex-1 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
        <Icon className="w-3.5 h-3.5" />
        <span className="truncate">{label}</span>
      </div>
      <div className="text-xl font-semibold text-foreground truncate">{value}</div>
      <div className="flex items-center justify-between gap-2 min-h-[14px]">
        {hint ? <span className="text-[10px] text-muted-foreground truncate">{hint}</span> : <span />}
        {delta}
      </div>
    </div>
  );
}

export default function DashboardOverview() {
  const { data } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_overview' as any);
      if (error) return null;
      return (data as unknown) as Overview;
    },
    refetchInterval: 60000,
  });

  // TOP 공장: stock_score >= 60 인 공장 수 + 그 평균
  const { data: topStock } = useQuery({
    queryKey: ['dashboard-top-stock-factories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('stock_score')
        .gte('stock_score', 60)
        .is('deleted_at', null);
      if (error) return { count: 0, avg: 0 };
      const scores = (data ?? []).map((r: any) => Number(r.stock_score ?? 0));
      const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
      return { count: scores.length, avg };
    },
    refetchInterval: 60000,
  });

  const d = data ?? ({} as Partial<Overview>);
  const factoryCells: Cell[] = [
    {
      icon: Factory,
      label: '공장 수',
      value: (d.factory_total ?? 0).toLocaleString(),
      hint: 'Alibaba 등록 공장',
      delta: <Delta curr={d.factory_total ?? 0} prev={d.factory_total_prev ?? 0} unit="개" />,
    },
    {
      icon: Award,
      label: '평균 점수',
      value: Number(d.factory_avg_score ?? 0).toFixed(1),
      hint: 'GREATEST(stock, oem)',
    },
    {
      icon: Star,
      label: 'TOP 공장',
      value: (
        <Link to="/factories/top-stock?min=60" className="hover:text-primary transition-colors">
          {(topStock?.count ?? 0).toLocaleString()}개
        </Link>
      ),
      hint: `평균 ${Number(topStock?.avg ?? 0).toFixed(1)}점 (stock_score ≥ 60, 클릭하여 목록 보기)`,
    },
  ];
  const kpiCells: Cell[] = [
    {
      icon: Package,
      label: '신규 등록',
      value: `${(d.registered_this_week ?? 0).toLocaleString()}건`,
      hint: '이번 주',
      delta: <Delta curr={d.registered_this_week ?? 0} prev={d.registered_prev_week ?? 0} unit="건" />,
    },
    {
      icon: DollarSign,
      label: 'GMV',
      value: `$${(d.gmv_this_week ?? 0).toLocaleString()}`,
      hint: '이번 주',
      delta: <Delta curr={d.gmv_this_week ?? 0} prev={d.gmv_prev_week ?? 0} unit="$" />,
    },
    {
      icon: Target,
      label: '매칭 정확도',
      value: `${Number(d.match_accuracy ?? 0).toFixed(1)}%`,
      hint: '이번 주 매칭',
      delta: <Delta curr={Number(d.match_accuracy ?? 0)} prev={Number(d.match_accuracy_prev ?? 0)} unit="%p" />,
    },
  ];

  return (
    <Card className="mb-4 overflow-hidden rounded-md">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <span className="text-xs font-semibold text-foreground">운영 현황</span>
        <span className="text-[10px] text-muted-foreground">공장 자산 · 이번 주 성과</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-x divide-y md:divide-y-0 divide-border">
        {/* 공장 자산 영역 */}
        {factoryCells.map((c) => (
          <div key={c.label} className="bg-card">
            <CellView {...c} />
          </div>
        ))}
        {/* 이번 주 성과 영역 — 강한 좌측 구분선 */}
        {kpiCells.map((c, i) => (
          <div key={c.label} className={cn('bg-muted/10', i === 0 && 'lg:border-l-2 lg:border-l-primary/30')}>
            <CellView {...c} />
          </div>
        ))}
      </div>
    </Card>
  );
}
