import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { useStartOAuth } from '@/integrations/alibaba/hooks/use-alibaba-connections';
import type { AlibabaConnection } from '@/integrations/alibaba/types';

interface ExpiredConnectionBannerProps {
  connection: AlibabaConnection;
}

/**
 * Alert banner shown when an Alibaba connection's access token has expired.
 * Provides a Re-connect button to restart the OAuth flow.
 */
export const ExpiredConnectionBanner = ({ connection }: ExpiredConnectionBannerProps) => {
  const { mutate: startOAuth, isPending } = useStartOAuth();

  if (connection.status !== 'expired') return null;

  const handleReconnect = () => {
    startOAuth({ platform: connection.platform });
  };

  return (
    <Alert variant="destructive" className="flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        <AlertTitle>Connection expired</AlertTitle>
        <AlertDescription>
          The access token for{' '}
          <span className="font-semibold">{connection.shop_name ?? connection.shop_id}</span>{' '}
          has expired. Re-connect your shop to continue syncing data.
        </AlertDescription>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleReconnect}
        disabled={isPending}
        className="shrink-0 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
      >
        {isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        <span className="ml-1.5">Re-connect</span>
      </Button>
    </Alert>
  );
};
