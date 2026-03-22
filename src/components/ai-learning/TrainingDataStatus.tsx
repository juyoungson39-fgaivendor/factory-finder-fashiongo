import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Edit3, Trash2, Database } from 'lucide-react';

interface Props {
  stats?: {
    confirmed: number;
    modified: number;
    deleted: number;
    total: number;
    remaining: number;
  };
}

const TrainingDataStatus = ({ stats }: Props) => {
  const s = stats ?? { confirmed: 0, modified: 0, deleted: 0, total: 0, remaining: 100 };
  const progressPct = Math.min(100, (s.total / 100) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Database size={18} className="text-primary" />
          학습 데이터 현황
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<CheckCircle size={16} className="text-green-600" />} label="확인 (정답)" value={s.confirmed} color="text-green-600" />
          <StatCard icon={<Edit3 size={16} className="text-amber-600" />} label="수정 (교정)" value={s.modified} color="text-amber-600" />
          <StatCard icon={<Trash2 size={16} className="text-red-500" />} label="삭제 (부적합)" value={s.deleted} color="text-red-500" />
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground mb-1">총합</p>
            <p className="text-lg font-semibold">{s.total}건</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Fine-tuning 목표까지</span>
            <span>{s.total} / 100건 ({s.remaining}건 남음)</span>
          </div>
          <Progress value={progressPct} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
};

const StatCard = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) => (
  <div className="rounded-lg border p-3">
    <div className="flex items-center gap-1.5 mb-1">
      {icon}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
    <p className={`text-lg font-semibold ${color}`}>{value}건</p>
  </div>
);

export default TrainingDataStatus;
