import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Store, Plug, Unplug, AlertTriangle, RefreshCcw, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useAlibabaConnections } from '@/integrations/alibaba/hooks/use-alibaba-connections';
import { useConnectAlibaba } from '@/integrations/alibaba/hooks/use-connect-alibaba';
import { useDisconnectAlibaba } from '@/integrations/alibaba/hooks/use-disconnect-alibaba';
import { useAlibabaCallbackResult } from '@/integrations/alibaba/hooks/use-alibaba-callback-result';
import type { AlibabaShopConnection, AlibabaConnectionStatus } from '@/integrations/alibaba/types';

const STATUS_META: Record<
  AlibabaConnectionStatus,
  { label: string; className: string }
> = {
  active: { label: '정상', className: 'bg-emerald-500 hover:bg-emerald-500' },
  refresh_required: { label: '재연결 필요', className: 'bg-amber-500 hover:bg-amber-500' },
  error: { label: '오류', className: 'bg-red-500 hover:bg-red-500' },
  revoked: { label: '해제됨', className: 'bg-gray-500 hover:bg-gray-500' },
};

const PLATFORM_LABEL: Record<string, string> = {
  alibaba_com: 'Alibaba.com',
  '1688': '1688',
  taobao: 'Taobao',
};

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ko });
  } catch {
    return '—';
  }
}

interface ConnectionRowProps {
  connection: AlibabaShopConnection;
  isDisconnecting: boolean;
  onDisconnect: (id: string) => void;
}

function ConnectionRow({ connection, isDisconnecting, onDisconnect }: ConnectionRowProps): JSX.Element {
  const status = STATUS_META[connection.status] ?? STATUS_META.error;
  const platformLabel = PLATFORM_LABEL[connection.platform] ?? connection.platform;
  const displayName = connection.shop_name ?? connection.shop_id;

  return (
    <Card>
      <CardContent className="py-4 flex items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Store className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{displayName}</span>
              <Badge variant="outline" className="text-xs">{platformLabel}</Badge>
              <Badge className={status.className}>{status.label}</Badge>
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              마지막 갱신: {relativeTime(connection.last_refreshed_at)}
              {connection.last_error ? (
                <span
                  className="ml-2 text-red-600 inline-block max-w-[24rem] truncate align-bottom"
                  title={connection.last_error}
                >
                  · {connection.last_error}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={isDisconnecting}>
              {isDisconnecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Unplug className="h-4 w-4 mr-1" />연결 해제
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>연결을 해제하시겠습니까?</AlertDialogTitle>
              <AlertDialogDescription>
                {displayName} 상점의 연결을 해제합니다. 해제 후에는 이 상점의 주문, 메시지, 재고를 다시 불러오려면 재연결이 필요합니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={() => onDisconnect(connection.id)}>
                연결 해제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export default function AlibabaSettings(): JSX.Element {
  // Side-effect: surface toast + invalidate query on callback redirect.
  useAlibabaCallbackResult();

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  const connectionsQuery = useAlibabaConnections();
  const connect = useConnectAlibaba();
  const disconnect = useDisconnectAlibaba();

  const connections = connectionsQuery.data ?? [];
  const inactiveConnections = connections.filter((c) => c.status !== 'active');
  const hasError = connections.some((c) => c.status === 'error');

  const handleConnect = (): void => {
    connect.mutate({ return_to: '/settings/alibaba' });
  };

  const handleDisconnect = (connectionId: string): void => {
    setDisconnectingId(connectionId);
    disconnect.mutate(
      { connection_id: connectionId },
      {
        onSettled: () => setDisconnectingId(null),
      },
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="h-6 w-6" /> Alibaba 상점 연결
        </h1>
        <p className="text-muted-foreground mt-1">
          Alibaba.com 공식 API를 통해 상점의 주문, 재고, 메시지를 안전하게 조회합니다.
          토큰은 Supabase Vault에 암호화되어 저장되며, 언제든 연결을 해제할 수 있습니다.
        </p>
      </div>

      {inactiveConnections.length > 0 ? (
        <Alert variant={hasError ? 'destructive' : 'default'}>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{inactiveConnections.length}개 상점에 조치가 필요합니다</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>
              {inactiveConnections.map((c) => c.shop_name ?? c.shop_id).join(', ')} —{' '}
              {hasError ? '오류가 발생했습니다.' : '재연결이 필요합니다.'}
            </span>
            <Button size="sm" variant="outline" onClick={handleConnect} disabled={connect.isPending}>
              <RefreshCcw className="h-4 w-4 mr-1" /> 재연결
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>연결된 상점</CardTitle>
            <CardDescription>
              현재 연결된 Alibaba 상점 목록입니다.
            </CardDescription>
          </div>
          <Button onClick={handleConnect} disabled={connect.isPending}>
            {connect.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Plug className="h-4 w-4 mr-1" />
            )}
            Alibaba 상점 연결
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {connectionsQuery.isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : connectionsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>연결 목록을 불러오지 못했습니다</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-3">
                <span>{connectionsQuery.error.message}</span>
                <Button size="sm" variant="outline" onClick={() => connectionsQuery.refetch()}>
                  다시 시도
                </Button>
              </AlertDescription>
            </Alert>
          ) : connections.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>연결된 상점이 없습니다.</p>
              <p className="text-sm mt-1">위 <span className="font-medium">Alibaba 상점 연결</span> 버튼으로 시작하세요.</p>
            </div>
          ) : (
            connections.map((c) => (
              <ConnectionRow
                key={c.id}
                connection={c}
                isDisconnecting={disconnectingId === c.id}
                onDisconnect={handleDisconnect}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
