import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: 'NEW', className: 'bg-secondary text-secondary-foreground border-border' },
  contacted: { label: 'CONTACTED', className: 'bg-info/10 text-info border-info/20' },
  sampling: { label: 'SAMPLING', className: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: 'APPROVED', className: 'bg-success/10 text-success border-success/20' },
  rejected: { label: 'REJECTED', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status] || statusConfig.new;
  return (
    <Badge variant="outline" className={cn('text-[10px] uppercase tracking-wider font-medium', config.className)}>
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
