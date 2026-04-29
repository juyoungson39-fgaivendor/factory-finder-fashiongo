import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { ChevronDown, ChevronUp, Layers, Calendar, TrendingUp, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Stats {
  totalActive:    number;
  newThisWeek:    number;
  activeClusters: number;
  avgSignal:      number | null;
}
interface PlatformPoint { platform: string; thisWeek: number; lastWeek: number; }
interface ClusterPoint  { name: string; growth: number; }

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PLATFORM_COLORS: Record<string, string> = {
  instagram:    '#c026d3', tiktok:       '#000000', vogue:        '#111111',
  elle:         '#dc2626', wwd:          '#374151', hypebeast:    '#15803d',
  highsnobiety: '#7e22ce', footwearnews: '#b45309', google:       '#3b82f6',
  amazon:       '#f97316', pinterest:    '#ef4444', fashiongo:    '#4f46e5',
  shein:        '#111827',
};

const STAT_CARDS = (s: Stats) => [
  { icon: <Layers    className="w-4 h-4" />, label: '총 활성 트렌드', value: s.totalActive.toLocaleString(),                          color: 'text-blue-600'   },
  { icon: <Calendar  className="w-4 h-4" />, label: '이번 주 신규',   value: s.newThisWeek.toLocaleString(),                          color: 'text-green-600'  },
  { icon: <TrendingUp className="w-4 h-4"/>, label: '활성 클러스터', value: s.activeClusters.toLocaleString(),                       color: 'text-purple-600' },
  { icon: <Zap       className="w-4 h-4" />, label: '평균 시그널',    value: s.avgSignal != null ? `${s.avgSignal}점` : 'N/A',         color: 'text-orange-600' },
];

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────
export const TrendMomentum = () => {
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [loaded,   setLoaded]   = useState(false);
  const [stats,        setStats]       = useState<Stats | null>(null);
  const [platformData, setPlatformData] = useState<PlatformPoint[]>([]);
  const [topClusters,  setTopClusters]  = useState<ClusterPoint[]>([]);

  useEffect(() => {
    if (!open || loaded) return;

    const fetch = async () => {
      setLoading(true);
      try {
        const now         = Date.now();
        const oneWeekAgo  = new Date(now - 7  * 864e5).toISOString();
        const twoWeeksAgo = new Date(now - 14 * 864e5).toISOString();

        const [recentRes, totalRes, clusterCountRes, topClusterRes] = await Promise.all([
          // 최근 14일 — 플랫폼 차트 & this-week 집계
          supabase
            .from('trend_analyses')
            .select('created_at, signal_score, source_data')
            .eq('status', 'analyzed')
            .gte('created_at', twoWeeksAgo)
            .limit(1000),
          // 전체 활성 트렌드 수 (count)
          supabase
            .from('trend_analyses')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'analyzed'),
          // 클러스터 수 (count)
          supabase
            .from('trend_clusters')
            .select('id', { count: 'exact', head: true }),
          // 성장률 상위 5개 클러스터
          supabase
            .from('trend_clusters')
            .select('cluster_name, cluster_name_kr, weekly_growth_rate')
            .order('weekly_growth_rate', { ascending: false, nullsFirst: false })
            .limit(5),
        ]);

        const rows       = recentRes.data ?? [];
        const thisWeekRows = rows.filter(r => r.created_at >= oneWeekAgo);
        const lastWeekRows = rows.filter(r => r.created_at <  oneWeekAgo);

        // 평균 시그널
        const signals  = rows.map(r => r.signal_score as number | null).filter((v): v is number => v != null);
        const avgSignal = signals.length
          ? Math.round(signals.reduce((a, b) => a + b, 0) / signals.length)
          : null;

        setStats({
          totalActive:    totalRes.count       ?? 0,
          newThisWeek:    thisWeekRows.length,
          activeClusters: clusterCountRes.count ?? 0,
          avgSignal,
        });

        // 플랫폼 차트 데이터
        const pMap = new Map<string, { thisWeek: number; lastWeek: number }>();
        for (const r of thisWeekRows) {
          const p = (r.source_data as Record<string,unknown>)?.platform as string ?? 'unknown';
          const e = pMap.get(p) ?? { thisWeek: 0, lastWeek: 0 };
          e.thisWeek++;
          pMap.set(p, e);
        }
        for (const r of lastWeekRows) {
          const p = (r.source_data as Record<string,unknown>)?.platform as string ?? 'unknown';
          const e = pMap.get(p) ?? { thisWeek: 0, lastWeek: 0 };
          e.lastWeek++;
          pMap.set(p, e);
        }
        setPlatformData(
          [...pMap.entries()]
            .map(([platform, counts]) => ({ platform, ...counts }))
            .sort((a, b) => b.thisWeek - a.thisWeek)
            .slice(0, 8)
        );

        // 급상승 클러스터 차트
        setTopClusters(
          (topClusterRes.data ?? []).map(c => ({
            name:   (c.cluster_name_kr || c.cluster_name).slice(0, 14),
            growth: Math.round(c.weekly_growth_rate ?? 0),
          }))
        );

        setLoaded(true);
      } catch (e) {
        console.warn('TrendMomentum fetch error:', e);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [open, loaded]);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* ── 헤더 토글 ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none shrink-0">📊</span>
          <span className="text-sm font-semibold text-foreground">Trend Momentum Dashboard</span>
          {stats && (
            <span className="text-xs text-muted-foreground truncate">
              총 {stats.totalActive}건 활성 · 이번 주 +{stats.newThisWeek}건
            </span>
          )}
        </div>
        {open
          ? <ChevronUp   className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* ── 펼침 영역 ─────────────────────────────────────── */}
      {open && (
        <div className="px-4 pb-5 space-y-4 border-t border-border/50">
          {/* 수치 카드 4개 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
            {(loading || !stats)
              ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
              : STAT_CARDS(stats).map(card => (
                  <div key={card.label} className="rounded-lg border border-border bg-background p-3 flex flex-col gap-1">
                    <div className={cn('flex items-center gap-1.5 text-muted-foreground', card.color)}>
                      {card.icon}
                      <span className="text-[11px]">{card.label}</span>
                    </div>
                    <span className={cn('text-2xl font-bold', card.color)}>{card.value}</span>
                  </div>
                ))
            }
          </div>

          {/* 차트 2개 */}
          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* ① 플랫폼별 수집 — 이번 주 vs 지난 주 */}
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  플랫폼별 수집 — 이번 주 vs 지난 주
                </p>
                {platformData.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">수집 데이터 없음</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={platformData} barSize={8} barCategoryGap="25%">
                      <XAxis
                        dataKey="platform"
                        tick={{ fontSize: 9 }}
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={42}
                      />
                      <YAxis tick={{ fontSize: 9 }} width={22} />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(val: number, name: string) =>
                          [val, name === 'thisWeek' ? '이번 주' : '지난 주']
                        }
                      />
                      <Bar dataKey="lastWeek" fill="#e5e7eb" radius={[2,2,0,0]} name="지난 주" />
                      <Bar dataKey="thisWeek"               radius={[2,2,0,0]} name="이번 주">
                        {platformData.map((entry, idx) => (
                          <Cell key={idx} fill={PLATFORM_COLORS[entry.platform] ?? '#6b7280'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* ② 급상승 클러스터 Top 5 */}
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="text-xs font-medium text-muted-foreground mb-3">
                  급상승 클러스터 Top 5 (주간 성장률)
                </p>
                {topClusters.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">클러스터 데이터 없음</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={topClusters} layout="vertical" barSize={14} barCategoryGap="20%">
                      <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `${v}%`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={82} />
                      <Tooltip
                        contentStyle={{ fontSize: 11 }}
                        formatter={(val: number) => [`${val}%`, '주간 성장률']}
                      />
                      <Bar dataKey="growth" radius={[0,2,2,0]}>
                        {topClusters.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              entry.growth >= 20 ? '#22c55e' :
                              entry.growth >=  0 ? '#3b82f6' :
                                                   '#ef4444'
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
};
