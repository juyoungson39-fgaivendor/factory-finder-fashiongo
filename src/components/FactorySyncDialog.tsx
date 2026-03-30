import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { syncAllFactories, type SyncResults, type SyncStatus } from '@/lib/syncFactory';
import { toast } from 'sonner';

interface LogEntry {
  time: string;
  name: string;
  platform: string;
  status: SyncStatus;
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factories: { id: string; name: string; source_url?: string | null; source_platform?: string | null }[];
  onComplete: () => void;
}

export default function FactorySyncDialog({ open, onOpenChange, factories, onComplete }: Props) {
  const [platformFilter, setPlatformFilter] = useState<'all' | '1688' | 'alibaba'>('all');
  const [checkedItems, setCheckedItems] = useState({
    scores: true, credit: true, transactions: true, ai: true, basic: true,
  });
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState(0);
  const [currentName, setCurrentName] = useState('');
  const [currentPlatform, setCurrentPlatform] = useState('');
  const [stats, setStats] = useState({ success: 0, error: 0, skip: 0 });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<SyncResults | null>(null);
  const abortRef = useRef({ aborted: false });

  const resetState = () => {
    setSyncing(false);
    setDone(false);
    setProgress(0);
    setTotal(0);
    setCurrent(0);
    setCurrentName('');
    setCurrentPlatform('');
    setStats({ success: 0, error: 0, skip: 0 });
    setLogs([]);
    setResults(null);
    abortRef.current = { aborted: false };
  };

  const handleStart = useCallback(async () => {
    resetState();
    setSyncing(true);
    setTotal(factories.length);
    abortRef.current = { aborted: false };

    const res = await syncAllFactories(
      factories,
      (cur, tot, name, platform, status, message) => {
        setCurrent(cur);
        setTotal(tot);
        setProgress(Math.round((cur / tot) * 100));
        setCurrentName(name);
        setCurrentPlatform(platform);
        setStats(prev => ({
          success: prev.success + (status === 'success' ? 1 : 0),
          error: prev.error + (status === 'error' ? 1 : 0),
          skip: prev.skip + (status === 'skip' ? 1 : 0),
        }));
        setLogs(prev => [{
          time: new Date().toLocaleTimeString(),
          name, platform, status, message,
        }, ...prev]);
      },
      abortRef.current,
      platformFilter,
    );

    setResults(res);
    setSyncing(false);
    setDone(true);
    toast.success(`동기화 완료: ✅${res.success} ❌${res.error} ⏭️${res.skip}`);
    onComplete();
  }, [factories, platformFilter, onComplete]);

  const handleStop = () => {
    abortRef.current.aborted = true;
  };

  const handleRetry = async (failedIds: string[]) => {
    const failedFactories = factories.filter(f => failedIds.includes(f.id));
    if (failedFactories.length === 0) return;
    resetState();
    setSyncing(true);
    setTotal(failedFactories.length);

    const res = await syncAllFactories(
      failedFactories,
      (cur, tot, name, platform, status, message) => {
        setCurrent(cur);
        setTotal(tot);
        setProgress(Math.round((cur / tot) * 100));
        setCurrentName(name);
        setCurrentPlatform(platform);
        setStats(prev => ({
          success: prev.success + (status === 'success' ? 1 : 0),
          error: prev.error + (status === 'error' ? 1 : 0),
          skip: prev.skip + (status === 'skip' ? 1 : 0),
        }));
        setLogs(prev => [{
          time: new Date().toLocaleTimeString(),
          name, platform, status, message,
        }, ...prev]);
      },
      abortRef.current,
      platformFilter,
    );

    setResults(res);
    setSyncing(false);
    setDone(true);
    toast.success(`재시도 완료: ✅${res.success} ❌${res.error}`);
    onComplete();
  };

  const handleClose = () => {
    if (syncing) return;
    resetState();
    onOpenChange(false);
  };

  const checkItems = [
    { key: 'scores', label: '서비스 점수 / 평점' },
    { key: 'credit', label: '기업 신용등급' },
    { key: 'transactions', label: '거래 기록 (주문수/이행율/응답율)' },
    { key: 'ai', label: 'AI 분석 / 회사 소개' },
    { key: 'basic', label: '기본 정보 (팔로워/재방문율/설립일)' },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>🔄 공장 정보 자동 동기화</DialogTitle>
        </DialogHeader>

        {!syncing && !done && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-semibold mb-2 block">플랫폼 선택</Label>
              <RadioGroup value={platformFilter} onValueChange={(v) => setPlatformFilter(v as any)} className="flex gap-4">
                {[
                  { value: 'all', label: '전체 (1688 + Alibaba)' },
                  { value: '1688', label: '1688만' },
                  { value: 'alibaba', label: 'Alibaba만' },
                ].map(o => (
                  <div key={o.value} className="flex items-center gap-2">
                    <RadioGroupItem value={o.value} id={`pf-${o.value}`} />
                    <Label htmlFor={`pf-${o.value}`} className="text-xs cursor-pointer">{o.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="text-xs font-semibold mb-2 block">수집 항목</Label>
              <div className="space-y-2">
                {checkItems.map(item => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Checkbox
                      id={`ci-${item.key}`}
                      checked={checkedItems[item.key as keyof typeof checkedItems]}
                      onCheckedChange={(v) => setCheckedItems(prev => ({ ...prev, [item.key]: !!v }))}
                    />
                    <Label htmlFor={`ci-${item.key}`} className="text-xs cursor-pointer">{item.label}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-md p-3">
              <p className="text-xs text-amber-800 dark:text-amber-300">
                ⚠️ 1688.com 및 alibaba.com에 각각 로그인되어 있어야 합니다. 팝업 차단을 해제해주세요. 공장 수에 따라 수 분이 소요됩니다.
              </p>
            </div>
          </div>
        )}

        {(syncing || done) && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">{current} / {total}</span>
                <span className="text-xs font-bold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {syncing && currentName && (
              <div className="flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                <span className="text-xs font-medium truncate">{currentName}</span>
                <Badge variant="outline" className={`text-[10px] ${currentPlatform === '1688' ? 'bg-orange-50 text-orange-700 border-orange-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                  {currentPlatform === '1688' ? '🟠 1688' : '🟡 Alibaba'}
                </Badge>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs">
              <span>✅ 성공 <strong>{stats.success}</strong></span>
              <span>❌ 실패 <strong>{stats.error}</strong></span>
              <span>⏭️ 건너뜀 <strong>{stats.skip}</strong></span>
            </div>

            <ScrollArea className="h-40 border rounded-md p-2">
              {logs.map((log, i) => (
                <div key={i} className={`text-[11px] py-0.5 ${log.status === 'error' ? 'text-red-600' : log.status === 'skip' ? 'text-muted-foreground' : 'text-emerald-600'}`}>
                  <span className="text-muted-foreground mr-1">[{log.time}]</span>
                  {log.status === 'success' ? '✅' : log.status === 'error' ? '❌' : '⏭️'}
                  {' '}{log.name}
                  {log.platform && <span className="ml-1 text-muted-foreground">({log.platform})</span>}
                  {log.message && <span className="ml-1 text-muted-foreground">— {log.message}</span>}
                </div>
              ))}
            </ScrollArea>

            {done && results && results.failed.length > 0 && (
              <div className="border rounded-md p-3 bg-red-50 dark:bg-red-950/20">
                <p className="text-xs font-semibold text-red-700 mb-2">실패한 공장 ({results.failed.length}개)</p>
                {results.failed.map(f => (
                  <div key={f.id} className="text-[11px] text-red-600 truncate">{f.name}: {f.message}</div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 text-xs h-7 border-red-300 text-red-700 hover:bg-red-100"
                  onClick={() => handleRetry(results.failed.map(f => f.id))}
                >
                  🔄 실패 항목 재시도
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {!syncing && !done && (
            <>
              <Button variant="outline" size="sm" onClick={handleClose}>취소</Button>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleStart}>
                동기화 시작
              </Button>
            </>
          )}
          {syncing && (
            <Button variant="destructive" size="sm" onClick={handleStop}>중지</Button>
          )}
          {done && (
            <Button size="sm" onClick={handleClose}>닫기</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
