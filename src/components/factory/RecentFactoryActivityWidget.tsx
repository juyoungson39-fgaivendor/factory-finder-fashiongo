import { useFactoryLogs } from '@/hooks/useFactoryLogs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Plus, Pencil, Trash2, RotateCcw, AlertTriangle, History, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useMemo } from 'react';

const EVENT_META: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  FACTORY_CREATED: { label: '등록', icon: Plus, color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  FACTORY_UPDATED: { label: '수정', icon: Pencil, color: 'bg-blue-100 text-blue-700 border-blue-200' },
  FACTORY_DELETED: { label: '삭제', icon: Trash2, color: 'bg-red-100 text-red-700 border-red-200' },
  FACTORY_RESTORED: { label: '복구', icon: RotateCcw, color: 'bg-amber-100 text-amber-700 border-amber-200' },
  FACTORY_HARD_DELETED: { label: '영구삭제', icon: AlertTriangle, color: 'bg-red-200 text-red-900 border-red-300' },
};

const COLLAPSED_COUNT = 5;
const EXPANDED_COUNT = 20;

export function RecentFactoryActivityWidget() {
  const [expanded, setExpanded] = useState(false);
  const { data: logs, isLoading } = useFactoryLogs(undefined, EXPANDED_COUNT);

  // Resolve factory names for the logs we have
  const factoryIds = useMemo(
    () => Array.from(new Set((logs ?? []).map((l) => l.factory_id))),
    [logs],
  );

  const { data: factories } = useQuery({
    queryKey: ['factory-names', factoryIds],
    queryFn: async () => {
      if (factoryIds.length === 0) return {} as Record<string, string>;
      const { data, error } = await supabase
        .from('factories')
        .select('id,name')
        .in('id', factoryIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((f) => [f.id, f.name]));
    },
    enabled: factoryIds.length > 0,
    staleTime: 60_000,
  });

  const visibleLogs = (logs ?? []).slice(0, expanded ? EXPANDED_COUNT : COLLAPSED_COUNT);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          최근 변경 이력
        </CardTitle>
        {(logs?.length ?? 0) > COLLAPSED_COUNT && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setExpanded((v) => !v)}>
            {expanded ? (
              <>
                접기 <ChevronUp className="ml-1 h-3 w-3" />
              </>
            ) : (
              <>
                더 보기 <ChevronDown className="ml-1 h-3 w-3" />
              </>
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        )}

        {!isLoading && visibleLogs.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">아직 기록된 변경 이력이 없습니다.</p>
        )}

        {visibleLogs.map((log) => {
          const meta = EVENT_META[log.event_type] ?? {
            label: log.event_type,
            icon: Pencil,
            color: 'bg-muted text-muted-foreground border-border',
          };
          const Icon = meta.icon;
          const factoryName = factories?.[log.factory_id];

          return (
            <div
              key={log.id}
              className="flex items-start gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2 hover:bg-muted/40 transition-colors"
            >
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${meta.color}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`${meta.color} text-[10px]`}>
                    {meta.label}
                  </Badge>
                  {factoryName ? (
                    <Link
                      to={`/factories/${log.factory_id}`}
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {factoryName}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground italic">(삭제된 공장)</span>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ko })}
                    {' · '}
                    {log.created_by}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{log.event_message}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
