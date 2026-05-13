import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

type Coverage = {
  total_targets: number;
  matched_targets: number;
  match_rate: number;
  categories: Array<{ category: string; total: number; matched: number; rate: number }>;
  avg_candidates: number;
  top_score: number;
  top_target: string;
};

export default function DashboardCoverage() {
  const { data: cov } = useQuery({
    queryKey: ['dashboard-coverage'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_target_coverage' as any);
      if (error) return null;
      return (data as unknown) as Coverage;
    },
    refetchInterval: 60000,
  });

  if (!cov || cov.total_targets === 0) {
    return (
      <Card className="mb-4 rounded-md">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">📊 타깃 매칭 커버리지</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            활성 타깃이 없습니다. <a href="/products/target-fg" className="text-primary hover:underline">/products/target-fg</a>에서 타깃을 정의해주세요.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4 rounded-md">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>📊 타깃 매칭 커버리지</span>
          <span className="text-xs font-normal text-muted-foreground">
            {cov.matched_targets} / {cov.total_targets}개 매칭 성공 ({cov.match_rate}%)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={cov.match_rate} className="h-2" />

        {cov.categories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {cov.categories.slice(0, 6).map((c, i) => (
              <div key={i} className="border rounded-md px-3 py-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium truncate">{c.category}</span>
                  <span className="text-muted-foreground shrink-0 ml-2">
                    {c.rate}% ({c.matched}/{c.total})
                  </span>
                </div>
                <Progress value={c.rate} className="h-1.5" />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
          <span>
            평균 후보: <strong className="text-foreground">{cov.avg_candidates}건/타깃</strong>
          </span>
          {cov.top_target && (
            <span className="truncate">
              최고점: <strong className="text-foreground">{cov.top_target}</strong> ({Number(cov.top_score).toFixed(2)})
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
