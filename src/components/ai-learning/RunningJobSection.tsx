import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TRAINING_ESTIMATE_MINUTES } from './constants';

/** Inline term tooltip — shows a dotted underline hint */
const Term = ({ label, desc }: { label: string; desc: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="underline decoration-dotted decoration-muted-foreground/50 cursor-help">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        <p>{desc}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

interface Props {
  job: any;
}

const RunningJobSection = ({ job }: Props) => {
  const queryClient = useQueryClient();

  // Supabase Realtime — ai_training_jobs 테이블 변경 감지
  useEffect(() => {
    const s = job?.status?.toUpperCase();
    if (!job || (s !== 'PENDING' && s !== 'RUNNING')) return;

    const channel = supabase
      .channel('training-job-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_training_jobs', filter: `id=eq.${job.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['ai-running-job'] });
          queryClient.invalidateQueries({ queryKey: ['training-jobs'] });
          queryClient.invalidateQueries({ queryKey: ['training-stats'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [job?.id, job?.status, queryClient]);

  if (!job) return null;

  const statusUpper = job.status?.toUpperCase();
  const isRunning = statusUpper === 'PENDING' || statusUpper === 'RUNNING';
  const isSucceeded = statusUpper === 'SUCCEEDED';
  const isFailed = statusUpper === 'FAILED';

  const elapsed = job.started_at
    ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000)
    : 0;

  // Use real Tensorboard metrics if available, otherwise estimate based on elapsed time
  const metrics = job.training_metrics as {
    epoch_count?: number;
    current_epoch?: number;
    current_step?: number;
    progress_pct?: number;
    source?: 'checkpoint' | 'tensorboard';
    train_total_loss?: { current_step: number; latest_value: number; data_points: number };
    train_fraction_of_correct_next_step_preds?: { current_step: number; latest_value: number; data_points: number };
    eval_total_loss?: { current_step: number; latest_value: number; data_points: number };
  } | null;

  const hasRealMetrics = !!metrics?.progress_pct;
  const estimatedMinutes = DEFAULT_TRAINING_ESTIMATE_MINUTES;
  // Cap at 99% while still RUNNING (100% only when SUCCEEDED)
  const estimatedPct = isSucceeded ? 100
    : isFailed ? 0
    : hasRealMetrics ? Math.min(99, metrics.progress_pct!)
    : Math.min(95, Math.round((elapsed / estimatedMinutes) * 100));

  return (
    <Card className={`${isRunning ? 'border-blue-200 bg-blue-50/50' : isSucceeded ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {isRunning && <Loader2 size={18} className="text-blue-600 animate-spin" />}
          {isSucceeded && <CheckCircle2 size={18} className="text-green-600" />}
          {isFailed && <XCircle size={18} className="text-red-600" />}
          {isRunning ? '진행 중 학습' : isSucceeded ? '학습 완료' : '학습 실패'}
          <Badge variant="outline" className="text-[10px] ml-2">
            {job.status}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">모델명</p>
            <span className="font-medium text-sm">{job.vertex_job_name?.split('/').pop() || '-'}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">시작 시각</p>
            <span className="font-medium text-sm">
              {job.started_at ? new Date(job.started_at).toLocaleString('ko-KR') : '-'}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">학습 건수</p>
            <span className="font-medium text-sm">{job.training_data_count}건</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">경과 시간</p>
            <span className="font-medium text-sm">{elapsed}분</span>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <p className="text-xs text-muted-foreground">진행률</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={12} className="text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-sm text-xs space-y-2 p-3">
                    <div className={`rounded px-2 py-1.5 ${hasRealMetrics ? 'bg-blue-100 border border-blue-300' : 'opacity-50'}`}>
                      <p className="font-semibold">
                        {hasRealMetrics && <span className="mr-1">&#10003;</span>}
                        A. 실제 메트릭 기반
                      </p>
                      <p className="mt-0.5">
                        진행률 = (현재 epoch / 총 epoch) x 100<br />
                        {hasRealMetrics && (
                          <span>= ({metrics.current_epoch ?? metrics.train_total_loss?.current_step ?? '?'} / {metrics.epoch_count ?? '?'}) x 100 = {estimatedPct}%<br /></span>
                        )}
                        <span className="text-muted-foreground">Vertex AI checkpoint 또는 Tensorboard 기준</span>
                      </p>
                    </div>
                    <div className={`rounded px-2 py-1.5 ${!hasRealMetrics ? 'bg-amber-100 border border-amber-300' : 'opacity-50'}`}>
                      <p className="font-semibold">
                        {!hasRealMetrics && <span className="mr-1">&#10003;</span>}
                        B. 시간 기반 추정 (fallback)
                      </p>
                      <p className="mt-0.5">
                        진행률 = (경과 시간 / 예상 소요) x 100<br />
                        {!hasRealMetrics && (
                          <span>= ({elapsed}분 / {estimatedMinutes}분) x 100 = ~{estimatedPct}%<br /></span>
                        )}
                        <span className="text-muted-foreground">메트릭 수신 전까지 {estimatedMinutes}분 기준, 최대 95%</span>
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className="font-medium text-sm">
              {hasRealMetrics
                ? <>{estimatedPct}% ({metrics.current_epoch ?? metrics.train_total_loss?.current_step ?? '?'}/{metrics.epoch_count ?? '?'} <Term label="epoch" desc="에폭 — 전체 학습 데이터를 한 번 완전히 학습하는 단위. 40 epoch = 전체 데이터를 40번 반복 학습." />){metrics.current_epoch === metrics.epoch_count ? ' · 마무리 중' : ''}</>
                : `~${estimatedPct}% (추정)`}
            </span>
          </div>
        </div>
        <Progress value={estimatedPct} className="h-2" />
        {hasRealMetrics && isRunning && (
          <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                <Term label="Loss" desc="손실값 — 모델의 예측이 정답과 얼마나 다른지를 나타내는 수치. 낮을수록 학습이 잘 된 것입니다." />
              </p>
              <span className="font-medium text-sm">
                {metrics.train_total_loss?.latest_value?.toFixed(4) ?? '-'}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                <Term label="정확도" desc="다음 토큰 예측 정확률 — 모델이 다음에 올 단어를 얼마나 잘 맞추는지. 높을수록 좋습니다." />
              </p>
              <span className="font-medium text-sm">
                {metrics.train_fraction_of_correct_next_step_preds?.latest_value != null
                  ? `${(metrics.train_fraction_of_correct_next_step_preds.latest_value * 100).toFixed(1)}%`
                  : '-'}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                <Term label="Eval Loss" desc="평가 손실값 — 학습에 사용하지 않은 별도 데이터로 측정한 손실. 이 값이 올라가면 과적합(overfitting) 의심." />
              </p>
              <span className="font-medium text-sm">
                {metrics.eval_total_loss?.latest_value?.toFixed(4) ?? '-'}
              </span>
            </div>
          </div>
        )}
        {isFailed && job.error_message && (
          <p className="text-xs text-red-600 mt-3">{job.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default RunningJobSection;
