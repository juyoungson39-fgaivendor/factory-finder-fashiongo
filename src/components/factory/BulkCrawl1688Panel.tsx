import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface LogLine {
  url: string;
  status: 'pending' | 'running' | 'ok' | 'fail';
  message?: string;
  factory_id?: string;
}

const CONCURRENCY = 3;
const MAX_URLS = 50;

async function runOne(url: string): Promise<{ ok: boolean; reason?: string; factory_id?: string }> {
  const { data, error } = await supabase.functions.invoke('crawl-factory-1688', { body: { url } });
  if (error) return { ok: false, reason: error.message };
  if (!data?.ok) return { ok: false, reason: data?.reason ?? 'unknown' };
  return { ok: true, factory_id: data.factory_id };
}

export default function BulkCrawl1688Panel({ onDone }: { onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);

  const start = async () => {
    const urls = text
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, MAX_URLS);
    if (!urls.length) {
      toast.error('URL을 1개 이상 입력하세요');
      return;
    }

    setRunning(true);
    setProgress(0);
    const initial: LogLine[] = urls.map((u) => ({ url: u, status: 'pending' }));
    setLogs(initial);

    let done = 0;
    const queue = [...urls.map((u, i) => ({ u, i }))];

    const worker = async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) break;
        setLogs((prev) => prev.map((l, idx) => (idx === job.i ? { ...l, status: 'running' } : l)));
        const res = await runOne(job.u);
        if (res.ok) {
          setLogs((prev) =>
            prev.map((l, idx) =>
              idx === job.i ? { ...l, status: 'ok', factory_id: res.factory_id } : l,
            ),
          );
        } else {
          // enqueue to manual_crawl_queue
          await supabase.from('manual_crawl_queue').insert({
            url: job.u,
            failure_reason: res.reason ?? 'unknown',
            status: 'pending',
          });
          setLogs((prev) =>
            prev.map((l, idx) =>
              idx === job.i ? { ...l, status: 'fail', message: res.reason } : l,
            ),
          );
        }
        done += 1;
        setProgress(Math.round((done / urls.length) * 100));
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setRunning(false);
    toast.success(`완료: ${done}/${urls.length}`);
    onDone?.();
  };

  if (!open) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-9 text-xs uppercase tracking-wider font-medium border-purple-300 text-purple-700 hover:bg-purple-50"
        onClick={() => setOpen(true)}
      >
        <Zap className="w-3.5 h-3.5 mr-1.5" />
        📥 일괄 크롤
      </Button>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3 flex-row items-center justify-between">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          📥 일괄 1688 크롤 (최대 {MAX_URLS}개, 동시성 {CONCURRENCY})
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={running}>
          닫기
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'한 줄당 1 URL\nhttps://shopid.1688.com/page/offerlist.htm\nhttps://detail.1688.com/offer/123.html'}
          rows={6}
          disabled={running}
          className="font-mono text-xs"
        />
        <div className="flex items-center gap-3">
          <Button onClick={start} disabled={running} size="sm" className="h-9 text-xs">
            {running ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Zap className="w-3.5 h-3.5 mr-2" />}
            {running ? '진행 중...' : '크롤 시작'}
          </Button>
          {running && <Progress value={progress} className="flex-1 h-2" />}
          <span className="text-xs text-muted-foreground">{progress}%</span>
        </div>
        {logs.length > 0 && (
          <div className="rounded-md border bg-muted/30 max-h-56 overflow-auto text-[11px] font-mono">
            {logs.map((l, i) => (
              <div key={i} className="px-2 py-1 border-b last:border-0 flex items-center gap-2">
                <span className="w-12 shrink-0">
                  {l.status === 'pending' && '⏳'}
                  {l.status === 'running' && '🔄'}
                  {l.status === 'ok' && '✅'}
                  {l.status === 'fail' && '❌'}
                </span>
                <span className="flex-1 truncate">{l.url}</span>
                {l.message && <span className="text-destructive">{l.message}</span>}
                {l.factory_id && (
                  <a
                    href={`/factories/${l.factory_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline"
                  >
                    open
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
