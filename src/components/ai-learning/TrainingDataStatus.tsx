import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle, Edit3, Database, Info } from 'lucide-react';
import { FINE_TUNING_GOAL } from './constants';

interface Props {
  stats?: {
    confirmed: number;
    modified: number;
    modifiedUsed?: number;
    deleted: number;
    total: number;
    remaining: number;
  };
}

const TrainingDataStatus = ({ stats }: Props) => {
  const s = stats ?? { confirmed: 0, modified: 0, modifiedUsed: 0, deleted: 0, total: 0, remaining: FINE_TUNING_GOAL };
  const progressPct = Math.min(100, (s.total / FINE_TUNING_GOAL) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database size={18} className="text-primary" />
          다음 학습 데이터 현황
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={<CheckCircle size={16} className="text-green-600" />}
            label="정답 (매회 포함)"
            value={s.confirmed}
            color="text-green-600"
            tooltip="factories.score_confirmed=true 인 공장 수. 모든 학습 라운드에 정답 데이터로 포함됩니다."
          />
          <StatCard
            icon={<Edit3 size={16} className="text-amber-600" />}
            label="신규 교정 (미학습)"
            value={s.modified}
            color="text-amber-600"
            tooltip="scoring_corrections 테이블에서 아직 파인튜닝에 사용되지 않은(used_in_version IS NULL) 교정 건 수. 다음 학습 라운드에 포함됩니다."
          />
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-muted-foreground">학습된 교정</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={12} className="text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <p>scoring_corrections 테이블에서 used_in_version IS NOT NULL — 이미 파인튜닝에 반영된 누적 교정 건 수.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-lg font-semibold text-muted-foreground">{s.modifiedUsed ?? 0}건</p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs text-muted-foreground">다음 학습 총합</p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info size={12} className="text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs">
                    <p>정답(매회 포함) + 신규 교정. 다음 Fine-tuning 실행 시 Vertex 로 송신되는 총 학습 건 수입니다.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-lg font-semibold">{s.total}건</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Fine-tuning 목표까지</span>
            <span>{s.total} / {FINE_TUNING_GOAL}건 ({s.remaining}건 남음)</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
};

const StatCard = ({
  icon, label, value, color, tooltip,
}: { icon: React.ReactNode; label: string; value: number; color: string; tooltip?: string }) => (
  <div className="rounded-lg border p-3">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <p className="text-xs text-muted-foreground">{label}</p>
      {tooltip && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info size={12} className="text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              <p>{tooltip}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
    <p className={`text-lg font-semibold ${color}`}>{value}건</p>
  </div>
);

export default TrainingDataStatus;
