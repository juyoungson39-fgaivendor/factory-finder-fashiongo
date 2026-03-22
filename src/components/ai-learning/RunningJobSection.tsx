import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

interface Props {
  job: any;
}

const RunningJobSection = ({ job }: Props) => {
  const queryClient = useQueryClient();

  // 10초 간격 폴링 — PENDING/RUNNING 상태일 때만
  useEffect(() => {
    const s = job?.status?.toUpperCase();
    if (!job || (s !== 'PENDING' && s !== 'RUNNING')) return;

    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['ai-running-job'] });
    }, 10000);

    return () => clearInterval(interval);
  }, [job?.status, queryClient]);

  if (!job) return null;

  const statusUpper = job.status?.toUpperCase();
  const isRunning = statusUpper === 'PENDING' || statusUpper === 'RUNNING';
  const isSucceeded = statusUpper === 'SUCCEEDED';
  const isFailed = statusUpper === 'FAILED';

  const elapsed = job.started_at
    ? Math.round((Date.now() - new Date(job.started_at).getTime()) / 60000)
    : 0;

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
            <span className="font-medium text-sm">{job.vertex_job_name || '-'}</span>
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
            <p className="text-xs text-muted-foreground mb-1">진행률</p>
            <span className="font-medium text-sm">{job.progress_pct}%</span>
          </div>
        </div>
        <Progress value={job.progress_pct} className="h-2" />
        {isFailed && job.error_message && (
          <p className="text-xs text-red-600 mt-3">{job.error_message}</p>
        )}
      </CardContent>
    </Card>
  );
};

export default RunningJobSection;
