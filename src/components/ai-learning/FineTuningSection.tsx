import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Rocket } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  trainingStats?: { confirmed: number; modified: number; deleted: number; total: number };
  runningJob: any;
}

const FineTuningSection = ({ trainingStats, runningJob }: Props) => {
  const total = trainingStats?.total ?? 0;
  const canFineTune = total >= 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket size={18} className="text-primary" />
          Fine-tuning 실행
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">교정 데이터</p>
            <p className="text-lg font-semibold">{trainingStats?.modified ?? 0}건</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">정답 데이터</p>
            <p className="text-lg font-semibold text-green-600">{trainingStats?.confirmed ?? 0}건</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">부적합 데이터</p>
            <p className="text-lg font-semibold text-red-500">{trainingStats?.deleted ?? 0}건</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">예상 비용 / 시간</p>
            <p className="text-lg font-semibold">~$0.77 / 1~3시간</p>
          </div>
        </div>

        {!canFineTune && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-800">
              Fine-tuning을 시작하려면 최소 100건의 학습 데이터(확인+수정+삭제)가 필요합니다.
              현재 {total}건 수집됨. {100 - total}건 더 필요합니다.
            </p>
          </div>
        )}

        <Button
          disabled={!canFineTune || !!runningJob}
          onClick={() => toast.info('Fine-tuning 파이프라인은 Vertex AI 연동 후 사용 가능합니다.')}
          className="w-full"
        >
          <Rocket size={16} className="mr-2" />
          {runningJob ? '학습 진행 중...' : 'Fine-tuning 시작'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FineTuningSection;
