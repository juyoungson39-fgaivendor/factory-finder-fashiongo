import { cn } from '@/lib/utils';

const ScoreBadge = ({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) => {
  const getScoreClass = (s: number) => {
    if (s >= 80) return 'bg-score-excellent';
    if (s >= 60) return 'bg-score-good';
    if (s >= 40) return 'bg-score-average';
    if (s >= 20) return 'bg-score-poor';
    return 'bg-muted text-muted-foreground';
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-[10px]',
    md: 'w-10 h-10 text-xs',
    lg: 'w-12 h-12 text-sm',
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-primary-foreground shrink-0',
        getScoreClass(score),
        sizeClasses[size]
      )}
    >
      {Math.round(score)}
    </div>
  );
};

export default ScoreBadge;
