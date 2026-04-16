import { Badge } from '@/components/ui/badge';
import type { ConnectionStatus } from '@/integrations/alibaba/types';

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; className: string }> = {
  active: {
    label: 'Active',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
  expired: {
    label: 'Expired',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  disconnected: {
    label: 'Disconnected',
    className: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

/**
 * Displays a color-coded badge for an Alibaba connection status.
 * - active: green
 * - expired: red
 * - disconnected: gray
 */
export const ConnectionStatusBadge = ({ status }: ConnectionStatusBadgeProps) => {
  const config = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
};
