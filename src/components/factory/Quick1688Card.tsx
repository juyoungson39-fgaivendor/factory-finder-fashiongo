import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Zap, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

type Step = { key: string; label: string; status: 'pending' | 'running' | 'ok' | 'fail' };

const REASON_LABEL: Record<string, string> = {
  shop_id_extract_failed:
    'Detail URL이라 shop subdomain을 못 찾았어요. 매장 페이지 URL로 다시 시도해주세요.',
  fetch_blocked_or_empty:
    '1688 차단 추정. [수동 큐에 추가] 버튼으로 manual_crawl_queue에 enqueue 하세요.',
  invalid_url: '올바른 1688 URL 형식이 아닙니다.',
  db_error: 'DB 저장 실패',
  unauthorized: '로그인이 필요합니다',
  exception: '실행 중 예외 발생',
};

export default function Quick1688Card() {
  const [url, setUrl] = useState('');
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<{ reason: string; offer_id?: string } | null>(null);

  const setStep = (key: string, status: Step['status']) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status } : s)));
  };

  const start = async () => {
    if (!url.trim()) return;
    setRunning(true);
    setResult(null);
    setError(null);
    const initial: Step[] = [
      { key: 'fetch', label: '페이지 fetch', status: 'running' },
      { key: 'extract', label: '데이터 추출', status: 'pending' },
      { key: 'score', label: '점수 계산', status: 'pending' },
      { key: 'db', label: 'DB UPSERT', status: 'pending' },
    ];
    setSteps(initial);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke('crawl-factory-1688', {
        body: { url: url.trim() },
      });
      if (invokeErr) throw invokeErr;
      if (!data?.ok) {
        setStep('fetch', 'fail');
        setError({ reason: data?.reason ?? 'unknown', offer_id: data?.offer_id });
        toast.error(REASON_LABEL[data?.reason] ?? data?.reason ?? '실패');
        return;
      }
      setStep('fetch', 'ok');
      setStep('extract', 'ok');
      setStep('score', 'ok');
      setStep('db', 'ok');
      setResult(data);
      toast.success(`✅ 크롤·스코어링 완료 — shop_id ${data.shop_id}`);
    } catch (e: any) {
      setStep('fetch', 'fail');
      setError({ reason: e?.message ?? 'exception' });
      toast.error('실행 실패: ' + (e?.message ?? 'unknown'));
    } finally {
      setRunning(false);
    }
  };

  const enqueueManual = async () => {
    const { error: e } = await supabase.from('manual_crawl_queue').insert({
      url: url.trim(),
      failure_reason: error?.reason ?? 'manual',
      status: 'pending',
    });
    if (e) toast.error('큐 추가 실패: ' + e.message);
    else toast.success('수동 처리 큐에 추가되었습니다');
  };

  const scores = result?.scores ?? null;
  const weighted = scores
    ? (
        (scores.self_shipping +
          scores.image_quality +
          scores.moq +
          scores.lead_time +
          scores.communication +
          scores.variety) /
        6
      ).toFixed(2)
    : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" />
          1688 자동 크롤링·스코어링
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="https://shopid.1688.com/page/offerlist.htm 또는 https://detail.1688.com/offer/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-10"
            disabled={running}
          />
          <Button
            type="button"
            onClick={start}
            disabled={!url.trim() || running}
            className="h-10 shrink-0 text-xs uppercase tracking-wider"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5 mr-2" />
            )}
            {running ? '실행 중...' : '크롤링 시작'}
          </Button>
        </div>

        {steps.length > 0 && (
          <div className="rounded-lg border bg-card p-3 space-y-1.5">
            {steps.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-xs">
                {s.status === 'pending' && <span className="w-3 h-3 inline-block">⏳</span>}
                {s.status === 'running' && (
                  <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                )}
                {s.status === 'ok' && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
                {s.status === 'fail' && <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                <span
                  className={
                    s.status === 'ok'
                      ? 'text-foreground'
                      : s.status === 'fail'
                        ? 'text-destructive'
                        : s.status === 'running'
                          ? 'text-primary'
                          : 'text-muted-foreground'
                  }
                >
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <p className="text-xs text-destructive">
              ❌ {REASON_LABEL[error.reason] ?? error.reason}
              {error.offer_id && <span className="ml-1 font-mono">(offer #{error.offer_id})</span>}
            </p>
            {error.reason === 'fetch_blocked_or_empty' && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={enqueueManual}>
                📥 수동 큐에 추가
              </Button>
            )}
          </div>
        )}

        {result?.ok && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground">
                ✅ shop_id <span className="font-mono">{result.shop_id}</span> · factory_id{' '}
                <Link
                  to={`/factories/${result.factory_id}`}
                  className="text-primary underline font-mono"
                >
                  {String(result.factory_id).slice(0, 8)}
                </Link>
              </p>
              <span className="text-xs font-medium">평균 {weighted}/10</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              {scores &&
                Object.entries(scores).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between rounded border bg-background px-2 py-1"
                  >
                    <span className="text-muted-foreground">{k}</span>
                    <span className="font-mono font-medium">{Number(v).toFixed(1)}</span>
                  </div>
                ))}
            </div>
            {result.raw_summary && (
              <div className="text-[10px] text-muted-foreground font-mono">
                yrs={result.raw_summary.years} · svc={result.raw_summary.service} · ret=
                {result.raw_summary.return_rate}% · cnt={result.raw_summary.product_count} · fans=
                {result.raw_summary.fan_count ?? '-'}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
