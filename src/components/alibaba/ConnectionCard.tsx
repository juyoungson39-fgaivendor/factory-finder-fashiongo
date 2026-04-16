import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Unplug, Loader2, CheckCircle2 } from 'lucide-react';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { DisconnectConfirmDialog } from './DisconnectConfirmDialog';
import { ExpiredConnectionBanner } from './ExpiredConnectionBanner';
import { useTriggerSync } from '@/integrations/alibaba/hooks/use-alibaba-sync';
import type { AlibabaConnection } from '@/integrations/alibaba/types';

interface ConnectionCardProps {
  connection: AlibabaConnection;
  isSelected: boolean;
  onSelect: () => void;
  onSyncTriggered?: () => void;
}

/**
 * Card displaying a single Alibaba shop connection.
 * Shows: shop name, status badge, sync status, and scopes.
 * Actions: select (for data view), Sync, and Disconnect.
 */
export const ConnectionCard = ({
  connection,
  isSelected,
  onSelect,
  onSyncTriggered,
}: ConnectionCardProps) => {
  const { mutate: triggerSync, isPending: isSyncing } = useTriggerSync();
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const handleSync = () => {
    triggerSync(
      { connection_id: connection.id },
      { onSuccess: () => onSyncTriggered?.() },
    );
  };

  return (
    <>
      <Card
        className={`w-full cursor-pointer transition-colors hover:bg-accent/40 ${
          isSelected ? 'ring-2 ring-primary' : ''
        }`}
        onClick={onSelect}
      >
        <CardHeader className="flex flex-row items-start justify-between pb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {connection.shop_name ?? connection.shop_id}
              </CardTitle>
              {isSelected && (
                <CheckCircle2 className="h-4 w-4 text-primary" aria-label="Selected" />
              )}
            </div>
            <ConnectionStatusBadge status={connection.status} />
          </div>

          {/* Action buttons — stop click propagation so card click isn't also triggered */}
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSync}
              disabled={isSyncing || connection.status !== 'active'}
              title="Sync now"
            >
              {isSyncing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span className="ml-1.5">Sync</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDisconnectOpen(true)}
              className="text-destructive hover:text-destructive"
              title="Disconnect shop"
            >
              <Unplug className="h-3.5 w-3.5" />
              <span className="ml-1.5">Disconnect</span>
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 text-sm">
          {/* Expired token banner */}
          {connection.status === 'expired' && (
            <div onClick={(e) => e.stopPropagation()}>
              <ExpiredConnectionBanner connection={connection} />
            </div>
          )}

          {/* Sync status */}
          <SyncStatusIndicator
            lastSyncedAt={connection.last_synced_at}
            isSyncing={isSyncing}
          />

          {/* Granted scopes */}
          {connection.scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {connection.scopes.map((scope) => (
                <span
                  key={scope}
                  className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
                >
                  {scope}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <DisconnectConfirmDialog
        open={disconnectOpen}
        onOpenChange={setDisconnectOpen}
        connectionId={connection.id}
        shopName={connection.shop_name ?? connection.shop_id}
      />
    </>
  );
};
