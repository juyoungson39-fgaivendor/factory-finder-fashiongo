import { useState, useMemo, useEffect, useCallback } from 'react';
import TrendKeywordRanking from '@/components/trend/TrendKeywordRanking';
import { useTrendKeywordStats, type KeywordStat } from '@/hooks/useTrendKeywordStats';
import { useSnsTrendFeed, type TrendFeedItem, type PlatformFilter } from '@/hooks/useSnsTrendFeed';
import {
  Search, TrendingUp, ExternalLink, Loader2, Bot, RefreshCw, Trash2,
  Factory, CheckCircle2, Clock, CalendarClock,
  ShoppingBag, Eye, MousePointerClick, Heart,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import ScoreBadge from '@/components/ScoreBadge';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface BatchRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  triggered_by: 'manual' | 'scheduled';
  status: 'running' | 'completed' | 'failed' | 'partial';
  collected_count: number;
  analyzed_count: number;
  embedded_count: number;
  failed_count: number;
}

interface TrendMatchProduct {
  id: string;
  product_name: string;
  factory_name: string;
  factory_id: string;
  image_url: string | null;
  price: number | null;
  stock_quantity: number | null;
  category: string | null;
  fg_category: string | null;
  similarity: number;
}

interface TrendMatchResponse {
  trend: {
    id: string;
    title: string;
    image_url: string | null;
    ai_keywords: Array<{ keyword: string; type: string }>;
    trend_score: number;
  };
  matches: TrendMatchProduct[];
  total_matches: number;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const BOUTIQUE_HASHTAGS = [
  '#WomensBoutique', '#OnlineBoutique', '#BoutiqueLife', '#ShopSmall',
  '#SupportSmallBusiness', '#WomensOOTD', '#NewArrivals', '#BoutiqueFinds',
  '#FashionForWomen', '#StyleInspo', '#WomensClothing', '#BoutiqueStyle',
];


const PLATFORM_TABS: {
  value: PlatformFilter;
  label: string;
  icon: string;
}[] = [
  { value: 'all',        label: '전체',      icon: '🌐' },
  { value: 'instagram',  label: 'Instagram',  icon: '📸' },
  { value: 'tiktok',     label: 'TikTok',     icon: '🎵' },
  { value: 'magazine',   label: '매거진',     icon: '📰' },
  { value: 'google',     label: 'Google',     icon: '🔍' },
  { value: 'amazon',     label: 'Amazon',     icon: '🛒' },
  { value: 'pinterest',  label: 'Pinterest',  icon: '📌' },
  { value: 'fashiongo',  label: 'FashionGo',  icon: '🛍️' },
];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function formatRunDate(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function runDurationSec(run: BatchRun): number | null {
  if (!run.completed_at) return null;
  return Math.round(
    (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const KeywordGrowthBadge = ({ stat }: { stat: KeywordStat }) => {
  const growth = stat.growth_7d;
  if (growth === null) return null;
  const isUp = growth > 0;
  const isDown = growth < 0;
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full',
      isUp   && 'bg-emerald-100 text-emerald-700',
      isDown && 'bg-red-100 text-red-600',
      !isUp && !isDown && 'bg-secondary text-secondary-foreground'
    )}>
      {isUp ? '↑' : isDown ? '↓' : '→'} {stat.keyword}
      {growth !== 0 ? ` ${growth > 0 ? '+' : ''}${growth}%` : ''}
    </span>
  );
};

const LiveTrendCard = ({ item, selected, onClick, keywordStatsMap }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
  keywordStatsMap: Map<string, KeywordStat>;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const matchedStats = useMemo(() => {
    if (!keywordStatsMap.size) return [];
    return item.trend_keywords
      .map(k => keywordStatsMap.get(k.toLowerCase()))
      .filter((s): s is KeywordStat => !!s)
      .sort((a, b) => b.total_7d - a.total_7d)
      .slice(0, 2);
  }, [item.trend_keywords, keywordStatsMap]);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-border'
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden group">
        {!loaded && !imgError && <Skeleton className="absolute inset-0 rounded-none" />}
        {imgError ? (
          <div className="w-full h-full bg-muted flex items-center justify-center"><span className="text-4xl">📷</span></div>
        ) : (
          <img
            src={item.image_url}
            alt={item.trend_name}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-105', !loaded && 'opacity-0')}
            style={{ objectPosition: 'center 70%' }}
          />
        )}
        {loaded && item.ai_analyzed && (
          <span
            className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md text-white backdrop-blur-sm"
            style={{
              background: item.trend_score >= 80
                ? 'rgba(22,163,74,0.85)'
                : item.trend_score >= 60
                  ? 'rgba(217,119,6,0.85)'
                  : 'rgba(220,38,38,0.85)'
            }}
          >
            AI 분석완료 · {item.trend_score}점
          </span>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <p className="font-semibold text-sm text-foreground truncate">{item.trend_name}</p>
        {item.author && <p className="text-[11px] text-muted-foreground">출처 @{item.author.replace(/^@/, '')}</p>}
        {item.summary_ko && <p className="text-[11px] text-muted-foreground line-clamp-2">{item.summary_ko}</p>}
        <div className="flex gap-1 flex-wrap">
          {(item.search_hashtags?.length ? item.search_hashtags : BOUTIQUE_HASHTAGS.slice(0, 3)).map(t => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{t}</span>
          ))}
        </div>
        {matchedStats.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {matchedStats.map(stat => <KeywordGrowthBadge key={stat.keyword} stat={stat} />)}
          </div>
        )}
        {item.permalink && (
          <a
            href={item.permalink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors mt-1"
          >
            <ExternalLink className="w-3 h-3" /> 원본 보기 ↗
          </a>
        )}
      </div>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// FashionGo Buyer Signal Card
// ─────────────────────────────────────────────────────────────
const FashionGoTrendCard = ({ item, selected, onClick }: {
  item: TrendFeedItem;
  selected: boolean;
  onClick: () => void;
}) => {
  const [loaded, setLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);

  const signalScore = item.signal_strength ?? item.trend_score ?? 0;
  const scoreColor =
    signalScore >= 75 ? 'hsl(var(--chart-2))' :
    signalScore >= 50 ? 'hsl(var(--chart-4))' :
    'hsl(var(--destructive))';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border bg-card overflow-hidden text-left transition-all hover:shadow-md',
        selected
          ? 'border-violet-500 ring-2 ring-violet-400/30 shadow-lg'
          : 'border-violet-200 dark:border-violet-800'
      )}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] w-full overflow-hidden group">
        {!loaded && !imgError && <Skeleton className="absolute inset-0 rounded-none" />}
        {imgError ? (
          <div className="w-full h-full bg-violet-50 dark:bg-violet-950/30 flex items-center justify-center">
            <ShoppingBag className="w-10 h-10 text-violet-300" />
          </div>
        ) : (
          <img
            src={item.image_url}
            alt={item.trend_name}
            onLoad={() => setLoaded(true)}
            onError={() => setImgError(true)}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-105', !loaded && 'opacity-0')}
          />
        )}
        {loaded && (
          <>
            {/* Signal score badge */}
            <span
              className="absolute top-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-md text-white"
              style={{ background: scoreColor }}
            >
              {signalScore}점
            </span>
            {/* FG badge */}
            <span className="absolute bottom-2 left-2 text-[11px] px-2 py-1 rounded-md text-white font-bold backdrop-blur-sm"
              style={{ background: '#7C3AED' }}
            >
              🛍️ FashionGo
            </span>
            {selected && (
              <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-md bg-violet-600 text-white font-bold">
                ✓ 선택됨
              </span>
            )}
          </>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-2">
        <p className="font-semibold text-sm text-foreground truncate">
          🛍️ {item.trend_name || '(트렌드명 없음)'}
        </p>
        {item.trend_categories?.[0] && (
          <span className="inline-block text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 font-medium">
            {item.trend_categories[0]}
          </span>
        )}

        {/* Buyer signal metrics */}
        <div className="grid grid-cols-3 gap-1.5 py-1">
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <Eye className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold tabular-nums">
              {item.fg_view_count != null
                ? item.fg_view_count >= 1000
                  ? `${(item.fg_view_count / 1000).toFixed(1)}k`
                  : item.fg_view_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">조회</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <MousePointerClick className="w-3 h-3 text-muted-foreground" />
            <span className="text-[10px] font-bold tabular-nums">
              {item.fg_click_count != null
                ? item.fg_click_count >= 1000
                  ? `${(item.fg_click_count / 1000).toFixed(1)}k`
                  : item.fg_click_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">클릭</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 bg-muted/50 rounded-md p-1.5">
            <Heart className="w-3 h-3 text-rose-400" />
            <span className="text-[10px] font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {item.fg_wishlist_count != null
                ? item.fg_wishlist_count >= 1000
                  ? `${(item.fg_wishlist_count / 1000).toFixed(1)}k`
                  : item.fg_wishlist_count.toLocaleString()
                : '-'}
            </span>
            <span className="text-[9px] text-muted-foreground">위시</span>
          </div>
        </div>

        {item.summary_ko && (
          <p className="text-[11px] text-muted-foreground line-clamp-2">{item.summary_ko}</p>
        )}
      </div>
    </button>
  );
};

const TrendCardSkeleton = () => (
  <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
    <Skeleton className="aspect-[3/4] w-full rounded-none" />
    <div className="p-3 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="h-3 w-full" />
    </div>
  </div>
);

const MatchedProductSheetCard = ({ product }: { product: TrendMatchProduct }) => {
  const simPct = Math.round(product.similarity * 100);
  const simColor = simPct >= 80 ? 'text-emerald-600' : simPct >= 60 ? 'text-amber-500' : 'text-destructive';
  const simBg   = simPct >= 80 ? 'bg-emerald-100' : simPct >= 60 ? 'bg-amber-100' : 'bg-red-100';
  return (
    <div className="flex gap-3 p-3 rounded-lg border border-border bg-card hover:shadow-md transition-shadow">
      <div className="shrink-0 w-20 h-24 rounded-lg overflow-hidden bg-muted">
        {product.image_url ? (
          <img src={product.image_url} alt={product.product_name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Search className="w-5 h-5 text-muted-foreground/40" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-semibold text-foreground truncate">{product.product_name}</p>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Factory className="w-3 h-3" /> {product.factory_name}
        </p>
        <div className="flex items-center gap-2">
          <span className={cn('text-sm font-bold', simColor)}>{simPct}%</span>
          <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', simBg)} style={{ width: `${simPct}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {product.price != null && <span className="font-medium text-foreground">${product.price}</span>}
          {product.stock_quantity != null && <span>재고: {product.stock_quantity}</span>}
          {(product.category || product.fg_category) && (
            <span className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px]">
              {product.category || product.fg_category}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};


// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const ImageTrendTab = () => {
  // ── Feed state ─────────────────────────────────────────────
  const [selectedLiveItem, setSelectedLiveItem] = useState<TrendFeedItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchResult, setMatchResult] = useState<TrendMatchResponse | null>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');

  const { items: liveFeedItems, loading: feedLoading, refetch } = useSnsTrendFeed(platformFilter);
  const { data: kwStatsData, fetch: fetchKwStats } = useTrendKeywordStats();

  useEffect(() => { fetchKwStats(); }, [fetchKwStats]);

  const keywordStatsMap = useMemo(() => {
    const m = new Map<string, KeywordStat>();
    for (const kw of kwStatsData?.keywords ?? []) {
      m.set(kw.keyword.toLowerCase(), kw);
    }
    return m;
  }, [kwStatsData]);

  // ── Last run state (헤더 "마지막 수집" 표시용) ─────────────
  const [lastRun, setLastRun] = useState<BatchRun | null>(null);

  const fetchBatchHistory = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('batch_runs')
        .select('id, started_at, completed_at, triggered_by, status, collected_count, analyzed_count, embedded_count, failed_count')
        .order('started_at', { ascending: false })
        .limit(1);
      const runs = (data ?? []) as BatchRun[];
      if (runs.length > 0) setLastRun(runs[0]);
    } catch {
      // non-critical — silently skip if table not yet created
    }
  }, []);

  useEffect(() => { fetchBatchHistory(); }, [fetchBatchHistory]);

  // ── Pipeline: batch-pipeline Edge Function ─────────────────
  const [collecting, setCollecting] = useState(false);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'collecting' | 'analyzing' | 'embedding' | 'done'>('idle');
  const [pipelineInfo, setPipelineInfo] = useState('');

  const handleCollectNow = async () => {
    setCollecting(true);
    setPipelineStage('collecting');
    setPipelineInfo('');

    // Cycle stage labels as visual feedback while server-side pipeline runs
    const stageTimer = setInterval(() => {
      setPipelineStage((prev) => {
        if (prev === 'collecting') return 'analyzing';
        if (prev === 'analyzing') return 'embedding';
        return prev; // stay at 'embedding' until response arrives
      });
    }, 15_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        toast.error('로그인이 필요합니다.');
        clearInterval(stageTimer);
        setCollecting(false);
        setPipelineStage('idle');
        return;
      }

      const { data, error } = await supabase.functions.invoke('batch-pipeline', {
        body: {
          sources: ['instagram', 'tiktok', 'magazine', 'google', 'amazon', 'pinterest', 'fashiongo'],
          analyze: true,
          embed: true,
          triggered_by: 'manual',
        },
      });

      clearInterval(stageTimer);

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const collected = data?.collected ?? 0;
      const analyzed  = data?.analyzed  ?? 0;
      const embedded  = data?.embedded  ?? 0;

      setPipelineStage('done');
      setPipelineInfo(`수집 ${collected}건 / 분석 ${analyzed}건 / 임베딩 ${embedded}건`);
      toast.success(`파이프라인 완료 · 수집 ${collected} / 분석 ${analyzed} / 임베딩 ${embedded}`);

      refetch();
      fetchKwStats({ rebuild: true });
      await fetchBatchHistory();

      setTimeout(() => {
        setPipelineStage('idle');
        setPipelineInfo('');
      }, 3_000);
    } catch (e: unknown) {
      clearInterval(stageTimer);
      const msg = e instanceof Error ? e.message : '배치 수집에 실패했습니다.';
      toast.error(msg);
      setPipelineStage('idle');
      setPipelineInfo('');
    } finally {
      setCollecting(false);
    }
  };

  // ── Reset data ─────────────────────────────────────────────
  const handleResetData = async () => {
    if (!confirm('기존 트렌드 데이터를 모두 삭제합니다. 계속하시겠습니까?')) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }
      const { error } = await supabase.from('trend_analyses').delete().eq('user_id', userId);
      if (error) throw error;
      toast.success('데이터 초기화 완료');
      refetch();
      fetchKwStats({ rebuild: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '초기화에 실패했습니다.');
    }
  };

  // ── FashionGo 바이어 데이터 수집 ───────────────────────────
  const [fgCollecting, setFgCollecting] = useState(false);

  const handleCollectFG = async () => {
    setFgCollecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast.error('로그인이 필요합니다.'); return; }

      const { data, error } = await supabase.functions.invoke('collect-fg-buyer-signals', {
        body: { user_id: userId, limit: 20, mode: 'mock' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const saved = data?.trend_rows ?? data?.saved ?? 0;
      toast.success(`FashionGo 바이어 시그널 수집 완료 · ${saved}개 트렌드 추가`);
      refetch();
      fetchKwStats({ rebuild: true });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'FG 데이터 수집 실패');
    } finally {
      setFgCollecting(false);
    }
  };

  // ── Trend match helpers ────────────────────────────────────
  const [needsAnalysis, setNeedsAnalysis] = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);

  const resolveTrendAnalysisId = useCallback(async (item: TrendFeedItem) => {
    const { data: exactRow } = await supabase
      .from('trend_analyses')
      .select('id')
      .eq('id', item.id)
      .maybeSingle();
    if (exactRow?.id) return exactRow.id;

    const permalinkCandidates = [item.permalink, item.source_data?.permalink].filter(Boolean) as string[];
    for (const permalink of permalinkCandidates) {
      const { data: byPermalink } = await supabase
        .from('trend_analyses')
        .select('id')
        .eq('source_data->>permalink', permalink)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPermalink?.id) return byPermalink.id;
    }

    const postIdCandidates = [item.source_data?.post_id, item.id].filter(Boolean) as string[];
    for (const postId of postIdCandidates) {
      const { data: byPostId } = await supabase
        .from('trend_analyses')
        .select('id')
        .eq('source_data->>post_id', postId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byPostId?.id) return byPostId.id;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('로그인이 필요합니다.');

    const sourceData = {
      ...(item.source_data ?? {}),
      platform: item.platform, image_url: item.image_url,
      permalink: item.permalink, author: item.author,
      like_count: item.like_count, view_count: item.view_count,
      trend_name: item.trend_name, summary_ko: item.summary_ko,
      magazine_name: item.magazine_name, article_title: item.article_title,
      search_hashtags: item.search_hashtags ?? [],
      post_id: item.source_data?.post_id ?? item.id,
      collected_at: item.created_at,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('trend_analyses')
      .insert({ user_id: userId, trend_keywords: item.trend_keywords ?? [], trend_categories: item.trend_categories ?? [], status: 'pending', source_data: sourceData })
      .select('id')
      .single();

    if (insertErr || !inserted) throw new Error(insertErr?.message || 'trend_analyses row 생성 실패');
    return inserted.id;
  }, []);

  const fetchMatches = useCallback(async (item: TrendFeedItem) => {
    setMatchLoading(true);
    setMatchResult(null);
    setMatchError(null);
    setNeedsAnalysis(false);

    try {
      const analysisId = await resolveTrendAnalysisId(item);
      const { data, error } = await supabase.functions.invoke('match-trend-to-products', {
        body: { trend_item_id: analysisId, match_count: 20, match_threshold: 0.3 },
      });

      if (error) {
        let bodyText = '';
        try {
          if (error.context && typeof error.context.json === 'function') {
            bodyText = JSON.stringify(await error.context.json());
          } else if (error.context && typeof error.context.text === 'function') {
            bodyText = await error.context.text();
          }
        } catch { /* ignore */ }
        const errMsg = bodyText || error.message || String(error);
        if (errMsg.includes('embedding') || errMsg.includes('422') || errMsg.includes('analyze-trend') || errMsg.includes('404')) {
          setNeedsAnalysis(true);
          return;
        }
        throw new Error(errMsg);
      }

      if (data?.error) {
        const errStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        if (errStr.includes('embedding') || errStr.includes('analyze-trend') || errStr.includes('trend_item_id를 찾을 수 없습니다')) {
          setNeedsAnalysis(true);
          return;
        }
        throw new Error(errStr);
      }

      setMatchResult(data as TrendMatchResponse);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '매칭 실패';
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
    }
  }, [resolveTrendAnalysisId]);

  const handleSelectLiveItem = useCallback(async (item: TrendFeedItem) => {
    setSelectedLiveItem(item);
    setSheetOpen(true);
    await fetchMatches(item);
  }, [fetchMatches]);

  const handleRunAnalysisForItem = useCallback(async () => {
    if (!selectedLiveItem) return;
    setAnalysisRunning(true);
    try {
      const baseAnalysisId = await resolveTrendAnalysisId(selectedLiveItem);
      const { data: aData, error: aErr } = await supabase.functions.invoke('analyze-trend', { body: { trend_item_id: baseAnalysisId } });
      if (aErr) throw aErr;
      if (aData?.error) throw new Error(aData.error);

      const analysisId: string = aData?.id || baseAnalysisId;
      const sd = selectedLiveItem.source_data ?? {};
      const textForEmbed = [
        selectedLiveItem.trend_keywords?.join(' '),
        selectedLiveItem.trend_name || sd.trend_name,
        selectedLiveItem.summary_ko  || sd.summary_ko,
        sd.caption?.substring(0, 300),
      ].filter(Boolean).join(' ') || selectedLiveItem.trend_name || sd.trend_name || '';

      const embedBody: Record<string, unknown> = { table: 'trend_analyses', id: analysisId, text: textForEmbed };
      const imageUrl = selectedLiveItem.image_url || sd.image_url;
      if (imageUrl) embedBody.image_url = imageUrl;

      const { data: eData, error: eErr } = await supabase.functions.invoke('generate-embedding', { body: embedBody });
      if (eErr) throw eErr;
      if (eData?.error) throw new Error(eData.error);

      setNeedsAnalysis(false);
      await fetchMatches(selectedLiveItem);
      toast.success('AI 분석 + 임베딩 완료, 매칭 결과를 불러왔습니다.');
      refetch();
    } catch (e: unknown) {
      toast.error(`분석 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setAnalysisRunning(false);
    }
  }, [selectedLiveItem, resolveTrendAnalysisId, fetchMatches, refetch]);

  const hasLiveFeed = !feedLoading && liveFeedItems.length > 0;
  const isCollectDisabled = collecting || pipelineStage === 'done';

  const FEED_PAGE_SIZE = 20;
  const [showAllFeed, setShowAllFeed] = useState(false);
  const visibleFeedItems = showAllFeed ? liveFeedItems : liveFeedItems.slice(0, FEED_PAGE_SIZE);

  // 플랫폼 탭 전환 시 "더 보기" 상태 초기화
  useEffect(() => { setShowAllFeed(false); }, [platformFilter]);

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* ① 트렌드 키워드 랭킹 */}
      <TrendKeywordRanking />

      {/* ② SNS 트렌드 피드 */}
      <div>
        {/* Header row */}
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-primary" /> SNS 트렌드 피드
          </h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={handleResetData}>
              <Trash2 className="w-3.5 h-3.5" /> 🗑️ 데이터 초기화
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              disabled={isCollectDisabled}
              onClick={handleCollectNow}
            >
              {collecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : pipelineStage === 'done'
                  ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
              {pipelineStage === 'collecting' && '수집 중...'}
              {pipelineStage === 'analyzing' && 'AI 분석 중...'}
              {pipelineStage === 'embedding' && '임베딩 생성 중...'}
              {pipelineStage === 'done'      && `완료! ${pipelineInfo}`}
              {pipelineStage === 'idle'      && '지금 수집'}
            </Button>
          </div>
        </div>

        {/* Auto-schedule info + last run summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 min-h-[20px]">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block shrink-0" />
            자동 수집: 매주 월요일 09:00
          </span>
          {lastRun && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="w-3 h-3 shrink-0" />
              마지막 수집: {formatRunDate(lastRun.started_at)}
              {' '}({lastRun.collected_count}건 수집 / {lastRun.analyzed_count}건 분석 / {lastRun.embedded_count}건 임베딩)
            </span>
          )}
        </div>

        {/* Platform filter tabs */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {PLATFORM_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setPlatformFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                platformFilter === tab.value
                  ? tab.value === 'fashiongo'
                    ? 'bg-violet-600 text-white'
                    : 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* FashionGo 탭 전용: 바이어 시그널 배너 + 수집 버튼 */}
        {platformFilter === 'fashiongo' && (
          <div className="flex items-center justify-between gap-3 mb-3 px-4 py-3 rounded-xl border border-violet-200 bg-violet-50/60 dark:bg-violet-950/20 dark:border-violet-800">
            <div className="flex items-start gap-3">
              <ShoppingBag className="w-5 h-5 text-violet-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">
                  FashionGo 바이어 행동 시그널
                </p>
                <p className="text-xs text-violet-600/80 dark:text-violet-400 mt-0.5">
                  조회수·클릭수·위시리스트 데이터 기반 실시간 트렌드 (Mock 모드)
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-100 shrink-0"
              disabled={fgCollecting}
              onClick={handleCollectFG}
            >
              {fgCollecting
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <ShoppingBag className="w-3.5 h-3.5" />
              }
              {fgCollecting ? '수집 중...' : 'FG 데이터 수집'}
            </Button>
          </div>
        )}

        {/* Loading skeleton */}
        {feedLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => <TrendCardSkeleton key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!feedLoading && liveFeedItems.length === 0 && (
          <div className="text-center py-12 space-y-3 border border-dashed border-border rounded-xl">
            {platformFilter === 'fashiongo' ? (
              <>
                <ShoppingBag className="w-10 h-10 mx-auto text-violet-300" />
                <p className="text-sm text-muted-foreground">FashionGo 바이어 데이터가 없습니다.</p>
                <p className="text-xs text-muted-foreground">"FG 데이터 수집" 버튼을 눌러 시그널을 가져오세요.</p>
              </>
            ) : (
              <>
                <Search className="w-10 h-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">트렌드를 수집 중입니다...</p>
                <p className="text-xs text-muted-foreground">"지금 수집" 버튼을 누르거나 자동 스케줄을 기다려주세요.</p>
              </>
            )}
          </div>
        )}

        {/* Live feed cards */}
        {hasLiveFeed && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {visibleFeedItems.map(item => (
                item.platform === 'fashiongo' ? (
                  <FashionGoTrendCard
                    key={item.id}
                    item={item}
                    selected={selectedLiveItem?.id === item.id}
                    onClick={() => handleSelectLiveItem(item)}
                  />
                ) : (
                  <LiveTrendCard
                    key={item.id}
                    item={item}
                    selected={selectedLiveItem?.id === item.id}
                    onClick={() => handleSelectLiveItem(item)}
                    keywordStatsMap={keywordStatsMap}
                  />
                )
              ))}
            </div>
            {liveFeedItems.length > FEED_PAGE_SIZE && (
              <div className="text-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAllFeed(prev => !prev)}
                  className="text-xs"
                >
                  {showAllFeed
                    ? `접기 ↑`
                    : `더 보기 (${liveFeedItems.length - FEED_PAGE_SIZE}개 더) ↓`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Sheet Panel ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
          {selectedLiveItem && (
            <>
              <SheetHeader className="p-5 pb-3 space-y-3 border-b border-border">
                <div className="flex gap-3">
                  <div className="shrink-0 w-24 h-32 rounded-lg overflow-hidden border border-border">
                    <img src={selectedLiveItem.image_url} alt={selectedLiveItem.trend_name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <SheetTitle className="text-base truncate">{selectedLiveItem.trend_name}</SheetTitle>
                    <SheetDescription className="sr-only">매칭 공장 상품 패널</SheetDescription>
                    <div className="flex items-center gap-2">
                      {selectedLiveItem.ai_analyzed
                        ? <ScoreBadge score={selectedLiveItem.trend_score} size="sm" />
                        : <span className="text-xs text-muted-foreground">-</span>}
                      {selectedLiveItem.ai_analyzed && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          AI 분석완료
                        </span>
                      )}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {(selectedLiveItem.ai_keywords?.length
                        ? selectedLiveItem.ai_keywords.map(k => k.keyword)
                        : (selectedLiveItem.search_hashtags?.length ? selectedLiveItem.search_hashtags : BOUTIQUE_HASHTAGS.slice(0, 4))
                      ).slice(0, 6).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <Factory className="w-4 h-4 text-primary" /> 매칭 공장 상품
                  </h4>
                  {matchResult && <span className="text-xs text-muted-foreground">{matchResult.total_matches}건</span>}
                </div>

                {matchLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                        <Skeleton className="w-20 h-24 rounded-lg" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                          <Skeleton className="h-2 w-full" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!matchLoading && needsAnalysis && (
                  <div className="text-center py-8 space-y-3 border border-dashed border-border rounded-lg">
                    <Bot className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">이 트렌드 아이템은 아직 AI 분석이 되지 않았습니다.</p>
                    <p className="text-xs text-muted-foreground">분석 → 임베딩 → 매칭을 순차적으로 실행합니다.</p>
                    <Button size="sm" onClick={handleRunAnalysisForItem} disabled={analysisRunning} className="gap-1.5">
                      {analysisRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                      {analysisRunning ? 'AI 분석 실행 중...' : 'AI 분석 실행'}
                    </Button>
                  </div>
                )}

                {!matchLoading && !needsAnalysis && matchError && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm text-destructive font-medium">⚠️ {matchError}</p>
                  </div>
                )}

                {!matchLoading && !matchError && matchResult && matchResult.matches.length === 0 && (
                  <div className="text-center py-8 space-y-2 border border-dashed border-border rounded-lg">
                    <Search className="w-8 h-8 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground font-medium">아직 매칭된 공장 상품이 없습니다.</p>
                    <p className="text-xs text-muted-foreground">공장 상품 임베딩을 먼저 실행해주세요.</p>
                  </div>
                )}

                {!matchLoading && matchResult && matchResult.matches.length > 0 && (
                  <div className="space-y-2">
                    {matchResult.matches.map(p => <MatchedProductSheetCard key={p.id} product={p} />)}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ImageTrendTab;
