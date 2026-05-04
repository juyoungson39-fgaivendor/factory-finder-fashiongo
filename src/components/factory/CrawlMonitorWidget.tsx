import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * /factories 상단 30초 자동 갱신 진행 모니터링 위젯.
 * 일괄 크롤(Detail→Shop, manual_crawl_queue)의 전체 진행 상황을 한 줄로 표시.
 */
export default function CrawlMonitorWidget() {
  const { data } = useQuery({
    queryKey: ['crawl-monitor'],
    queryFn: async () => {
      const [
        totalRes,
        scoredRes,
        blockedRes,
        qPendingRes,
        qProgressRes,
        qDoneRes,
        qFailedRes,
      ] = await Promise.all([
        supabase.from('factories').select('id', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('factories').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('score_status', 'ai_scored'),
        supabase.from('factories').select('id', { count: 'exact', head: true }).is('deleted_at', null).eq('score_status', 'blocked'),
        supabase.from('manual_crawl_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('manual_crawl_queue').select('id', { count: 'exact', head: true }).eq('status', 'in_progress'),
        supabase.from('manual_crawl_queue').select('id', { count: 'exact', head: true }).eq('status', 'done'),
        supabase.from('manual_crawl_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
      ]);
      return {
        total: totalRes.count ?? 0,
        scored: scoredRes.count ?? 0,
        blocked: blockedRes.count ?? 0,
        qPending: qPendingRes.count ?? 0,
        qProgress: qProgressRes.count ?? 0,
        qDone: qDoneRes.count ?? 0,
        qFailed: qFailedRes.count ?? 0,
      };
    },
    refetchInterval: 30000,
  });

  if (!data) return null;

  const items = [
    { label: '총공장', value: data.total, color: 'text-foreground' },
    { label: '점수완료', value: data.scored, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: '차단', value: data.blocked, color: 'text-amber-600 dark:text-amber-400' },
    { label: '큐대기', value: data.qPending, color: 'text-blue-600 dark:text-blue-400' },
    { label: '큐진행', value: data.qProgress, color: 'text-blue-600 dark:text-blue-400' },
    { label: '큐완료', value: data.qDone, color: 'text-emerald-600 dark:text-emerald-400' },
    { label: '큐실패', value: data.qFailed, color: 'text-destructive' },
  ];

  return (
    <div className="mb-4 p-3 rounded-lg border border-border bg-card flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
      <span className="font-medium uppercase tracking-wider text-muted-foreground">
        📊 크롤 모니터
      </span>
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{it.label}</span>
          <span className={`font-mono tabular-nums font-semibold ${it.color}`}>{it.value}</span>
        </span>
      ))}
      <span className="ml-auto text-[10px] text-muted-foreground">30초 자동 갱신</span>
    </div>
  );
}
