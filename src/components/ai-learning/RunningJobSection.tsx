import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';

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
    progress_pct?: number;
    train_total_loss?: { current_step: number; latest_value: number; data_points: number };
    train_fraction_of_correct_next_step_preds?: { current_step: number; latest_value: number; data_points: number };
    eval_total_loss?: { current_step: number; latest_value: number; data_points: number };
  } | null;

  const hasRealMetrics = !!metrics?.progress_pct;
  const estimatedMinutes = 60;
  const estimatedPct = isSucceeded ? 100
    : isFailed ? 0
    : hasRealMetrics ? metrics.progress_pct!
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
                        진행률 = (완료 step / 총 epoch) x 100<br />
                        {hasRealMetrics && (
                          <span>= ({metrics.train_total_loss?.current_step ?? '?'} / {metrics.epoch_count ?? '?'}) x 100 = {estimatedPct}%<br /></span>
                        )}
                        <span className="text-muted-foreground">Tensorboard train_total_loss step 수 기준</span>
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
                        <span className="text-muted-foreground">메트릭 수신 전까지 60분 기준, 최대 95%</span>
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <span className="font-medium text-sm">
              {hasRealMetrics
                ? `${estimatedPct}% (${metrics.train_total_loss?.current_step ?? '?'}/${metrics.epoch_count ?? '?'} epoch)`
                : `~${estimatedPct}% (추정)`}
            </span>
          </div>
        </div>
        <Progress value={estimatedPct} className="h-2" />
        {hasRealMetrics && isRunning && (
          <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Loss</p>
              <span className="font-medium text-sm">
                {metrics.train_total_loss?.latest_value?.toFixed(4) ?? '-'}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">정확도</p>
              <span className="font-medium text-sm">
                {metrics.train_fraction_of_correct_next_step_preds?.latest_value != null
                  ? `${(metrics.train_fraction_of_correct_next_step_preds.latest_value * 100).toFixed(1)}%`
                  : '-'}
              </span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Eval Loss</p>
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
