import { useEffect, useState, useCallback } from 'react';
import { useTrendKeywordStats, type KeywordStat, type KeywordCategory, CATEGORY_LABELS } from '@/hooks/useTrendKeywordStats';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/* ── 기간 옵션 ── */
type Period = '7d' | '30d';

/* ── 소스 옵션 ── */
const SOURCE_OPTIONS = [
  { value: 'all',       label: '전체' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'magazine',  label: '매거진' },
  { value: 'google',    label: 'Google' },
  { value: 'amazon',    label: 'Amazon' },
  { value: 'pinterest', label: 'Pinterest' },
];

/* ── 카테고리 배지 컬러 ── */
const CATEGORY_COLOR: Record<KeywordCategory, string> = {
  silhouette: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  material:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  print:      'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  color:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  style:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  item:       'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
};

/* ── CSS Sparkline (7일 bar chart) ── */
const Sparkline = ({ daily, period }: { daily: KeywordStat['daily']; period: Period }) => {
  const days = period === '7d' ? 7 : 30;

  // 오늘부터 역순으로 날짜 배열 생성
  const today = new Date();
  const slots = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (days - 1 - i));
    return d.toISOString().slice(0, 10);
  });

  const countMap = new Map(daily.map(d => [d.date, d.count]));
  const counts = slots.map(date => countMap.get(date) ?? 0);
  const max = Math.max(...counts, 1);

  return (
    <div className="flex items-end gap-[2px] h-7 w-full">
      {counts.map((c, i) => {
        const pct = Math.max((c / max) * 100, c > 0 ? 8 : 2);
        return (
          <div
            key={i}
            className={cn(
              'flex-1 rounded-sm transition-all duration-300',
              c > 0
                ? 'bg-primary/70 hover:bg-primary'
                : 'bg-muted'
            )}
            style={{ height: `${pct}%` }}
            title={`${slots[i]}: ${c}건`}
          />
        );
      })}
    </div>
  );
};

/* ── 증감률 Badge ── */
const GrowthBadge = ({ growth }: { growth: number | null }) => {
  if (growth === null) return <span className="text-xs text-muted-foreground">-</span>;

  if (growth > 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600">
      <TrendingUp className="w-3 h-3" /> +{growth}%
    </span>
  );
  if (growth < 0) return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-destructive">
      <TrendingDown className="w-3 h-3" /> {growth}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
      <Minus className="w-3 h-3" /> 0%
    </span>
  );
};

/* ── 스켈레톤 ── */
const RankingSkeleton = () => (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 p-2">
        <Skeleton className="w-6 h-4" />
        <Skeleton className="w-20 h-4" />
        <Skeleton className="w-14 h-5 rounded-full" />
        <Skeleton className="flex-1 h-7" />
        <Skeleton className="w-12 h-4" />
        <Skeleton className="w-14 h-4" />
      </div>
    ))}
  </div>
);

const PAGE_SIZE = 10;

/* ── Main Component ── */
const TrendKeywordRanking = () => {
  const [period, setPeriod] = useState<Period>('7d');
  const [source, setSource] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const { data, loading, fetch } = useTrendKeywordStats();
  const [initialized, setInitialized] = useState(false);

  const load = useCallback(async (src: string) => {
    await fetch({ platform: src });
    setInitialized(true);
    setCurrentPage(1);
  }, [fetch]);

  useEffect(() => {
    load(source);
  }, [source]);

  const keywords = data?.keywords ?? [];

  const sorted = [...keywords].sort((a, b) =>
    period === '7d' ? b.total_7d - a.total_7d : b.total_30d - a.total_30d
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const totalAnalyses = data?.total_analyses ?? 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">트렌드 키워드 랭킹</h3>
          {totalAnalyses > 0 && (
            <span className="text-[11px] text-muted-foreground">· 수집 데이터 {totalAnalyses.toLocaleString()}건 기준</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 기간 선택 */}
          <Select value={period} onValueChange={v => setPeriod(v as Period)}>
            <SelectTrigger className="h-7 text-xs w-[72px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7일</SelectItem>
              <SelectItem value="30d">30일</SelectItem>
            </SelectContent>
          </Select>

          {/* 소스 선택 */}
          <Select value={source} onValueChange={v => setSource(v)}>
            <SelectTrigger className="h-7 text-xs w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOURCE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 새로고침 */}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            disabled={loading}
            onClick={() => load(source)}
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* Table header */}
      {!loading && paginated.length > 0 && (
        <div className="grid grid-cols-[28px_1fr_80px_1fr_52px_64px] gap-x-3 px-2 text-[11px] font-medium text-muted-foreground border-b border-border pb-1.5">
          <span>#</span>
          <span>키워드</span>
          <span>카테고리</span>
          <span className="text-right pr-1">추세 ({period === '7d' ? '7일' : '30일'})</span>
          <span className="text-right">게시물</span>
          <span className="text-right">증감률</span>
        </div>
      )}

      {/* Rows */}
      {loading && !initialized ? (
        <RankingSkeleton />
      ) : sorted.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">
          {initialized
            ? '수집된 키워드 데이터가 없습니다. "지금 수집"을 먼저 실행해주세요.'
            : '키워드 데이터를 불러오는 중...'}
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/50">
            {paginated.map((kw, idx) => {
              const globalIdx = (safePage - 1) * PAGE_SIZE + idx;
              const count = period === '7d' ? kw.total_7d : kw.total_30d;
              const growth = period === '7d' ? kw.growth_7d : kw.growth_30d;
              return (
                <div
                  key={kw.keyword}
                  className={cn(
                    'grid grid-cols-[28px_1fr_80px_1fr_52px_64px] gap-x-3 items-center px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors',
                    globalIdx < 3 && 'font-medium'
                  )}
                >
                  {/* 순위 */}
                  <span className={cn(
                    'text-xs text-center w-6',
                    globalIdx === 0 && 'text-amber-500 font-bold text-sm',
                    globalIdx === 1 && 'text-slate-400 font-bold',
                    globalIdx === 2 && 'text-amber-700 font-bold',
                    globalIdx >= 3 && 'text-muted-foreground'
                  )}>
                    {globalIdx + 1}
                  </span>

                  {/* 키워드 */}
                  <span className="text-xs text-foreground truncate">{kw.keyword}</span>

                  {/* 카테고리 배지 */}
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full text-center truncate',
                    CATEGORY_COLOR[kw.category]
                  )}>
                    {CATEGORY_LABELS[kw.category]}
                  </span>

                  {/* 스파크라인 */}
                  <Sparkline daily={kw.daily} period={period} />

                  {/* 게시물 수 */}
                  <span className="text-xs text-right text-foreground tabular-nums">
                    {count.toLocaleString()}
                  </span>

                  {/* 증감률 */}
                  <div className="flex justify-end">
                    <GrowthBadge growth={growth} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 pt-2 border-t border-border">
              <button
                onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                disabled={safePage <= 1}
                style={{
                  padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4,
                  border: '1px solid #e1e3e5', background: '#fff',
                  color: safePage <= 1 ? '#b5b5b5' : '#202223',
                  cursor: safePage <= 1 ? 'default' : 'pointer',
                }}
              >
                ← 이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                  if (i > 0 && (p as number) - (arr[i - 1] as number) > 1) acc.push('...');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '...' ? (
                    <span key={`e-${i}`} style={{ fontSize: 12, color: '#b5b5b5', padding: '0 2px' }}>…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setCurrentPage(p as number)}
                      style={{
                        padding: '4px 9px', fontSize: 12, minWidth: 30, borderRadius: 4,
                        fontWeight: p === safePage ? 700 : 400,
                        border: p === safePage ? '1px solid #2c6ecb' : '1px solid #e1e3e5',
                        background: p === safePage ? '#f2f7fe' : '#fff',
                        color: p === safePage ? '#2c6ecb' : '#202223',
                        cursor: 'pointer',
                      }}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage >= totalPages}
                style={{
                  padding: '4px 10px', fontSize: 12, fontWeight: 500, borderRadius: 4,
                  border: '1px solid #e1e3e5', background: '#fff',
                  color: safePage >= totalPages ? '#b5b5b5' : '#202223',
                  cursor: safePage >= totalPages ? 'default' : 'pointer',
                }}
              >
                다음 →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TrendKeywordRanking;
