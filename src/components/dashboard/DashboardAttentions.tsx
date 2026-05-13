import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

type Alert = {
  level: 'info' | 'warning' | 'error';
  icon: string;
  message: string;
  action_label: string;
  action_route: string;
};

export default function DashboardAttentions() {
  const { data: alerts = [] } = useQuery({
    queryKey: ['dashboard-attentions'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dashboard_attentions' as any);
      if (error) return [];
      return ((data as unknown) as Alert[]) || [];
    },
    refetchInterval: 60000,
  });

  if (alerts.length === 0) {
    return (
      <Card className="mb-4 rounded-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">⚠️ 주목 사항</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">✅ 시스템 정상. 주목할 항목 없음.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 rounded-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">⚠️ 주목 사항 ({alerts.length}건)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {alerts.map((a, i) => (
          <div
            key={i}
            className={cn(
              'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs',
              a.level === 'error' && 'border-destructive/30 bg-destructive/5',
              a.level === 'warning' && 'border-orange-300 bg-orange-50',
              a.level === 'info' && 'border-border bg-muted/30'
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0">{a.icon}</span>
              <span className="truncate">{a.message}</span>
            </div>
            <Link to={a.action_route} className="shrink-0 text-xs font-medium text-primary hover:underline">
              {a.action_label} →
            </Link>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
