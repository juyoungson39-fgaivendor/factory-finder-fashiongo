import { cn } from '@/lib/utils';

interface Props {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  label?: string;        // e.g. 'stock_score' or 'OEM_score'
  scoredAt?: string | null;  // ISO timestamp
}

function formatMDY(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

const ScoreBadge = ({ score, size = 'md', label, scoredAt }: Props) => {
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

  const title = label
    ? `${label}\n마지막 스코어링: ${scoredAt ? formatMDY(scoredAt) : '—'}`
    : undefined;

  return (
    <div
      title={title}
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-primary-foreground shrink-0 cursor-help',
        getScoreClass(score),
        sizeClasses[size]
      )}
    >
      {Math.round(score)}
    </div>
  );
};

export default ScoreBadge;
