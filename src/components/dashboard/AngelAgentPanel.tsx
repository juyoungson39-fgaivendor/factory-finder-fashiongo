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
import { MatchingResultDialog } from '@/components/matching/MatchingResultDialog';
import { VendorAllocationDialog } from '@/components/matching/VendorAllocationDialog';
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
  const [matchOpen,         setMatchOpen]         = useState(false);
  const [vendorAllocOpen,   setVendorAllocOpen]   = useState(false);
  const [isRunning,         setIsRunning]         = useState(false);
  const [currentStageNo,    setCurrentStageNo]    = useState<number | null>(null);
  const [elapsedSec,        setElapsedSec]        = useState(0);

  const FALLBACK_STAGES: Stage[] = [
    { stage_no: 1, name: '트렌드 분석',          description: null, page_route: '/products/target-fg',         automation_level: 'auto',   status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 2, name: '타겟상품 리스팅',      description: null, page_route: '/products/target-fg',         automation_level: 'semi',   status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 3, name: '소싱가능 상품과 매칭', description: null, page_route: '/matches',                    automation_level: 'auto',   status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 4, name: '상품 컨펌',            description: null, page_route: '/matches?tab=pending_confirm', automation_level: 'manual', status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 5, name: '벤더 배분',            description: null, page_route: '/matches?tab=approved',        automation_level: 'semi',   status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 6, name: 'FG 변환',              description: null, page_route: '/ai-vendors',                 automation_level: 'semi',   status: 'pending', last_run_at: null, current_item_count: null },
    { stage_no: 7, name: 'FG 등록',              description: null, page_route: '/ai-vendors',                 automation_level: 'manual', status: 'pending', last_run_at: null, current_item_count: null },
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

  // ── Stage 2 카드 카운트: target_products active 건수 ──────────────
  const { data: targetActiveCount = 0 } = useQuery<number>({
    queryKey: ['target-products-active-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('target_products' as any)
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  // ── Stage 3 카드 카운트: trend_sourceable_matches pending_confirm 건수 ──
  const { data: pendingConfirmCount = 0 } = useQuery<number>({
    queryKey: ['matches-pending-confirm-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_confirm');
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  // ── Stage 5 카드 카운트: trend_sourceable_matches approved 건수 (벤더 배분 대기) ──
  const { data: approvedAllocCount = 0 } = useQuery<number>({
    queryKey: ['stage5-approved-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('trend_sourceable_matches')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved');
      return count ?? 0;
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

  const handleRun = async () => {
    setIsRunning(true);
    setElapsedSec(0);
    const elapsedTimer = setInterval(() => setElapsedSec((s) => s + 1), 1000);

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
      // ── Stage 1: 트렌드 수집 (SHEIN · Zara · Amazon 한정) ─────────
      // 그 외 트렌드 소스(magazine·sns·pinterest·google·instagram·tiktok·fashiongo)는
      // 이 단계에서 동작하지 않으며, /trend-recommendation 페이지의 "수집하기" 버튼에서만 작동함.
      // 4시간 내 SHEIN/Zara/Amazon 데이터가 trend_analyses 에 있으면 재수집 생략하고 기존 데이터 사용.
      setCurrentStageNo(1);
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 1);

      const TARGET_PLATFORMS = ['shein', 'zara', 'amazon'] as const;
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();

      const { count: recentTrendCount } = await supabase
        .from('trend_analyses' as any)
        .select('*', { count: 'exact', head: true })
        .gte('created_at', fourHoursAgo)
        .or(
          `source_platform.in.(${TARGET_PLATFORMS.join(',')}),source_data->>platform.in.(${TARGET_PLATFORMS.join(',')})`,
        );

      if ((recentTrendCount ?? 0) > 0) {
        results.trends = 'cached';
        results.trends_cached_count = recentTrendCount;
        results.trends_sources = TARGET_PLATFORMS;
        stagesExecuted.push(1);
        await supabase
          .from('angel_agent_stages' as any)
          .update({ status: 'done', last_run_at: new Date().toISOString() })
          .eq('stage_no', 1);
        toast.info(
          `♻️ 최근 4시간 내 SHEIN/Zara/Amazon 트렌드 ${recentTrendCount}건 존재 — 재수집 생략, 기존 데이터 사용`,
        );
      } else {
        const trendFns = [
          'collect-shein-trends',
          'collect-zara-trends',
          'collect-amazon-image-trends',
        ];
        const trendResults = await Promise.allSettled(
          trendFns.map((fn) => supabase.functions.invoke(fn, { body: { user_id: user?.id } })),
        );
        const trendSuccess = trendResults.filter((r) => r.status === 'fulfilled').length;
        const trendFailed = trendResults.length - trendSuccess;
        results.trends = trendSuccess;
        results.trends_sources = TARGET_PLATFORMS;
        results.trends_failed = trendFailed;
        stagesExecuted.push(1);
        await supabase
          .from('angel_agent_stages' as any)
          .update({ status: trendSuccess > 0 ? 'done' : 'error', last_run_at: new Date().toISOString() })
          .eq('stage_no', 1);
        if (trendFailed > 0) {
          toast.warning(`트렌드 수집 일부 실패 (${trendSuccess}/${trendResults.length} 성공)`);
        }
      }

      // ── Stage 2: 타겟상품 필터링 (run_stage2_target_filtering RPC) ─
      setCurrentStageNo(2);
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 2);
      try {
        const { data: s2, error: s2err } = await supabase.rpc('run_stage2_target_filtering' as any);
        if (s2err) throw s2err;
        const s2row = (s2 as any)?.[0] ?? {};
        results.active_targets    = s2row.active_targets     ?? 0;
        results.passed_1st_filter = s2row.passed_1st_filter  ?? 0;
        results.passed_2nd_filter = s2row.passed_2nd_filter  ?? 0;
        stagesExecuted.push(2);
        await supabase
          .from('angel_agent_stages' as any)
          .update({ status: 'done', last_run_at: new Date().toISOString() })
          .eq('stage_no', 2);
      } catch (e: any) {
        await supabase.from('angel_agent_stages' as any).update({ status: 'error' }).eq('stage_no', 2);
        throw e;
      }

      // ── Stage 3: 소싱가능 상품 매칭 (run_stage3_full RPC) ─
      // run_stage3_full 은 두 단계를 하나로:
      //   (1) trend_analyses × sourceable_products cosine 매칭 → trend_sourceable_matches UPSERT (status='unfiltered')
      //   (2) 기존 run_stage3_pending_confirm() 재사용으로 active 타겟 분류
      // 임계값은 agent_settings 테이블에서 읽음 (관리자가 /settings/pricing 에서 수정 가능).
      setCurrentStageNo(3);
      await supabase.from('angel_agent_stages' as any).update({ status: 'running' }).eq('stage_no', 3);
      try {
        // agent_settings 에서 동적으로 threshold 읽기. 실패 시 0.60 (DB default 와 동일).
        const { data: agentCfg } = await supabase
          .from('agent_settings' as any)
          .select('stage3_match_threshold')
          .eq('id', 1)
          .maybeSingle();
        const stage3Threshold = Number((agentCfg as any)?.stage3_match_threshold ?? 0.60);
        results.stage3_threshold_used = stage3Threshold;

        const { data: s3, error: s3err } = await supabase.rpc('run_stage3_full' as any, { p_threshold: stage3Threshold });
        if (s3err) throw s3err;
        const s3obj = (s3 as any) ?? {};
        results.matches_touched  = s3obj.rows_touched     ?? 0;
        results.pending_count    = s3obj.pending_count    ?? 0;
        results.unfiltered_count = s3obj.unfiltered_count ?? 0;
        results.trends_with_emb  = s3obj.trends_with_emb  ?? 0;
        results.products_with_emb = s3obj.products_with_emb ?? 0;
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
        `완료. 타겟 ${results.active_targets}건 → 컨펌대기 ${results.pending_count}건.`,
      );
      // Stage 3 완료 직후 매칭 컨펌 모달 (Modal A) 자동 오픈.
      // 사용자가 페이지 이동 없이 모달 안에서 컨펌 작업을 이어갈 수 있도록.
      setMatchOpen(true);
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
      queryClient.invalidateQueries({ queryKey: ['target-products-active-count'] });
      queryClient.invalidateQueries({ queryKey: ['matches-pending-confirm-count'] });
      queryClient.invalidateQueries({ queryKey: ['tsm-counts'] });
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

  const doneCount    = stages.filter((s) => s.status === 'done').length;
  const errorCount   = stages.filter((s) => s.status === 'error').length;
  const totalCount   = stages.length;
  const progressPct  = isRunning && currentStageNo
    ? Math.round((currentStageNo / totalCount) * 100)
    : Math.round((doneCount / totalCount) * 100);
  const currentStageName = currentStageNo
    ? stages.find((s) => s.stage_no === currentStageNo)?.name ?? `Stage ${currentStageNo}`
    : null;

  // Stage 카드 카운트 — Stage 2/3/4/5 는 전용 쿼리 우선
  const getStageCount = (s: Stage): number => {
    if (s.stage_no === 2) return targetActiveCount;
    if (s.stage_no === 3) return pendingConfirmCount;
    if (s.stage_no === 4) return pendingConfirmCount; // Stage 4 = 상품 컨펌 = 같은 컨펌대기 풀
    if (s.stage_no === 5) return approvedAllocCount;
    return counts[`s${s.stage_no}`] ?? 0;
  };

  const getStageCountLabel = (s: Stage): string | null => {
    const n = getStageCount(s);
    if (n <= 0) return null;
    if (s.stage_no === 2) return `타겟 ${n.toLocaleString()}건`;
    if (s.stage_no === 3) return `컨펌대기 ${n.toLocaleString()}건`;
    if (s.stage_no === 4) return `컨펌대기 ${n.toLocaleString()}건`;
    if (s.stage_no === 5) return `배분대기 ${n.toLocaleString()}건`;
    return `${n.toLocaleString()}건`;
  };

  // Stage 3 카드 링크는 컨펌대기 탭으로 직접 이동
  const getStageRoute = (s: Stage): string | null => {
    if (s.stage_no === 3) return '/matches?tab=pending_confirm';
    return s.page_route;
  };

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
          const countLabel = getStageCountLabel(s);
          const stageRoute = getStageRoute(s);
          const isFuture   = stageRoute ? FUTURE_ROUTES.has(stageRoute) : false;
          const isCurrent  = isRunning && currentStageNo === s.stage_no;

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
                  {s.automation_level === 'auto'   && '🤖'}
                  {s.automation_level === 'semi'   && '🤝'}
                  {s.automation_level === 'manual' && '✋'}
                </span>
              </div>
              <p className="text-xs font-medium leading-tight">{s.name}</p>
              <div className="flex items-center justify-between mt-auto">
                <span
                  className={cn(
                    'text-[9px] px-1.5 py-0.5 rounded inline-flex items-center gap-1',
                    s.status === 'done'    && 'bg-green-100 text-green-700',
                    s.status === 'running' && 'bg-orange-100 text-orange-600',
                    s.status === 'error'   && 'bg-red-100 text-red-700',
                    s.status === 'pending' && 'bg-muted text-muted-foreground',
                    isCurrent              && 'bg-orange-500 text-white animate-pulse',
                  )}
                >
                  {isCurrent && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                  {s.status === 'pending' ? '대기'
                    : s.status === 'running' ? '진행중'
                    : s.status === 'done'    ? '완료'
                    : '오류'}
                </span>
                {countLabel && (
                  <span className="text-[10px] font-bold text-primary text-right leading-tight">
                    {countLabel}
                  </span>
                )}
              </div>
              {isFuture && (
                <p className="text-[9px] text-muted-foreground">🚧 작업 예정</p>
              )}
            </div>
          );

          // Stage 4 카드 → Modal A (매칭 컨펌) 오픈
          // Stage 5 카드 → Modal B (벤더 배분) 오픈
          // 그 외 → 페이지 이동
          if (s.stage_no === 4 && !isFuture) {
            return (
              <button
                key={s.stage_no}
                type="button"
                onClick={() => setMatchOpen(true)}
                className="text-left no-underline text-foreground bg-transparent border-0 p-0 m-0"
              >
                {inner}
              </button>
            );
          }
          if (s.stage_no === 5 && !isFuture) {
            return (
              <button
                key={s.stage_no}
                type="button"
                onClick={() => setVendorAllocOpen(true)}
                className="text-left no-underline text-foreground bg-transparent border-0 p-0 m-0"
              >
                {inner}
              </button>
            );
          }

          return isFuture || !stageRoute ? (
            <div key={s.stage_no}>{inner}</div>
          ) : (
            <Link key={s.stage_no} to={stageRoute} className="no-underline text-foreground">
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
                  to="/matches"
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
        onProceedNext={() => {
          setMatchOpen(false);
          setVendorAllocOpen(true);
        }}
      />

      <VendorAllocationDialog
        open={vendorAllocOpen}
        onOpenChange={setVendorAllocOpen}
      />
    </Card>
  );
}
