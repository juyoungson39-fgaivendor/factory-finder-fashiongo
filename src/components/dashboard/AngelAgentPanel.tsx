import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertCircle, Clock, Play } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MatchingResultDialog, type RunSummary } from '@/components/matching/MatchingResultDialog';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

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
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchRunId, setMatchRunId] = useState<string | null>(null);
  const [matchSummary, setMatchSummary] = useState<RunSummary | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStageNo, setCurrentStageNo] = useState<number | null>(null);
  const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const FALLBACK_STAGES: Stage[] = [
    { stage_no: 1, name: '트렌드 수집', description: null, page_route: '/trend-recommendation', automation_level: 'auto', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 2, name: 'AI 타깃 추천', description: null, page_route: '/target-products', automation_level: 'semi', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 3, name: '매칭', description: null, page_route: '/matches', automation_level: 'auto', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 4, name: '공장 검증', description: null, page_route: '/factories', automation_level: 'semi', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 5, name: '상품 컨펌', description: null, page_route: '/sourceable-agent', automation_level: 'manual', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 6, name: 'FG 변환', description: null, page_route: '/ai-vendors', automation_level: 'semi', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 7, name: 'FG 등록', description: null, page_route: '/ai-vendors', automation_level: 'manual', status: 'pending', last_run_at: null, current_item_count: null },
  ];

  const { data: stages = FALLBACK_STAGES } = useQuery<Stage[]>({
    queryKey: ['angel-agent-7stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('angel_agent_stages' as any)
        .select('*')
        .order('stage_no');
      if (error) {
        console.warn('[AngelAgentPanel] stages fetch failed, using fallback:', error.message);
        return FALLBACK_STAGES;
      }
      const rows = (data as unknown as Stage[]) || [];
      return rows.length > 0 ? rows : FALLBACK_STAGES;
    },
    refetchInterval: 30000,
    placeholderData: FALLBACK_STAGES,
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

  const { data: recentRuns = [] } = useQuery<any[]>({
    queryKey: ['e2e-stage-runs-recent'],
    queryFn: async () => {
      const { data } = await supabase
        .from('e2e_stage_runs' as any)
        .select('run_id, stage_no, status, started_at, summary')
        .order('started_at', { ascending: false })
        .limit(10);
      return (data as any[]) ?? [];
    },
    refetchInterval: 15000,
  });

  const runMatching = async (scoreThreshold = 0.6) => {
    toast('매칭 실행 중...');
    const { data, error } = await supabase.functions.invoke('run-matching', {
      body: { factory_threshold: 60, score_threshold: scoreThreshold },
    });
    if (error || !(data as any)?.ok) {
      toast.error('매칭 실행 실패: ' + (error?.message ?? 'unknown'));
      return null;
    }
    const d = data as any;
    setMatchRunId(d.run_id);
    setMatchSummary(d.summary as RunSummary);
    setMatchOpen(true);
    queryClient.invalidateQueries({ queryKey: ['e2e-stage-runs-recent'] });
    return d;
  };


  const handleRun = async () => {
    setIsRunning(true);
    setRunStartedAt(Date.now());
    setElapsedSec(0);
    const elapsedTimer = setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: runRow } = await supabase
      .from('angel_agent_runs' as any)
      .insert({
        triggered_by: 'manual',
        triggered_by_user_id: user?.id,
        status: 'running',
      } as any)
      .select('id')
      .single();
    const runId = (runRow as any)?.id as string | undefined;

    const stagesExecuted: number[] = [];
    const results: Record<string, any> = {};
    const startedAt = Date.now();
    let hasError = false;
    let errorMessage = '';

    try {
      // Stage 1: 트렌드 수집
      setCurrentStageNo(1);
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 1);
      const trendFns = ['collect-magazine-trends', 'collect-sns-trends', 'collect-pinterest-image-trends'];
      const trendResults = await Promise.allSettled(
        trendFns.map((fn) =>
          supabase.functions.invoke(fn, { body: { user_id: user?.id } })
        )
      );
      const trendSuccess = trendResults.filter((r) => r.status === 'fulfilled').length;
      results.trends = trendSuccess;
      stagesExecuted.push(1);
      await supabase
        .from('angel_agent_stages' as any)
        .update({ status: trendSuccess > 0 ? 'done' : 'error', last_run_at: new Date().toISOString() })
        .eq('stage_no', 1);

      // Stage 2: AI 타깃 추천 (활성 0건일 때만)
      setCurrentStageNo(2);
      const { count: activeTargetCount } = await supabase
        .from('target_products' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      if ((activeTargetCount ?? 0) === 0) {
        await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 2);
        try {
          const { data } = await supabase.functions.invoke('suggest-target-products', { body: {} });
          results.targets_suggested = (data as any)?.inserted ?? 0;
          stagesExecuted.push(2);
          await supabase
            .from('angel_agent_stages' as any)
            .update({ status: 'done', last_run_at: new Date().toISOString() })
            .eq('stage_no', 2);
        } catch {
          await supabase.from('angel_agent_stages' as any).update({ status: 'error' }).eq('stage_no', 2);
        }
      }

      // Stage 3: 매칭 — 항상 실행
      setCurrentStageNo(3);
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 3);
      try {
        const data = await runMatching(0.6);
        if (!data) throw new Error('matching failed');
        results.matches_inserted = data.inserted ?? 0;
        results.match_reason = data.summary?.reason ?? 'unknown';
        stagesExecuted.push(3);
        await supabase
          .from('angel_agent_stages' as any)
          .update({ status: 'done', last_run_at: new Date().toISOString() })
          .eq('stage_no', 3);
      } catch (e: any) {
        await supabase.from('angel_agent_stages' as any).update({ status: 'error' }).eq('stage_no', 3);
        throw e;
      }

      toast.success(
        `✅ Angel Agent 실행 완료 — ${Object.entries(results).map(([k, v]) => `${k}:${v}`).join(' · ')}`
      );
    } catch (e: any) {
      hasError = true;
      errorMessage = e?.message ?? String(e);
      toast.error('Angel Agent 실행 실패: ' + errorMessage);
    } finally {
      clearInterval(elapsedTimer);
      setIsRunning(false);
      setCurrentStageNo(null);
      if (runId) {
        await supabase
          .from('angel_agent_runs' as any)
          .update({
            status: hasError ? 'failed' : stagesExecuted.length < 1 ? 'partial' : 'completed',
            stages_executed: stagesExecuted,
            results,
            duration_seconds: Math.round((Date.now() - startedAt) / 1000),
            error_message: errorMessage || null,
            completed_at: new Date().toISOString(),
          } as any)
          .eq('id', runId);
      }
      queryClient.invalidateQueries({ queryKey: ['dashboard-kpi'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-coverage'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-attentions'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-activity'] });
      queryClient.invalidateQueries({ queryKey: ['angel-agent-7stages'] });
      queryClient.invalidateQueries({ queryKey: ['angel-agent-7stages-counts'] });
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

  const doneCount = stages.filter((s) => s.status === 'done').length;
  const errorCount = stages.filter((s) => s.status === 'error').length;
  const totalCount = stages.length;
  const progressPct = isRunning && currentStageNo
    ? Math.round((currentStageNo / totalCount) * 100)
    : Math.round((doneCount / totalCount) * 100);
  const currentStageName = currentStageNo
    ? stages.find((s) => s.stage_no === currentStageNo)?.name ?? `Stage ${currentStageNo}`
    : null;

  return (
    <Card className={cn('p-4 mb-4 transition-shadow', isRunning && 'shadow-lg ring-1 ring-primary/30')}>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold">Angel Agent</h3>
            <Badge variant="secondary" className="text-[10px]">7단계 워크플로</Badge>
            {isRunning ? (
              <Badge className="text-[10px] bg-orange-500 hover:bg-orange-500 text-white gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                실행 중 · {elapsedSec}s
              </Badge>
            ) : (
              <span className="inline-flex items-center gap-2 text-[11px] text-muted-foreground">
                <CheckCircle2 className="w-3 h-3 text-green-600" />
                완료 {doneCount}
                {errorCount > 0 && (
                  <>
                    <AlertCircle className="w-3 h-3 text-red-600 ml-1" />
                    오류 {errorCount}
                  </>
                )}
                <span>/ {totalCount}</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            마지막 실행: {lastRunLabel}
          </p>
        </div>
        <Button size="sm" onClick={handleRun} disabled={isRunning} className="gap-1.5">
          {isRunning ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />진행 중...</>
          ) : (
            <><Play className="w-3.5 h-3.5" />실행하기</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {stages.map((s) => {
          const count = counts[`s${s.stage_no}`] ?? 0;
          const isFuture = s.page_route ? FUTURE_ROUTES.has(s.page_route) : false;
          const isCurrent = isRunning && currentStageNo === s.stage_no;

          const inner = (
            <div
              className={cn(
                'border rounded-lg p-3 h-full flex flex-col gap-1.5 transition-all relative',
                isFuture
                  ? 'opacity-60 bg-muted/30 cursor-not-allowed'
                  : 'hover:border-primary hover:bg-accent/40 cursor-pointer',
                isCurrent && 'border-orange-500 bg-orange-50 ring-2 ring-orange-200 shadow-md',
                !isCurrent && s.status === 'done' && 'border-green-200 bg-green-50/40',
                !isCurrent && s.status === 'error' && 'border-red-200 bg-red-50/40',
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
                    'text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-1',
                    s.status === 'done' && 'bg-green-100 text-green-700',
                    s.status === 'running' && 'bg-orange-100 text-orange-600',
                    s.status === 'error' && 'bg-red-100 text-red-700',
                    s.status === 'pending' && 'bg-muted text-muted-foreground',
                    isCurrent && 'bg-orange-500 text-white animate-pulse',
                  )}
                >
                  {isCurrent && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {(() => {
                    if (s.stage_no === 3 && matchSummary?.reason) {
                      const r = matchSummary.reason;
                      const pairs = (matchSummary as any).pairs ?? 0;
                      if (r === 'ok' && pairs > 0) return '완료';
                      if (r === 'no_sourcing') return '대기 — Alibaba API 연결 필요';
                      if (r === 'no_targets') return '대기 — 타깃 정의 필요';
                      if (r === 'no_matches' || (r === 'ok' && pairs === 0)) return '완료 — 매칭 0건';
                      if (r === 'no_factories') return '대기 — 통과 공장 없음';
                    }
                    return s.status === 'pending'
                      ? '대기'
                      : s.status === 'running'
                        ? '진행중'
                        : s.status === 'done'
                          ? '완료'
                          : '오류';
                  })()}
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

      {/* 진행률 바 */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>
            {isRunning && currentStageName ? (
              <span className="text-orange-600 font-semibold">
                ▶ Stage {currentStageNo} — {currentStageName}
              </span>
            ) : (
              <span>전체 진행률</span>
            )}
          </span>
          <span className="tabular-nums font-semibold">{progressPct}%</span>
        </div>
        <Progress
          value={progressPct}
          className={cn('h-1.5', isRunning && '[&>div]:bg-orange-500')}
        />
      </div>

      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t text-[10px] text-muted-foreground">
        <span>🤖 자동</span>
        <span>🤝 반자동</span>
        <span>✋ 수동</span>
        <span>🚧 작업 예정</span>
      </div>

      {recentRuns.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          <div className="text-[11px] font-semibold mb-2 text-muted-foreground">최근 실행 (Stage Runs)</div>
          <div className="space-y-1">
            {recentRuns.map((r) => {
              const summary = (r.summary as any) ?? {};
              return (
                <Link
                  key={r.run_id}
                  to={`/matches/runs/${r.run_id}`}
                  className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-accent/40 no-underline text-foreground"
                >
                  <span className="text-muted-foreground tabular-nums">
                    {formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: ko })}
                  </span>
                  <Badge variant="outline" className="text-[9px] px-1">Stage {r.stage_no}</Badge>
                  <Badge
                    variant={r.status === 'completed' ? 'secondary' : r.status === 'running' ? 'default' : 'destructive'}
                    className="text-[9px] px-1"
                  >
                    {r.status}
                  </Badge>
                  {summary.pairs != null && <span>{summary.pairs}쌍</span>}
                  {summary.reason && summary.reason !== 'ok' && (
                    <span className="text-muted-foreground">· {summary.reason}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <MatchingResultDialog
        open={matchOpen}
        onOpenChange={setMatchOpen}
        runId={matchRunId}
        summary={matchSummary}
        onRerun={(thr) => runMatching(thr)}
      />
    </Card>
  );
}

