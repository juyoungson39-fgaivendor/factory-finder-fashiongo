import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: '신규', className: 'bg-info/10 text-info border-info/20' },
  contacted: { label: '연락함', className: 'bg-accent/10 text-accent border-accent/20' },
  sampling: { label: '샘플링', className: 'bg-warning/10 text-warning border-warning/20' },
  approved: { label: '승인', className: 'bg-success/10 text-success border-success/20' },
  rejected: { label: '거절', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = statusConfig[status] || statusConfig.new;
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
};

export default StatusBadge;
