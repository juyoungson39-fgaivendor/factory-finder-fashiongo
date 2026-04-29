import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface TrendCluster {
  id: string;
  cluster_name: string;
  cluster_name_kr: string | null;
  representative_image_url: string | null;
  trend_count: number | null;
  platform_count: number | null;
  platforms: string[] | null;
  weekly_growth_rate: number | null;
  avg_signal_score: number | null;
  description: string | null;
}

interface ClusterTrend {
  id: string;
  trend_name: string;
  image_url: string | null;
  platform: string;
  created_at: string;
}

type SortKey = 'trend_count' | 'weekly_growth_rate' | 'avg_signal_score';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PLATFORM_DOMAINS: Record<string, string> = {
  instagram: 'instagram.com', tiktok: 'tiktok.com', vogue: 'vogue.com',
  elle: 'elle.com', wwd: 'wwd.com', hypebeast: 'hypebeast.com',
  highsnobiety: 'highsnobiety.com', footwearnews: 'footwearnews.com',
  google: 'google.com', amazon: 'amazon.com', pinterest: 'pinterest.com',
  fashiongo: 'fashiongo.net', shein: 'shein.com',
};
const FALLBACK_BG =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=200&fit=crop';
const getFavicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

// ─────────────────────────────────────────────────────────────
// ClusterCard
// ─────────────────────────────────────────────────────────────
const ClusterCard = ({
  cluster,
  expanded,
  onToggle,
}: {
  cluster: TrendCluster;
  expanded: boolean;
  onToggle: () => void;
}) => {
  const [trends, setTrends] = useState<ClusterTrend[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  const growthRate = cluster.weekly_growth_rate;
  const isPositive = growthRate != null && growthRate >= 0;

  // 아코디언 열릴 때 멤버 트렌드 로드
  useEffect(() => {
    if (!expanded || trends.length > 0) return;
    const load = async () => {
      setLoadingTrends(true);
      try {
        const { data } = await supabase
          .from('trend_analyses')
          .select('id, source_data, created_at')
          .eq('cluster_id', cluster.id)
          .eq('status', 'analyzed')
          .order('created_at', { ascending: false })
          .limit(20);

        const mapped: ClusterTrend[] = (data ?? []).map((row) => {
          const sd = (row.source_data as Record<string, unknown>) ?? {};
          return {
            id: row.id,
            trend_name: (sd.trend_name as string) || (sd.article_title as string) || '(제목 없음)',
            image_url:  (sd.image_url  as string) || null,
            platform:   (sd.platform   as string) || 'unknown',
            created_at: row.created_at,
          };
        });
        setTrends(mapped);
      } finally {
        setLoadingTrends(false);
      }
    };
    load();
  }, [expanded, cluster.id, trends.length]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── 카드 썸네일 영역 (클릭 시 토글) ──────────────── */}
      <button
        type="button"
        onClick={onToggle}
        className="relative w-full h-52 overflow-hidden group text-left"
      >
        {/* 배경 이미지 */}
        <img
          src={cluster.representative_image_url || FALLBACK_BG}
          alt={cluster.cluster_name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          onError={(e) => { e.currentTarget.src = FALLBACK_BG; }}
        />
        {/* 그라디언트 오버레이 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />

        {/* 성장률 배지 — 우상단 */}
        {growthRate != null && (
          <div className={cn(
            'absolute top-2.5 right-2.5 flex items-center gap-0.5 text-xs font-bold px-2 py-1 rounded-full shadow',
            isPositive ? 'bg-green-500 text-white' : 'bg-red-500 text-white',
          )}>
            {isPositive
              ? <TrendingUp   className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}{growthRate.toFixed(0)}%
          </div>
        )}

        {/* 하단 텍스트 오버레이 */}
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3 space-y-1">
          {/* 플랫폼 아이콘 */}
          {(cluster.platforms ?? []).length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {(cluster.platforms ?? []).slice(0, 6).map(p => (
                <img
                  key={p}
                  src={getFavicon(PLATFORM_DOMAINS[p] ?? p)}
                  alt={p}
                  className="w-4 h-4 object-contain rounded-full bg-white/20"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              ))}
            </div>
          )}
          {/* 클러스터 이름 */}
          <div>
            <p className="text-white font-bold text-base leading-tight" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {cluster.cluster_name_kr || cluster.cluster_name}
            </p>
            {cluster.cluster_name_kr && (
              <p className="text-white/70 text-xs">{cluster.cluster_name}</p>
            )}
          </div>
          {/* 트렌드 수 | 플랫폼 수 */}
          <div className="flex items-center gap-2 text-[11px] text-white/80">
            <span>{cluster.trend_count ?? 0}개 트렌드</span>
            {cluster.platform_count != null && (
              <>
                <span className="opacity-50">·</span>
                <span>{cluster.platform_count}개 플랫폼</span>
              </>
            )}
            {cluster.avg_signal_score != null && (
              <>
                <span className="opacity-50">·</span>
                <span>시그널 {Math.round(cluster.avg_signal_score)}점</span>
              </>
            )}
          </div>
        </div>

        {/* 아코디언 토글 아이콘 */}
        <div className="absolute top-2.5 left-2.5 bg-black/50 rounded-full p-1">
          {expanded
            ? <ChevronUp   className="w-3.5 h-3.5 text-white" />
            : <ChevronDown className="w-3.5 h-3.5 text-white" />}
        </div>
      </button>

      {/* ── 아코디언 — 멤버 트렌드 목록 ────────────────────── */}
      {expanded && (
        <div className="border-t border-border/50">
          {loadingTrends ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Skeleton className="w-10 h-10 rounded-md shrink-0" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))}
            </div>
          ) : trends.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              클러스터 내 트렌드 없음
            </p>
          ) : (
            <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
              {trends.map(trend => (
                <div key={trend.id} className="flex items-center gap-2.5">
                  <div className="shrink-0 w-10 h-10 rounded-md overflow-hidden bg-muted">
                    {trend.image_url ? (
                      <img src={trend.image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-muted-foreground/10" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{trend.trend_name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <img
                        src={getFavicon(PLATFORM_DOMAINS[trend.platform] ?? trend.platform)}
                        alt=""
                        className="w-3 h-3 object-contain"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(trend.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// TrendClusterView
// ─────────────────────────────────────────────────────────────
export const TrendClusterView = () => {
  const [clusters,  setClusters]  = useState<TrendCluster[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sortBy,    setSortBy]    = useState<SortKey>('trend_count');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 클러스터 목록 로드
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('trend_clusters')
          .select(
            'id, cluster_name, cluster_name_kr, representative_image_url, ' +
            'trend_count, platform_count, platforms, weekly_growth_rate, ' +
            'avg_signal_score, description',
          )
          .limit(30);
        if (error) throw error;
        setClusters((data ?? []) as unknown as TrendCluster[]);
      } catch (e) {
        console.warn('TrendClusterView fetch error:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 클라이언트 정렬
  const sorted = [...clusters].sort((a, b) => {
    const av = (a[sortBy] as number | null) ?? -1;
    const bv = (b[sortBy] as number | null) ?? -1;
    return bv - av;
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  }, []);

  const SORT_OPTS: { key: SortKey; label: string }[] = [
    { key: 'trend_count',        label: '트렌드 수'  },
    { key: 'weekly_growth_rate', label: '성장률'     },
    { key: 'avg_signal_score',   label: '시그널 점수' },
  ];

  return (
    <div>
      {/* 정렬 바 */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-muted-foreground">{clusters.length}개 클러스터</span>
        <div className="flex gap-1">
          {SORT_OPTS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border transition-colors',
                sortBy === opt.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 클러스터 카드 그리드 */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 space-y-2 border border-dashed border-border rounded-xl">
          <p className="text-2xl">📦</p>
          <p className="text-sm text-muted-foreground">아직 생성된 클러스터가 없습니다.</p>
          <p className="text-xs text-muted-foreground">트렌드가 수집되면 자동으로 클러스터가 구성됩니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(cluster => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              expanded={expandedId === cluster.id}
              onToggle={() => toggleExpand(cluster.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};
