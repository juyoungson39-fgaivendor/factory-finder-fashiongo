import { useState, useMemo, useRef, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
  AreaChart, Area, LineChart, Line, CartesianGrid,
} from 'recharts';
import { Layers, Calendar, TrendingUp, TrendingDown, Download, Loader2, Eye, Search, MessageCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  useTrendReport,
  LIFECYCLE_META,
  type TrendReportData,
  type LifecyclePoint,
  type StylePoint,
  type KeywordPoint,
  type PlatformPoint,
  type RisingKeywordPoint,
  type CategoryRankPoint,
  type TimeSeriesData,
  type LifecycleByCategoryPoint,
} from '@/hooks/useTrendReport';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: '7',  label: '이번 주 (7일)' },
  { value: '14', label: '2주 (14일)' },
  { value: '30', label: '1개월 (30일)' },
];

/** DB에 수집되는 전체 지원 플랫폼 목록 (lowercase, DB 값과 일치) */
const SUPPORTED_PLATFORMS = [
  'tiktok', 'instagram', 'vogue', 'elle', 'wwd', 'hypebeast',
  'highsnobiety', 'footwearnews', 'google', 'amazon', 'pinterest',
  'fashiongo', 'shein', 'zara',
] as const;
type SupportedPlatform = typeof SUPPORTED_PLATFORMS[number];

const PLATFORM_COLORS: Record<string, string> = {
  instagram:    '#c026d3', tiktok:       '#000000', vogue:        '#111111',
  elle:         '#dc2626', wwd:          '#374151', hypebeast:    '#15803d',
  highsnobiety: '#7e22ce', footwearnews: '#b45309', google:       '#3b82f6',
  amazon:       '#f97316', pinterest:    '#ef4444', fashiongo:    '#4f46e5',
  shein:        '#111827', zara:         '#1a1a1a',
};

const PLATFORM_DOMAINS: Record<string, string> = {
  instagram: 'instagram.com', tiktok: 'tiktok.com', vogue: 'vogue.com',
  elle: 'elle.com', wwd: 'wwd.com', hypebeast: 'hypebeast.com',
  highsnobiety: 'highsnobiety.com', footwearnews: 'footwearnews.com',
  google: 'google.com', amazon: 'amazon.com', pinterest: 'pinterest.com',
  fashiongo: 'fashiongo.net', shein: 'shein.com', zara: 'zara.com',
};
const getFavicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

/** Platform colours for the timeline chart (spec values) */
const PLATFORM_LINE_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  pinterest: '#E60023',
  tiktok:    '#000000',
  google:    '#4285F4',
  zara:      '#000000',   // dashed to distinguish from tiktok
  shein:     '#FF6F00',
};

/** Lifecycle colours for the timeline chart (from LIFECYCLE_META, rounded) */
const LIFECYCLE_LINE_COLORS: Record<string, string> = {
  emerging:  '#22c55e',
  rising:    '#3b82f6',
  peak:      '#f59e0b',
  declining: '#9ca3af',
  classic:   '#8b5cf6',
};

type TimelineTab = '전체' | '플랫폼별' | '라이프사이클별';
const TIMELINE_TABS: TimelineTab[] = ['전체', '플랫폼별', '라이프사이클별'];

const formatXDate = (v: string): string => {
  const [, m, d] = v.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
};

// ─────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────
const Section = ({
  title,
  children,
  className,
  headerRight,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
  headerRight?: ReactNode;
}) => (
  <div className={cn('rounded-md border border-border bg-card p-4 shadow-[0_1px_0_0_rgba(26,26,26,0.07)]', className)}>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
        {title}
      </h3>
      {headerRight}
    </div>
    {children}
  </div>
);

// ─────────────────────────────────────────────────────────────
// Section 1 — Stat Cards
// ─────────────────────────────────────────────────────────────
const StatCards = ({
  data,
  loading,
  periodDays,
}: {
  data: TrendReportData | null;
  loading: boolean;
  periodDays: number;
}) => {
  const periodLabel =
    periodDays === 7 ? '이번 주' : periodDays === 14 ? '2주' : '1개월';

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
      </div>
    );
  }

  const s = data.stats;
  const newChangeRate =
    s.prevNewThisPeriod > 0
      ? Math.round(((s.newThisPeriod - s.prevNewThisPeriod) / s.prevNewThisPeriod) * 100)
      : s.newThisPeriod > 0 ? 100 : 0;

  // 제거된 카드 (2026-05): 활성 소싱 상품, 위시리스트(mock), 외부 링크 클릭률(데이터 부족)
  const cards: Array<{
    label: string;
    value: string;
    suffix?: string;
    change: number | null;
    changeLabel: string;
    placeholder?: boolean;
    icon?: typeof Eye;
  }> = [
    {
      label:       '총 활성 트렌드',
      value:       s.totalActive.toLocaleString(),
      suffix:      '건',
      change:      newChangeRate,
      changeLabel: `${periodLabel} +${s.newThisPeriod}건`,
    },
    {
      label:       `${periodLabel} 신규`,
      value:       s.newThisPeriod.toLocaleString(),
      suffix:      '건',
      change:      newChangeRate,
      changeLabel: `전기간 ${s.prevNewThisPeriod}건`,
    },
    {
      label:       '조회',
      value:       s.views.current.toLocaleString(),
      suffix:      '건',
      change:      s.views.momPct,
      changeLabel: `고유 ${s.views.distinctCount.toLocaleString()}건`,
      icon:        Eye,
    },
    {
      label:       '검색',
      value:       s.searches.current.toLocaleString(),
      suffix:      '건',
      change:      s.searches.momPct,
      changeLabel: `고유 키워드 ${s.searches.distinctKeywords}개`,
      icon:        Search,
    },
    {
      label:       '피드백',
      value:       s.feedback.current > 0 ? s.feedback.current.toLocaleString() : '집계 중',
      suffix:      s.feedback.current > 0 ? '건' : undefined,
      change:      s.feedback.momPct,
      changeLabel: s.feedback.accuracyPct != null
        ? `정확률 ${s.feedback.accuracyPct}% (P${s.feedback.positive}/N${s.feedback.negative})`
        : '데이터 누적 중',
      placeholder: s.feedback.current === 0,
      icon:        MessageCircle,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {cards.map(card => {
        const Icon = card.icon;
        const isPositive = card.change == null || card.change >= 0;
        return (
          <div
            key={card.label}
            className={cn(
              'rounded-md border border-border bg-card p-3 flex flex-col gap-1.5 shadow-[0_1px_0_0_rgba(26,26,26,0.07)]',
              card.placeholder && 'opacity-70',
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-muted-foreground font-medium truncate">{card.label}</span>
              {Icon && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-foreground tabular-nums">{card.value}</span>
              {card.suffix && <span className="text-xs text-muted-foreground">{card.suffix}</span>}
            </div>
            <div className="flex items-center gap-1">
              {card.change != null ? (
                <>
                  <span className={cn(
                    'flex items-center gap-0.5 text-[11px] font-semibold',
                    isPositive ? 'text-emerald-600' : 'text-rose-600',
                  )}>
                    {isPositive
                      ? <TrendingUp  className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{card.change}%
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate">{card.changeLabel}</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground truncate">{card.changeLabel}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 2 — Platform Chart
// ─────────────────────────────────────────────────────────────
type MergedPlatformPoint = PlatformPoint & { isEmpty: boolean };

const PlatformChart = ({
  data,
  loading,
}: {
  data: PlatformPoint[];
  loading: boolean;
}) => {
  const mergedData = useMemo<MergedPlatformPoint[]>(() => {
    const dataMap = new Map(data.map(d => [d.platform, d]));

    // Unknown platform 경고 (DB에 있지만 SUPPORTED_PLATFORMS에 없는 값)
    data.forEach(d => {
      if (d.platform !== 'unknown' && !(SUPPORTED_PLATFORMS as readonly string[]).includes(d.platform)) {
        console.warn('[platform-chart] unknown platform:', d.platform, d.thisWeek);
      }
    });

    // 14개 플랫폼 전체 채우기 (0건 포함)
    const merged: MergedPlatformPoint[] = SUPPORTED_PLATFORMS.map(p => {
      const entry = dataMap.get(p);
      return {
        platform: p,
        thisWeek: entry?.thisWeek ?? 0,
        lastWeek: entry?.lastWeek ?? 0,
        isEmpty: !entry || (entry.thisWeek === 0 && entry.lastWeek === 0),
      };
    });

    // 정렬: thisWeek 내림차순 → 동점이면 SUPPORTED_PLATFORMS 순서 유지
    merged.sort((a, b) => {
      if (a.thisWeek !== b.thisWeek) return b.thisWeek - a.thisWeek;
      return (SUPPORTED_PLATFORMS as readonly string[]).indexOf(a.platform) -
             (SUPPORTED_PLATFORMS as readonly string[]).indexOf(b.platform);
    });

    return merged;
  }, [data]);

  return (
    <Section title={<><span>📊</span><span>플랫폼별 수집 현황</span></>}>
      {loading ? (
        <Skeleton className="h-52 w-full" />
      ) : (
        <>
          <div className="flex items-center gap-4 mb-2">
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gray-300" /> 지난 주
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-500" /> 이번 주
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={mergedData} barSize={7} barCategoryGap="25%">
              <XAxis
                dataKey="platform"
                tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                  <g transform={`translate(${x},${y})`}>
                    <image
                      href={getFavicon(PLATFORM_DOMAINS[payload.value] ?? payload.value)}
                      x={-8} y={4} width={16} height={16}
                    />
                  </g>
                )}
                height={28}
                interval={0}
              />
              <YAxis tick={{ fontSize: 9 }} width={22} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0]?.payload as MergedPlatformPoint;
                  return (
                    <div style={{ fontSize: 11, background: 'var(--background, #fff)', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <p style={{ fontWeight: 600, marginBottom: 2 }}>{entry.platform}</p>
                      {entry.isEmpty ? (
                        <p style={{ color: '#9ca3af' }}>이번 주 수집 0건</p>
                      ) : (
                        <>
                          <p>이번 주: <b>{entry.thisWeek}건</b></p>
                          <p style={{ color: '#9ca3af' }}>지난 주: {entry.lastWeek}건</p>
                        </>
                      )}
                    </div>
                  );
                }}
              />
              {/* 지난 주 막대 */}
              <Bar dataKey="lastWeek" name="지난 주"
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: MergedPlatformPoint };
                  const empty = payload?.isEmpty;
                  const h = height > 0 ? height : (empty ? 2 : 0);
                  const yAdj = height === 0 && empty ? y - 2 : y;
                  return <rect x={x} y={yAdj} width={Math.max(width, 0)} height={h} fill={empty ? '#d1d5db' : '#e5e7eb'} opacity={empty ? 0.25 : 1} rx={2} />;
                }}
              />
              {/* 이번 주 막대 */}
              <Bar dataKey="thisWeek" name="이번 주"
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: MergedPlatformPoint };
                  const empty = payload?.isEmpty;
                  const h = height > 0 ? height : (empty ? 2 : 0);
                  const yAdj = height === 0 && empty ? y - 2 : y;
                  const fill = empty ? '#9ca3af' : (PLATFORM_COLORS[payload?.platform ?? ''] ?? '#6b7280');
                  return <rect x={x} y={yAdj} width={Math.max(width, 0)} height={h} fill={fill} opacity={empty ? 0.35 : 1} rx={2} />;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
            회색 막대는 이번 주 수집 0건인 플랫폼입니다. 0건이 지속되면 수집기 점검이 필요합니다.
          </p>
        </>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 3 — Lifecycle Donut
// ─────────────────────────────────────────────────────────────
const RADIAN = Math.PI / 180;
const DonutLabel = ({
  cx, cy, midAngle, innerRadius, outerRadius, percent,
}: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number;
}) => {
  if (percent < 0.06) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x} y={y}
      fill="white"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={10}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

const LifecycleDonut = ({
  data,
  byCategory,
  loading,
}: {
  data: LifecyclePoint[];
  byCategory: LifecycleByCategoryPoint[];
  loading: boolean;
}) => {
  const [stage, setStage] = useState<'1' | '2'>('1');
  const stageBar = (
    <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/40">
      {(['1', '2'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setStage(s)}
          className={cn(
            'px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors',
            stage === s
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {s === '1' ? '전체' : '카테고리별'}
        </button>
      ))}
    </div>
  );

  return (
    <Section
      title={<><span>🌱</span><span>트렌드 라이프사이클 분포</span></>}
      headerRight={!loading ? stageBar : undefined}
    >
      {loading ? (
        <Skeleton className="h-52 w-full" />
      ) : stage === '1' ? (
        data.length === 0 ? (
          <div className="py-10 text-center space-y-1">
            <p className="text-xs text-muted-foreground">분석 데이터 축적 중...</p>
            <p className="text-[10px] text-muted-foreground">
              트렌드 분석이 완료되면 라이프사이클 분포가 표시됩니다
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="44%"
                innerRadius={58}
                outerRadius={90}
                paddingAngle={2}
                dataKey="count"
                nameKey="label"
                labelLine={false}
                label={DonutLabel as any}
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 11 }} formatter={(val: number, name: string) => [val, name]} />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
                formatter={(value: string) => {
                  const entry = data.find((d) => d.label === value);
                  return `${value} (${entry?.count ?? 0})`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )
      ) : byCategory.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-10">카테고리 매트릭스 데이터 없음</p>
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(240, byCategory.length * 28 + 40)}>
          <BarChart data={byCategory} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
            <YAxis type="category" dataKey="category" tick={{ fontSize: 10 }} width={90} />
            <Tooltip contentStyle={{ fontSize: 11 }} formatter={(val: number, name: string) => [val, LIFECYCLE_META[name]?.label ?? name]} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, paddingTop: 6 }} formatter={(v: string) => LIFECYCLE_META[v]?.label ?? v} />
            {(['emerging', 'rising', 'peak', 'declining', 'classic'] as const).map((lc) => (
              <Bar key={lc} dataKey={lc} stackId="lc" fill={LIFECYCLE_META[lc].color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 5 — Style Distribution
// ─────────────────────────────────────────────────────────────
type MergedStylePoint = StylePoint & { isEmpty: boolean };

const StyleChart = ({
  data,
  loading,
}: {
  data: StylePoint[];
  loading: boolean;
}) => {
  // style_taxonomy 테이블에서 전체 지원 스타일 태그 목록 로드
  const { data: taxonomy = [] } = useQuery<{ style_tag: string; color_hex: string }[]>({
    queryKey: ['style-taxonomy'],
    queryFn: async () => {
      const { data: rows } = await (supabase as any)
        .from('style_taxonomy')
        .select('style_tag, color_hex')
        .order('style_tag');
      return (rows ?? []) as { style_tag: string; color_hex: string }[];
    },
    staleTime: 10 * 60_000,
  });

  const mergedData = useMemo<MergedStylePoint[]>(() => {
    const dataMap = new Map(data.map(d => [d.tag, d]));

    // taxonomy 기반 0-fill
    const taxonomyTags = new Set(taxonomy.map(t => t.style_tag));
    const merged: MergedStylePoint[] = taxonomy.map(t => ({
      tag:     t.style_tag,
      count:   dataMap.get(t.style_tag)?.count ?? 0,
      color:   t.color_hex || dataMap.get(t.style_tag)?.color || '#6b7280',
      isEmpty: !dataMap.has(t.style_tag) || (dataMap.get(t.style_tag)?.count ?? 0) === 0,
    }));

    // taxonomy에 없는 태그(신규 AI 생성)는 상단에 추가
    data.forEach(d => {
      if (!taxonomyTags.has(d.tag) && d.count > 0) {
        console.warn('[style-chart] unknown style tag (not in taxonomy):', d.tag);
        merged.push({ tag: d.tag, count: d.count, color: d.color, isEmpty: false });
      }
    });

    // 정렬: count 내림차순, 동점이면 taxonomy 순서 유지 (taxonomy 항목이 뒤에 오도록)
    merged.sort((a, b) => b.count - a.count);
    return merged;
  }, [data, taxonomy]);

  const visibleData = mergedData.filter(d => !d.isEmpty || taxonomy.length > 0);

  return (
    <Section title={<><span>👗</span><span>스타일 트렌드 분포</span></>}>
      {loading ? (
        <Skeleton className="h-52 w-full" />
      ) : visibleData.length === 0 ? (
        <div className="py-10 text-center">
          <p className="text-xs text-muted-foreground">스타일 태그 데이터 없음</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer
            width="100%"
            height={Math.max(220, visibleData.length * 26 + 20)}
          >
            <BarChart data={visibleData} layout="vertical" barSize={12} barCategoryGap="20%">
              <XAxis type="number" tick={{ fontSize: 9 }} allowDecimals={false} />
              <YAxis type="category" dataKey="tag" tick={{ fontSize: 10 }} width={90} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0]?.payload as MergedStylePoint;
                  return (
                    <div style={{ fontSize: 11, background: 'var(--background, #fff)', border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                      <p style={{ fontWeight: 600, marginBottom: 2 }}>{entry.tag}</p>
                      {entry.isEmpty ? (
                        <p style={{ color: '#9ca3af' }}>이번 주 수집 0건</p>
                      ) : (
                        <p>트렌드 수: <b>{entry.count}건</b></p>
                      )}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}
                shape={(props: any) => {
                  const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: MergedStylePoint };
                  const empty = payload?.isEmpty;
                  const h = height > 0 ? height : (empty ? 2 : 0);
                  const xAdj = height === 0 && empty ? x : x;
                  const fill = empty ? '#9ca3af' : (payload?.color ?? '#6b7280');
                  return <rect x={xAdj} y={y} width={Math.max(empty && h === 2 ? 2 : (width ?? 0), 0)} height={h} fill={fill} opacity={empty ? 0.35 : 1} rx={3} />;
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-right">
            회색 항목은 이번 주 수집 0건인 스타일입니다.
          </p>
        </>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section — Keyword Tabs (Rising / Declining / Popular)
// ─────────────────────────────────────────────────────────────
type KeywordTabKey = 'rising' | 'declining' | 'popular';

const KEYWORD_TABS: Array<{ key: KeywordTabKey; label: string; icon: string; help: string }> = [
  { key: 'rising',    label: '급상승',  icon: '📈', help: '지난 주 대비 등장 횟수가 증가한 키워드 (성장률 내림차순)' },
  { key: 'declining', label: '감소',    icon: '📉', help: '지난 주 대비 등장 횟수가 감소한 키워드 (감소율 내림차순)' },
  { key: 'popular',   label: '인기',    icon: '🔥', help: '이번 주 가장 많이 등장한 키워드 (빈도 내림차순)' },
];

const Sparkline = ({ data, stroke }: { data: { date: string; count: number }[]; stroke: string }) => (
  <ResponsiveContainer width={80} height={24}>
    <LineChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
      <Line
        type="monotone"
        dataKey="count"
        stroke={stroke}
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  </ResponsiveContainer>
);

const SignalMiniBar = ({ count, max }: { count: number; max: number }) => {
  if (count === 0) return <span className="text-[10px] text-muted-foreground">—</span>;
  const w = Math.max(8, Math.round((count / Math.max(1, max)) * 60));
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: w }} />
      <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
    </div>
  );
};

const KeywordTabs = ({
  rising,
  declining,
  popular,
  loading,
}: {
  rising: RisingKeywordPoint[];
  declining: RisingKeywordPoint[];
  popular: KeywordPoint[];
  loading: boolean;
}) => {
  const [tab, setTab] = useState<KeywordTabKey>('rising');

  const rows: RisingKeywordPoint[] = useMemo(() => {
    if (tab === 'rising') return rising;
    if (tab === 'declining') return declining;
    // popular → KeywordPoint를 RisingKeywordPoint 형태로 변환
    return popular.map((p) => ({
      keyword: p.keyword,
      thisWeek: p.count,
      lastWeek: 0,
      growthRate: null,
      daily: p.daily,
      signalCount: p.signalCount,
    }));
  }, [tab, rising, declining, popular]);

  const maxSignal = useMemo(() => Math.max(1, ...rows.map((r) => r.signalCount ?? 0)), [rows]);
  const activeMeta = KEYWORD_TABS.find((t) => t.key === tab)!;

  return (
    <Section
      title={<><span>🔑</span><span>키워드 트렌드 Top 10</span></>}
      headerRight={
        <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/40">
          {KEYWORD_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors',
                tab === t.key
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="text-xs text-muted-foreground mb-3">{activeMeta.help}</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-8">데이터 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left pb-2 pr-2 font-medium w-8">#</th>
                <th className="text-left pb-2 pr-3 font-medium">키워드</th>
                <th className="text-left pb-2 pr-3 font-medium whitespace-nowrap">7일 추이</th>
                <th className="text-right pb-2 pr-3 font-medium whitespace-nowrap">등장 수</th>
                <th className="text-right pb-2 pr-3 font-medium whitespace-nowrap">전주 대비</th>
                <th className="text-left pb-2 font-medium whitespace-nowrap">시그널</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {rows.map((kw, idx) => {
                const gr         = kw.growthRate;
                const isPositive = gr !== null && gr > 0;
                const isNegative = gr !== null && gr < 0;
                const stroke     = tab === 'declining'
                  ? '#f43f5e'
                  : tab === 'popular' ? '#6366f1' : '#10b981';

                return (
                  <tr key={kw.keyword} className="hover:bg-muted/40 transition-colors">
                    <td className="py-2 pr-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                    <td className="py-2 pr-3 font-medium text-foreground truncate max-w-[160px]">
                      {kw.keyword}
                    </td>
                    <td className="py-2 pr-3">
                      {kw.daily && kw.daily.some((d) => d.count > 0) ? (
                        <Sparkline data={kw.daily} stroke={stroke} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                      {kw.thisWeek}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {isPositive ? (
                        <span className="text-emerald-600 font-semibold">▲ +{gr}%</span>
                      ) : isNegative ? (
                        <span className="text-rose-600 font-semibold">▼ {gr}%</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2">
                      <SignalMiniBar count={kw.signalCount ?? 0} max={maxSignal} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 2b — Trend Timeline Chart
// ─────────────────────────────────────────────────────────────
const TrendTimelineChart = ({
  data,
  loading,
  periodDays,
}: {
  data: TimeSeriesData | undefined;
  loading: boolean;
  periodDays: number;
}) => {
  const [tab, setTab] = useState<TimelineTab>('전체');

  // tick interval: show every n-th label to avoid crowding
  const tickInterval = periodDays <= 7 ? 0 : periodDays <= 14 ? 1 : 4;

  // need at least 3 days with data to show chart
  const hasData = (data?.daily.filter(p => p.total > 0).length ?? 0) >= 3;

  const tabBar = (
    <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 bg-muted/40">
      {TIMELINE_TABS.map(t => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={cn(
            'px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors',
            tab === t
              ? 'bg-background shadow-sm text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );

  const axisProps = {
    axisLine: false as const,
    tickLine: false as const,
  };

  const gridProps = {
    strokeDasharray: '3 3',
    stroke: '#f3f4f6',
    vertical: false as const,
  };

  const tooltipStyle = { fontSize: 11, borderRadius: 8 };

  return (
    <Section
      title={<><span>📈</span><span>트렌드 수집 추이</span></>}
      headerRight={!loading ? tabBar : undefined}
    >
      <p className="text-sm text-muted-foreground mb-3">
        기간별 트렌드 수집량 변화를 보여줍니다
      </p>

      {loading ? (
        <Skeleton className="h-[250px] sm:h-[350px] w-full" />
      ) : !hasData ? (
        <p className="text-xs text-muted-foreground text-center py-10">
          트렌드 데이터가 쌓이면 수집 추이 차트가 표시됩니다.
          최소 3일 이상의 데이터가 필요합니다.
        </p>
      ) : (
        <div className="h-[250px] sm:h-[350px]">

          {/* ── 전체 탭 (단일 AreaChart) */}
          {tab === '전체' && (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data!.daily}
                margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatXDate}
                  interval={tickInterval}
                  height={24}
                  {...axisProps}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={28}
                  allowDecimals={false}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={v => `날짜: ${v}`}
                  formatter={(val: number) => [val, '수집 건수']}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#trendGrad)"
                  dot={false}
                  activeDot={{ r: 4 }}
                  name="수집 건수"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}

          {/* ── 플랫폼별 탭 (MultiLine) */}
          {tab === '플랫폼별' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data!.byPlatform}
                margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatXDate}
                  interval={tickInterval}
                  height={24}
                  {...axisProps}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={28}
                  allowDecimals={false}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={v => `날짜: ${v}`}
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                />
                {data!.platforms.map(p => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={PLATFORM_LINE_COLORS[p] ?? '#888888'}
                    strokeWidth={2}
                    strokeDasharray={p === 'zara' ? '5 3' : undefined}
                    dot={false}
                    activeDot={{ r: 3 }}
                    name={p}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

          {/* ── 라이프사이클별 탭 (MultiLine) */}
          {tab === '라이프사이클별' && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data!.byLifecycle}
                margin={{ top: 5, right: 10, bottom: 0, left: 0 }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={formatXDate}
                  interval={tickInterval}
                  height={24}
                  {...axisProps}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  width={28}
                  allowDecimals={false}
                  {...axisProps}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={v => `날짜: ${v}`}
                  formatter={(val: number, name: string) =>
                    [val, LIFECYCLE_META[name]?.label ?? name]
                  }
                />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, paddingTop: 8 }}
                  formatter={(value: string) => LIFECYCLE_META[value]?.label ?? value}
                />
                {data!.lifecycles.map(lc => (
                  <Line
                    key={lc}
                    type="monotone"
                    dataKey={lc}
                    stroke={LIFECYCLE_LINE_COLORS[lc] ?? '#888888'}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                    name={lc}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}

        </div>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 5 — Category Ranking Table
// ─────────────────────────────────────────────────────────────
const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

const CategoryRankingTable = ({
  data,
  loading,
}: {
  data: CategoryRankPoint[];
  loading: boolean;
}) => (
  <Section title={<><span>🏆</span><span>카테고리별 트렌드 랭킹</span></>}>
    <p className="text-sm text-muted-foreground mb-3">
      이번 주 스타일 태그 기준 상위 카테고리 랭킹입니다. 지난 주 대비 변화율을 함께 확인하세요.
    </p>
    {loading ? (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full rounded" />
        ))}
      </div>
    ) : data.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-8">
        카테고리 데이터 없음
      </p>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left pb-2 pr-3 font-medium text-muted-foreground w-10">순위</th>
              <th className="text-left pb-2 pr-3 font-medium text-muted-foreground">카테고리</th>
              <th className="text-right pb-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">트렌드 수</th>
              <th className="text-right pb-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">비중</th>
              <th className="text-right pb-2 font-medium text-muted-foreground whitespace-nowrap">전주 대비</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map(row => {
              const isOthers       = row.category === '기타';
              const isUnclassified = row.category === '미분류';
              const medal          = RANK_MEDALS[row.rank];
              const cr             = row.changeRate;
              const isPositive     = cr !== null && cr > 0;
              const isNegative     = cr !== null && cr < 0;
              const isNew          = cr === null && !isOthers;

              return (
                <tr
                  key={row.category}
                  className={cn(
                    'hover:bg-muted/40 transition-colors',
                    (isOthers || isUnclassified) && 'opacity-60',
                  )}
                >
                  {/* 순위 */}
                  <td className="py-2.5 pr-3 font-bold text-base leading-none">
                    {medal ?? (
                      <span className="text-xs text-muted-foreground font-semibold">
                        {isOthers ? '—' : row.rank}
                      </span>
                    )}
                  </td>

                  {/* 카테고리 */}
                  <td className="py-2.5 pr-3 font-medium">
                    {isOthers ? (
                      <span className="italic text-muted-foreground">기타</span>
                    ) : isUnclassified ? (
                      <span className="italic text-muted-foreground">미분류</span>
                    ) : (
                      <span className="text-foreground">{row.category}</span>
                    )}
                  </td>

                  {/* 트렌드 수 */}
                  <td className="py-2.5 pr-3 text-right tabular-nums font-semibold text-foreground">
                    {row.count.toLocaleString()}
                  </td>

                  {/* 비중 */}
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {row.share.toFixed(1)}%
                  </td>

                  {/* 전주 대비 */}
                  <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                    {isNew ? (
                      <span className="text-emerald-600 font-semibold text-[10px]">🆕 신규</span>
                    ) : isPositive ? (
                      <span className="text-green-600 font-semibold">
                        ▲ +{cr!.toFixed(1)}%
                      </span>
                    ) : isNegative ? (
                      <span className="text-red-500 font-semibold">
                        ▼ {cr!.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </Section>
);

// ─────────────────────────────────────────────────────────────
// TrendReportTab — Main
// ─────────────────────────────────────────────────────────────
export const TrendReportTab = () => {
  const [periodDays, setPeriodDays] = useState(7);
  const { data, loading, error } = useTrendReport(periodDays);

  const { toast } = useToast();
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<'pdf' | 'png' | null>(null);

  const periodLabel = useMemo(() =>
    periodDays === 7 ? '이번 주 (7일)' : periodDays === 14 ? '2주 (14일)' : '1개월 (30일)',
    [periodDays],
  );

  const handleExport = async (type: 'pdf' | 'png') => {
    const el = reportRef.current;
    if (!el || exporting) return;
    setExporting(type);

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const dateStr = new Date().toISOString().slice(0, 10);

    // Inject a styled header so it appears in the captured image
    const headerEl = document.createElement('div');
    headerEl.setAttribute('data-export-header', 'true');
    headerEl.style.cssText = [
      'padding:20px 24px 16px',
      'background:#ffffff',
      'border-bottom:2px solid #e5e7eb',
      'margin-bottom:8px',
      'font-family:sans-serif',
    ].join(';');
    headerEl.innerHTML = [
      `<div style="font-size:18px;font-weight:700;color:#111827;">`,
      `ANGEL PROGRAM — 트렌드 리포트</div>`,
      `<div style="font-size:11px;color:#6b7280;margin-top:6px;">`,
      `생성일: ${dateStr} &nbsp;&nbsp;|&nbsp;&nbsp; 분석 기간: ${periodLabel}</div>`,
    ].join('');
    el.insertBefore(headerEl, el.firstChild);

    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
      });

      if (type === 'png') {
        const link = document.createElement('a');
        link.download = `트렌드리포트_${dateStr}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { jsPDF } = await import('jspdf') as any;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageW = (pdf.internal.pageSize as { getWidth(): number }).getWidth();
        const pageH = (pdf.internal.pageSize as { getHeight(): number }).getHeight();
        const margin = 10;
        const imgW = pageW - margin * 2;
        const totalImgH = (canvas.height / canvas.width) * imgW;

        let srcYpx = 0;
        let firstPage = true;
        while (srcYpx < canvas.height) {
          if (!firstPage) pdf.addPage();
          firstPage = false;

          const availHmm = pageH - margin * 2;
          const availHpx = (availHmm / totalImgH) * canvas.height;
          const sliceHpx = Math.min(availHpx, canvas.height - srcYpx);
          const sliceHmm = (sliceHpx / canvas.height) * totalImgH;

          const slice = document.createElement('canvas');
          slice.width = canvas.width;
          slice.height = Math.ceil(sliceHpx);
          const ctx = slice.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, slice.width, slice.height);
          ctx.drawImage(canvas, 0, srcYpx, canvas.width, sliceHpx, 0, 0, canvas.width, sliceHpx);
          pdf.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgW, sliceHmm);
          srcYpx += sliceHpx;
        }
        pdf.save(`트렌드리포트_${dateStr}.pdf`);
      }
      toast({ title: '리포트가 다운로드되었습니다' });
    } catch (err) {
      console.error('Export error:', err);
      toast({
        title: '리포트 생성에 실패했습니다. 다시 시도해주세요.',
        variant: 'destructive',
      });
    } finally {
      if (el.contains(headerEl)) el.removeChild(headerEl);
      document.body.style.overflow = originalOverflow;
      setExporting(null);
    }
  };

  return (
    <div className="space-y-4">

      {/* ── 헤더: 페이지 제목 + 기간 선택 + 내보내기 ────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-medium mb-2">트렌드 리포트</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            SNS·커머스 트렌드 수집 현황 및 키워드 분석
          </p>
          {error && (
            <p className="text-xs text-destructive mt-1">⚠ {error}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select
            value={String(periodDays)}
            onValueChange={v => setPeriodDays(parseInt(v))}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 내보내기 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting || loading}
                className="gap-1.5"
              >
                {exporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exporting ? '생성 중...' : '리포트 내보내기'}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleExport('pdf')}>
                📄 PDF로 내보내기
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('png')}>
                🖼️ 이미지로 내보내기 (PNG)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── 내보내기 진행 배너 ─────────────────────────────── */}
      {exporting && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-700">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
          <span>리포트를 생성하고 있습니다... 잠시만 기다려주세요.</span>
        </div>
      )}

      {/* ── 캡처 대상 영역 ────────────────────────────────── */}
      <div ref={reportRef} className="space-y-4">

        {/* 섹션 1: 핵심 수치 카드 */}
        <StatCards data={data} loading={loading} periodDays={periodDays} />

        {/* 섹션 2a: 시계열 수집 추이 */}
        <TrendTimelineChart
          data={data?.timeSeries}
          loading={loading}
          periodDays={periodDays}
        />

        {/* 섹션 2b: 플랫폼별 수집 현황 */}
        <PlatformChart data={data?.platformData ?? []} loading={loading} />

        {/* 섹션 3: 키워드 트렌드 (급상승/감소/인기 탭) */}
        <KeywordTabs
          rising={data?.risingKeywords ?? []}
          declining={data?.decliningKeywords ?? []}
          popular={data?.hotKeywords ?? []}
          loading={loading}
        />

        {/* 섹션 5: 카테고리별 트렌드 랭킹 */}
        <CategoryRankingTable
          data={data?.categoryRanking ?? []}
          loading={loading}
        />

        {/* 섹션 6+7: 라이프사이클 + 스타일 (2열 / 1열) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LifecycleDonut
            data={data?.lifecycleData ?? []}
            byCategory={data?.lifecycleByCategory ?? []}
            loading={loading}
          />
          <StyleChart     data={data?.styleData     ?? []} loading={loading} />
        </div>

      </div>

    </div>
  );
};

export default TrendReportTab;
