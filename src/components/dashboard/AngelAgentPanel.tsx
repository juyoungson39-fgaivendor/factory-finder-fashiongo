import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Stage = {
  stage_no: number;
  name: string;
  description: string | null;
  page_route: string | null;
  automation_level: 'auto' | 'semi' | 'manual' | null;
  status: 'pending' | 'running' | 'done' | 'error';
  last_run_at: string | null;
  current_item_count: number | null;
};

const FUTURE_ROUTES = new Set<string>([]);

export default function AngelAgentPanel() {
  const navigate = useNavigate();

  const { data: stages = [] } = useQuery<Stage[]>({
    queryKey: ['angel-agent-7stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angel_agent_stages' as any)
        .select('*')
        .order('stage_no');
      if (error) {
        console.warn('[AngelAgentPanel] stages fetch failed:', error.message);
        return [];
      }
      return (data as unknown as Stage[]) || [];
    },
    refetchInterval: 30000,
  });

  const { data: counts = {} } = useQuery<Record<string, number>>({
    queryKey: ['angel-agent-7stages-counts'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_angel_agent_counts' as any);
      if (error) {
        console.warn('[AngelAgentPanel] counts fetch failed (graceful):', error.message);
        return {};
      }
      return (data as Record<string, number>) || {};
    },
    refetchInterval: 30000,
  });

  const queryClient = useQueryClient();

  const handleRun = async () => {
    // Stage 3: 매칭 실행 (활성 타겟이 있을 때)
    const { data: activeTargets } = await supabase
      .from('target_products' as any)
      .select('id')
      .eq('status', 'active')
      .limit(1);

    if (activeTargets && activeTargets.length > 0) {
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 3);
      try {
        const { data, error } = await supabase.functions.invoke('run-matching', { body: {} });
        if (error || !(data as any)?.ok) throw new Error(error?.message || 'unknown');
        toast.success(`✅ 매칭 ${(data as any).inserted}건 신규/갱신 (전체 ${(data as any).total} 평가)`);
        await supabase.from('angel_agent_stages' as any).update({
          status: 'done',
          last_run_at: new Date().toISOString(),
        }).eq('stage_no', 3);
      } catch (e: any) {
        await supabase.from('angel_agent_stages' as any).update({ status: 'error' }).eq('stage_no', 3);
        toast.error('매칭 실패: ' + e.message);
      }
      queryClient.invalidateQueries({ queryKey: ['angel-agent-7stages'] });
      queryClient.invalidateQueries({ queryKey: ['angel-agent-7stages-counts'] });
      navigate('/matches');
      return;
    }

    // 활성 타겟 없으면 첫 번째 pending 단계로 이동 (기존 동작)
    const firstPending = stages.find((s) => s.status === 'pending');
    if (firstPending?.page_route && !FUTURE_ROUTES.has(firstPending.page_route)) {
      navigate(firstPending.page_route);
    } else {
      toast.warning('활성 타깃 상품이 없어 Stage 3 매칭 건너뜀. 타깃 정의 후 다시 실행하세요.');
    }
  };

  if (stages.length === 0) {
    return (
      <Card className="p-4 mb-4">
        <p className="text-sm text-muted-foreground">
          Angel Agent 단계 로딩 중... (DB 시드 미적용 시 빈 카드 표시)
        </p>
      </Card>
    );
  }

  const lastRunAts = stages
    .map((s) => (s.last_run_at ? new Date(s.last_run_at).getTime() : 0))
    .filter((n) => n > 0);
  const lastRunLabel = lastRunAts.length
    ? new Date(Math.max(...lastRunAts)).toLocaleString('ko-KR')
    : '실행하기 버튼을 눌러주세요';

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold">Angel Agent</h3>
            <Badge variant="secondary" className="text-[10px]">7단계 워크플로</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            마지막 실행: {lastRunLabel}
          </p>
        </div>
        <Button size="sm" onClick={handleRun}>실행하기</Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stages.map((s) => {
          const count = counts[`s${s.stage_no}`] ?? 0;
          const isFuture = s.page_route ? FUTURE_ROUTES.has(s.page_route) : false;

          const inner = (
            <div
              className={cn(
                'border rounded-lg p-3 h-full flex flex-col gap-1.5 transition-colors',
                isFuture
                  ? 'opacity-60 bg-muted/30 cursor-not-allowed'
                  : 'hover:border-primary hover:bg-accent/40 cursor-pointer',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground">
                  {s.stage_no}
                </span>
                <span className="text-[10px]">
                  {s.automation_level === 'auto' && '🤖'}
                  {s.automation_level === 'semi' && '🤝'}
                  {s.automation_level === 'manual' && '✋'}
                </span>
              </div>
              <p className="text-xs font-medium leading-tight">{s.name}</p>
              <div className="flex items-center justify-between mt-auto">
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded',
                    s.status === 'done' && 'bg-green-100 text-green-700',
                    s.status === 'running' && 'bg-orange-100 text-orange-600',
                    s.status === 'error' && 'bg-red-100 text-red-700',
                    s.status === 'pending' && 'bg-muted text-muted-foreground',
                  )}
                >
                  {s.status === 'pending'
                    ? '대기'
                    : s.status === 'running'
                      ? '진행중'
                      : s.status === 'done'
                        ? '완료'
                        : '오류'}
                </span>
                {count > 0 && (
                  <span className="text-[10px] font-bold text-primary">{count}건</span>
                )}
              </div>
              {isFuture && (
                <p className="text-[9px] text-muted-foreground">🚧 작업 예정</p>
              )}
            </div>
          );

          return isFuture || !s.page_route ? (
            <div key={s.stage_no}>{inner}</div>
          ) : (
            <Link key={s.stage_no} to={s.page_route} className="no-underline text-foreground">
              {inner}
            </Link>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t text-[10px] text-muted-foreground">
        <span>🤖 자동</span>
        <span>🤝 반자동</span>
        <span>✋ 수동</span>
        <span>🚧 작업 예정</span>
      </div>
    </Card>
  );
}
