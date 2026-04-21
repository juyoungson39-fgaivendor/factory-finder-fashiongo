import { useFactoryLogs, type FactoryLog } from '@/hooks/useFactoryLogs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus, Pencil, Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

const EVENT_META: Record<
  string,
  { label: string; icon: typeof Plus; color: string }
> = {
  FACTORY_CREATED: { label: '등록', icon: Plus, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  FACTORY_UPDATED: { label: '수정', icon: Pencil, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  FACTORY_DELETED: { label: '삭제', icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200' },
  FACTORY_RESTORED: { label: '복구', icon: RotateCcw, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  FACTORY_HARD_DELETED: { label: '영구삭제', icon: AlertTriangle, color: 'bg-red-200 text-red-900 border-red-300' },
};

interface Props {
  factoryId: string;
}

export function FactoryLogTimeline({ factoryId }: Props) {
  const { data: logs, isLoading } = useFactoryLogs(factoryId, 50);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">변경 이력</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <>
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </>
        )}

        {!isLoading && (!logs || logs.length === 0) && (
          <p className="text-sm text-muted-foreground">아직 기록된 이력이 없습니다.</p>
        )}

        {logs?.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </CardContent>
    </Card>
  );
}

function LogRow({ log }: { log: FactoryLog }) {
  const meta = EVENT_META[log.event_type] ?? {
    label: log.event_type,
    icon: Pencil,
    color: 'bg-muted text-muted-foreground border-border',
  };
  const Icon = meta.icon;

  const changedFields =
    log.event_type === 'FACTORY_UPDATED' && log.event_data
      ? Object.keys(log.event_data)
      : [];

  return (
    <div className="flex gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${meta.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={meta.color}>
            {meta.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ko })}
            {' · '}
            {log.created_by}
          </span>
        </div>
        <p className="mt-1 text-sm">{log.event_message}</p>

        {changedFields.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {changedFields.map((f) => (
              <Badge key={f} variant="secondary" className="text-[10px]">
                {f}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
