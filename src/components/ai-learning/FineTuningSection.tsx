import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Rocket, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  FINE_TUNING_GOAL,
  COST_PER_SAMPLE_USD,
  DEFAULT_BASE_MODEL,
} from './constants';

interface Props {
  trainingStats?: { confirmed: number; modified: number; deleted: number; total: number };
  runningJob: any;
  onJobStarted?: () => void;
  activeModel?: { base_model?: string } | null;
}

const FineTuningSection = ({ trainingStats, runningJob, onJobStarted, activeModel }: Props) => {
  const total = trainingStats?.total ?? 0;
  const canFineTune = total >= FINE_TUNING_GOAL;
  const [isTriggering, setIsTriggering] = useState(false);

  const handleTriggerFinetuning = async () => {
    setIsTriggering(true);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-finetuning');
      if (error) throw error;

      if (data?.success) {
        toast.success(`Fine-tuning 시작됨 — ${data.counts.total}건 학습 데이터`, {
          description: `Job: ${data.job_name}`,
        });
        onJobStarted?.();
      } else {
        toast.error(data?.error || 'Fine-tuning 시작 실패');
      }
    } catch (err: any) {
      toast.error(`Fine-tuning 오류: ${err.message}`);
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket size={18} className="text-primary" />
          Fine-tuning 실행
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">신규 교정 데이터</p>
            <p className="text-lg font-semibold">{trainingStats?.modified ?? 0}건</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">scoring_corrections (미학습)</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">정답 데이터</p>
            <p className="text-lg font-semibold text-green-600">{trainingStats?.confirmed ?? 0}건</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">factories.score_confirmed</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">예상 비용 / 시간</p>
            <p className="text-lg font-semibold">
              ~${(total * COST_PER_SAMPLE_USD).toFixed(2)} / {total <= 50 ? '1~2' : total <= 200 ? '2~3' : '3~5'}시간
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {activeModel?.base_model || DEFAULT_BASE_MODEL} 40epoch 기준 추정
            </p>
          </div>
        </div>

        {!canFineTune && (
          <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
            <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
            <p className="text-xs text-yellow-800">
              Fine-tuning을 시작하려면 최소 {FINE_TUNING_GOAL}건의 학습 데이터(정답 + 신규 교정)가 필요합니다.
              현재 {total}건 수집됨. {Math.max(0, FINE_TUNING_GOAL - total)}건 더 필요합니다.
            </p>
          </div>
        )}

        <Button
          disabled={!canFineTune || !!runningJob || isTriggering}
          onClick={handleTriggerFinetuning}
          className="w-full"
        >
          {isTriggering ? (
            <Loader2 size={16} className="mr-2 animate-spin" />
          ) : (
            <Rocket size={16} className="mr-2" />
          )}
          {runningJob ? '학습 진행 중...' : isTriggering ? 'Fine-tuning 시작 중...' : 'Fine-tuning 시작'}
        </Button>
      </CardContent>
    </Card>
  );
};

export default FineTuningSection;
