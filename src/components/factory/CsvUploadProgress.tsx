import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';

export interface CsvUploadProgressState {
  open: boolean;
  total: number;
  done: number;
  failed: number;
  current: string[];
}

interface Props {
  state: CsvUploadProgressState;
  onCancel?: () => void;
}

export function CsvUploadProgress({ state, onCancel }: Props) {
  if (!state.open) return null;
  const processed = state.done + state.failed;
  const pct = state.total > 0 ? Math.round((processed / state.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            CSV 등록 진행 중
          </h3>
          {onCancel && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancel} title="취소">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
        <Progress value={pct} className="h-2 mb-3" />
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>{processed} / {state.total} 처리</span>
          <span>{pct}%</span>
        </div>
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="text-emerald-600">✓ 성공 {state.done}</span>
          <span className="text-destructive">✗ 실패 {state.failed}</span>
        </div>
        {state.current.length > 0 && (
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2 space-y-1 max-h-24 overflow-y-auto">
            <div className="font-medium text-foreground">처리 중:</div>
            {state.current.slice(-3).map((u, i) => (
              <div key={i} className="truncate">· {u}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
