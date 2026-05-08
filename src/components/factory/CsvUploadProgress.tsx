import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Loader2, X, CheckCircle2, XCircle, Clock } from 'lucide-react';

export type CsvRowStatus = 'pending' | 'crawling' | 'success' | 'failed';

export interface CsvRowState {
  url: string;
  status: CsvRowStatus;
  reason?: string;
}

export interface CsvUploadProgressState {
  open: boolean;
  total: number;
  done: number;
  failed: number;
  current: string[]; // legacy — kept for back-compat
  rows?: CsvRowState[];
  finished?: boolean;
}

interface Props {
  state: CsvUploadProgressState;
  onCancel?: () => void;
  onClose?: () => void;
}

const statusIcon = (s: CsvRowStatus) => {
  switch (s) {
    case 'success': return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />;
    case 'failed': return <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;
    case 'crawling': return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />;
    default: return <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
  }
};

const statusLabel = (s: CsvRowStatus) => {
  switch (s) {
    case 'success': return '완료';
    case 'failed': return '실패';
    case 'crawling': return '크롤링 중';
    default: return '대기';
  }
};

export function CsvUploadProgress({ state, onCancel, onClose }: Props) {
  if (!state.open) return null;
  const processed = state.done + state.failed;
  const pct = state.total > 0 ? Math.round((processed / state.total) * 100) : 0;
  const rows = state.rows ?? [];
  const finished = state.finished || (state.total > 0 && processed >= state.total);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2">
            {finished ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            )}
            {finished ? 'CSV 등록 완료' : 'CSV 등록 진행 중'}
          </h3>
          {finished && onClose ? (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose} title="닫기">
              <X className="w-4 h-4" />
            </Button>
          ) : (!finished && onCancel ? (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onCancel} title="취소">
              <X className="w-4 h-4" />
            </Button>
          ) : null)}
        </div>

        <Progress value={pct} className="h-2 mb-3" />
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <span>{processed} / {state.total} 처리</span>
          <span>{pct}%</span>
        </div>
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="text-emerald-600">✓ 성공 {state.done}</span>
          <span className="text-destructive">✗ 실패 {state.failed}</span>
          <span className="text-muted-foreground">⏳ 남음 {Math.max(0, state.total - processed)}</span>
        </div>

        {rows.length > 0 && (
          <div className="border-t border-border pt-2 max-h-64 overflow-y-auto space-y-1">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px]">
                {statusIcon(r.status)}
                <span className="truncate flex-1" title={r.url}>{r.url}</span>
                <span className={
                  r.status === 'success' ? 'text-emerald-600'
                  : r.status === 'failed' ? 'text-destructive'
                  : r.status === 'crawling' ? 'text-primary'
                  : 'text-muted-foreground'
                }>
                  {statusLabel(r.status)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!finished && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            크롤링은 공장당 1~3분 소요됩니다. 창을 닫지 말고 모두 완료될 때까지 기다려주세요.
          </p>
        )}
      </div>
    </div>
  );
}
