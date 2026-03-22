import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2 } from 'lucide-react';

interface Props {
  job: any;
}

const RunningJobSection = ({ job }: Props) => {
  if (!job) return null;

  return (
    <Card className="border-blue-200 bg-blue-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Loader2 size={18} className="text-blue-600 animate-spin" />
          진행 중 학습
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
            <p className="text-xs text-muted-foreground mb-1">Vertex Job ID</p>
            <span className="font-medium text-sm text-muted-foreground truncate block">{job.vertex_job_name || '-'}</span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">진행률</p>
            <span className="font-medium text-sm">{job.progress_pct}%</span>
          </div>
        </div>
        <Progress value={job.progress_pct} className="h-2" />
      </CardContent>
    </Card>
  );
};

export default RunningJobSection;
