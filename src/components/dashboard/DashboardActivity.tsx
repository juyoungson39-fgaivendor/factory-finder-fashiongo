import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

type RunRow = {
  id: string;
  triggered_at: string;
  status: string;
  stages_executed: number[] | null;
  results: Record<string, any> | null;
  error_message: string | null;
};

export default function DashboardActivity() {
  const { data: runs = [] } = useQuery({
    queryKey: ['dashboard-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angel_agent_runs' as any)
        .select('*')
        .order('triggered_at', { ascending: false })
        .limit(10);
      if (error) return [];
      return ((data as unknown) as RunRow[]) || [];
    },
    refetchInterval: 30000,
  });

  if (runs.length === 0) {
    return (
      <Card className="mb-4 rounded-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📜 최근 활동 로그</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">아직 실행 기록 없음. 「실행하기」 클릭 시 여기 기록됩니다.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 rounded-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">📜 최근 활동 로그</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {runs.map((r) => {
          const icon =
            r.status === 'completed' ? '✅' : r.status === 'failed' ? '❌' : r.status === 'partial' ? '⚠️' : '⏳';
          const results = r.results || {};
          const summary = Object.entries(results)
            .map(([k, v]) => `${k}:${v}`)
            .join(' · ');
          return (
            <div key={r.id} className="flex items-start gap-3 text-xs border-b last:border-b-0 pb-2 last:pb-0">
              <span className="shrink-0">{icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>{formatDistanceToNow(new Date(r.triggered_at), { addSuffix: true, locale: ko })}</span>
                  <span className="text-[10px] uppercase tracking-wide">{r.status}</span>
                </div>
                <div className="text-foreground mt-0.5 truncate">
                  {summary || `Stage ${(r.stages_executed || []).join(',') || '-'} 실행`}
                  {r.error_message && <span className="text-destructive"> — {r.error_message}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
