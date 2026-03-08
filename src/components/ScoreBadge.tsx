import { cn } from '@/lib/utils';

const ScoreBadge = ({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) => {
  const getScoreClass = (s: number) => {
    if (s >= 80) return 'bg-score-excellent';
    if (s >= 60) return 'bg-score-good';
    if (s >= 40) return 'bg-score-average';
    if (s >= 20) return 'bg-score-poor';
    return 'bg-score-bad';
  };

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  };

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-heading font-bold text-primary-foreground shrink-0',
        getScoreClass(score),
        sizeClasses[size]
      )}
    >
      {Math.round(score)}
    </div>
  );
};

export default ScoreBadge;
