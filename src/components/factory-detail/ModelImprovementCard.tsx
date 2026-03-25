import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VersionError {
  version: string;
  internalVersion: string;
  avgError: number;
  isCurrent: boolean;
}

interface Props {
  history: VersionError[];
}

const getErrorColor = (err: number) => {
  if (err >= 2.0) return 'text-red-600';
  if (err >= 1.0) return 'text-amber-600';
  return 'text-green-600';
};

const getErrorBg = (err: number) => {
  if (err >= 2.0) return 'bg-red-50 border-red-200';
  if (err >= 1.0) return 'bg-amber-50 border-amber-200';
  return 'bg-green-50 border-green-200';
};

const ModelImprovementCard = ({ history }: Props) => {
  if (history.length < 2) return null;

  const first = history[0];
  const current = history[history.length - 1];
  const improvementPct = first.avgError > 0
    ? Math.round(((first.avgError - current.avgError) / first.avgError) * 100)
    : 0;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-background to-primary/5">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingDown size={16} className="text-primary" />
          <p className="text-sm font-semibold">모델 개선 이력 (이 공장 기준)</p>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-2">
          {history.map((v, i) => (
            <div
              key={v.version}
              className={cn(
                'rounded-lg border p-3 min-w-[120px] flex-shrink-0 transition-all',
                v.isCurrent
                  ? 'border-green-400 bg-green-50 ring-1 ring-green-300'
                  : 'border-border bg-muted/30',
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="font-mono text-xs font-bold text-primary">
                  {v.internalVersion}
                </span>
                {v.isCurrent && (
                  <Badge variant="default" className="text-[9px] px-1 py-0">현재</Badge>
                )}
                {i === 0 && !v.isCurrent && (
                  <Badge variant="outline" className="text-[9px] px-1 py-0">base</Badge>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground mb-0.5">평균 오차</p>
              <p className={cn('text-lg font-bold', getErrorColor(v.avgError))}>
                ±{v.avgError.toFixed(1)}
              </p>
            </div>
          ))}
        </div>

        {improvementPct > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {first.internalVersion} 대비 오차 감소
              </span>
              <span className="font-bold text-green-600">{improvementPct}% 개선</span>
            </div>
            <Progress value={improvementPct} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ModelImprovementCard;
