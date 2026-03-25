import { useMemo } from 'react';

export interface ProductLogEntry {
  id: string;
  event_type: string;
  event_message: string;
  event_data?: Record<string, any>;
  created_by: string;
  created_at: string;
}

const EVENT_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  AI_RECOMMENDED: { icon: '🤖', label: 'AI 추천', color: 'text-blue-600' },
  PUSH_QUEUED: { icon: '📋', label: 'Push 대기', color: 'text-muted-foreground' },
  PUSH_CONFIRMED: { icon: '🚀', label: 'Push 실행', color: 'text-primary' },
  PRODUCT_EDITED: { icon: '✏️', label: '상품 편집', color: 'text-warning' },
  PUSH_COMPLETED: { icon: '✅', label: '등록 완료', color: 'text-green-600' },
  PUSH_FAILED: { icon: '❌', label: '등록 실패', color: 'text-destructive' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  logs: ProductLogEntry[];
  compact?: boolean;
}

export default function ProductLogTimeline({ logs, compact }: Props) {
  const sorted = useMemo(() => [...logs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()), [logs]);

  if (sorted.length === 0) {
    return <p className="text-xs text-muted-foreground py-3 text-center">아직 기록된 이력이 없습니다.</p>;
  }

  return (
    <div className="space-y-0">
      {sorted.map((log, i) => {
        const cfg = EVENT_CONFIG[log.event_type] || { icon: '📝', label: log.event_type, color: 'text-muted-foreground' };
        return (
          <div key={log.id} className="flex gap-3 relative">
            {/* Timeline line */}
            <div className="flex flex-col items-center shrink-0 w-5">
              <span className="text-sm leading-none">{cfg.icon}</span>
              {i < sorted.length - 1 && <div className="w-px flex-1 bg-border mt-1" />}
            </div>
            <div className={`flex-1 pb-3 ${compact ? 'pb-2' : ''}`}>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium ${cfg.color}`}>{cfg.label}</span>
                <span className="text-[10px] text-muted-foreground">{formatDate(log.created_at)}</span>
              </div>
              <p className="text-xs text-foreground mt-0.5 leading-relaxed">{log.event_message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
