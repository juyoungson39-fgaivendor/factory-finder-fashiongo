import { useState, useMemo, useRef, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
  AreaChart, Area, LineChart, Line, CartesianGrid,
} from 'recharts';
import { Layers, Calendar, TrendingUp, TrendingDown, Download, Loader2 } from 'lucide-react';
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
} from '@/hooks/useTrendReport';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: '7',  label: '이번 주 (7일)' },
  { value: '14', label: '2주 (14일)' },
  { value: '30', label: '1개월 (30일)' },
];

const PLATFORM_COLORS: Record<string, string> = {
  instagram:    '#c026d3', tiktok:       '#000000', vogue:        '#111111',
  elle:         '#dc2626', wwd:          '#374151', hypebeast:    '#15803d',
  highsnobiety: '#7e22ce', footwearnews: '#b45309', google:       '#3b82f6',
  amazon:       '#f97316', pinterest:    '#ef4444', fashiongo:    '#4f46e5',
  shein:        '#111827',
};

const PLATFORM_DOMAINS: Record<string, string> = {
  instagram: 'instagram.com', tiktok: 'tiktok.com', vogue: 'vogue.com',
  elle: 'elle.com', wwd: 'wwd.com', hypebeast: 'hypebeast.com',
  highsnobiety: 'highsnobiety.com', footwearnews: 'footwearnews.com',
  google: 'google.com', amazon: 'amazon.com', pinterest: 'pinterest.com',
  fashiongo: 'fashiongo.net', shein: 'shein.com',
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
  <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const { totalActive, newThisPeriod, prevNewThisPeriod } = data.stats;

  const newChangeRate =
    prevNewThisPeriod > 0
      ? Math.round(((newThisPeriod - prevNewThisPeriod) / prevNewThisPeriod) * 100)
      : newThisPeriod > 0 ? 100 : 0;

  const cards = [
    {
      icon:        <Layers className="w-4 h-4" />,
      label:       '총 활성 트렌드',
      value:       totalActive.toLocaleString(),
      suffix:      '건',
      change:      newChangeRate,
      changeLabel: `${periodLabel} +${newThisPeriod}건 추가`,
      iconColor:   'text-blue-500',
      bgColor:     'bg-blue-50 dark:bg-blue-950/30',
    },
    {
      icon:        <Calendar className="w-4 h-4" />,
      label:       `${periodLabel} 신규`,
      value:       newThisPeriod.toLocaleString(),
      suffix:      '건',
      change:      newChangeRate,
      changeLabel: `전기간 ${prevNewThisPeriod}건 대비`,
      iconColor:   'text-green-500',
      bgColor:     'bg-green-50 dark:bg-green-950/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map(card => {
        const isPositive = card.change == null || card.change >= 0;
        return (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              <span className={cn('p-1.5 rounded-md', card.bgColor, card.iconColor)}>
                {card.icon}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground tabular-nums">
                {card.value}
              </span>
              <span className="text-sm text-muted-foreground">{card.suffix}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {card.change != null ? (
                <>
                  <span className={cn(
                    'flex items-center gap-0.5 text-xs font-semibold',
                    isPositive ? 'text-green-600' : 'text-red-500',
                  )}>
                    {isPositive
                      ? <TrendingUp  className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {isPositive ? '+' : ''}{card.change}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">{card.changeLabel}</span>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">{card.changeLabel}</span>
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
const PlatformChart = ({
  data,
  loading,
}: {
  data: PlatformPoint[];
  loading: boolean;
}) => (
  <Section title={<><span>📊</span><span>플랫폼별 수집 현황</span></>}>
    {loading ? (
      <Skeleton className="h-52 w-full" />
    ) : data.length === 0 ? (
      <p className="text-xs text-muted-foreground text-center py-10">수집 데이터 없음</p>
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
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} barSize={8} barCategoryGap="28%">
            <XAxis
              dataKey="platform"
              tick={({ x, y, payload }: { x: number; y: number; payload: { value: string } }) => (
                <g transform={`translate(${x},${y})`}>
                  <image
                    href={getFavicon(PLATFORM_DOMAINS[payload.value] ?? payload.value)}
                    x={-8}
                    y={4}
                    width={16}
                    height={16}
                  />
                </g>
              )}
              height={28}
              interval={0}
            />
            <YAxis tick={{ fontSize: 9 }} width={22} />
            <Tooltip
              contentStyle={{ fontSize: 11 }}
              formatter={(val: number, name: string) =>
                [val, name === 'thisWeek' ? '이번 주' : '지난 주']
              }
            />
            <Bar dataKey="lastWeek" fill="#e5e7eb" radius={[2, 2, 0, 0]} name="지난 주" />
            <Bar dataKey="thisWeek"               radius={[2, 2, 0, 0]} name="이번 주">
              {data.map((entry, idx) => (
                <Cell key={idx} fill={PLATFORM_COLORS[entry.platform] ?? '#6b7280'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </>
    )}
  </Section>
);

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
  loading,
}: {
  data: LifecyclePoint[];
  loading: boolean;
}) => (
  <Section title={<><span>🌱</span><span>트렌드 라이프사이클 분포</span></>}>
    {loading ? (
      <Skeleton className="h-52 w-full" />
    ) : data.length === 0 ? (
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
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(val: number, name: string) => [val, name]}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
            formatter={(value: string) => {
              const entry = data.find(d => d.label === value);
              return `${value} (${entry?.count ?? 0})`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    )}
  </Section>
);

// ─────────────────────────────────────────────────────────────
// Section 5 — Style Distribution
// ─────────────────────────────────────────────────────────────
const StyleChart = ({
  data,
  loading,
}: {
  data: StylePoint[];
  loading: boolean;
}) => (
  <Section title={<><span>👗</span><span>스타일 트렌드 분포</span></>}>
    {loading ? (
      <Skeleton className="h-52 w-full" />
    ) : data.length === 0 ? (
      <div className="py-10 text-center">
        <p className="text-xs text-muted-foreground">스타일 태그 데이터 없음</p>
      </div>
    ) : (
      <ResponsiveContainer
        width="100%"
        height={Math.max(220, data.length * 28 + 20)}
      >
        <BarChart data={data} layout="vertical" barSize={13} barCategoryGap="20%">
          <XAxis type="number" tick={{ fontSize: 9 }} />
          <YAxis type="category" dataKey="tag" tick={{ fontSize: 10 }} width={80} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(val: number) => [val, '트렌드 수']}
          />
          <Bar dataKey="count" radius={[0, 3, 3, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )}
  </Section>
);

// ─────────────────────────────────────────────────────────────
// Section 3 — Rising Keywords
// ─────────────────────────────────────────────────────────────

/** 급상승 키워드 툴팁 텍스트 */
function risingTooltip(kw: RisingKeywordPoint): string {
  if (kw.growthRate === null) {
    return `${kw.keyword}: 이번 주 ${kw.thisWeek}건 (🆕 신규 등장)`;
  }
  const arrow = kw.growthRate >= 0 ? '↑ +' : '↓ ';
  return `${kw.keyword}: 이번 주 ${kw.thisWeek}건, 지난 주 ${kw.lastWeek}건 (${arrow}${kw.growthRate}%)`;
}

const RisingKeywords = ({
  data,
  loading,
  onKeywordClick,
}: {
  data: RisingKeywordPoint[];
  loading: boolean;
  onKeywordClick?: (keyword: string) => void;
}) => {
  const maxCount = useMemo(() => Math.max(...data.map(k => k.thisWeek), 1), [data]);

  return (
    <Section title={<><span>🚀</span><span>급상승 키워드 Top 10</span></>}>
      <p className="text-sm text-muted-foreground mb-3">
        지난 주 대비 이번 주 등장 횟수가 급증한 키워드입니다. 성장률 기준으로 정렬됩니다.
      </p>
      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full rounded-md" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          급상승 키워드 데이터 없음
        </p>
      ) : (
        <div className="space-y-2">
          {data.map((kw, idx) => {
            const barWidth  = (kw.thisWeek / maxCount) * 100;
            const isNew     = kw.growthRate === null;
            const isPos     = !isNew && (kw.growthRate ?? 0) >= 0;
            const badgeCls  = isNew
              ? 'bg-emerald-100 text-emerald-700'
              : isPos
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700';
            const barCls    = isNew ? 'bg-emerald-500' : isPos ? 'bg-green-500' : 'bg-amber-400';

            return (
              <button
                key={kw.keyword}
                title={risingTooltip(kw)}
                onClick={() => onKeywordClick?.(kw.keyword)}
                className={cn(
                  'w-full text-left group',
                  onKeywordClick ? 'cursor-pointer' : 'cursor-default',
                )}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] text-muted-foreground w-4 shrink-0 tabular-nums text-right">
                    {idx + 1}
                  </span>
                  <span className={cn(
                    'text-xs font-medium flex-1 truncate',
                    onKeywordClick && 'group-hover:text-primary transition-colors',
                  )}>
                    {kw.keyword}
                  </span>
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 tabular-nums', badgeCls)}>
                    {isNew ? '🆕 New' : `${isPos ? '+' : ''}${kw.growthRate}%`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 shrink-0" />
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', barCls)}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right shrink-0">
                    {kw.thisWeek}건
                  </span>
                </div>
              </button>
            );
          })}
          {onKeywordClick && (
            <p className="text-[10px] text-muted-foreground mt-2">
              💡 키워드 클릭 시 이미지 트렌드 탭에서 검색합니다
            </p>
          )}
        </div>
      )}
    </Section>
  );
};

// ─────────────────────────────────────────────────────────────
// Section 4 — Hot Keywords (빈도 기반)
// ─────────────────────────────────────────────────────────────
const HotKeywords = ({
  data,
  loading,
  onKeywordClick,
}: {
  data: KeywordPoint[];
  loading: boolean;
  onKeywordClick?: (keyword: string) => void;
}) => {
  const maxCount = useMemo(() => data[0]?.count ?? 1, [data]);

  return (
    <Section title={<><span>📊</span><span>이번 주 인기 키워드 Top 10</span></>}>
      <p className="text-sm text-muted-foreground mb-3">
        최근 7일간 트렌드에서 가장 많이 등장한 키워드입니다. 빈도 기준으로 정렬됩니다.
      </p>
      {loading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-7 rounded-full"
              style={{ width: `${56 + i * 8}px` }}
            />
          ))}
        </div>
      ) : data.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">
          이번 주 수집된 키워드가 없습니다
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-end">
            {data.map(kw => {
              const ratio = kw.count / maxCount;
              const fontSize = Math.round(12 + ratio * 10);
              const opacity  = 0.55 + ratio * 0.45;
              return (
                <button
                  key={kw.keyword}
                  onClick={() => onKeywordClick?.(kw.keyword)}
                  style={{ fontSize, opacity }}
                  className={cn(
                    'px-2.5 py-1 rounded-full font-semibold transition-all',
                    'bg-primary/10 text-primary',
                    onKeywordClick
                      ? 'cursor-pointer hover:bg-primary/25 hover:opacity-100'
                      : 'cursor-default',
                  )}
                  title={`${kw.keyword} — ${kw.count}번 검색됨`}
                >
                  {kw.keyword}
                  <span className="ml-1 text-[10px] font-normal opacity-60 tabular-nums">
                    {kw.count}번 검색됨
                  </span>
                </button>
              );
            })}
          </div>
          {onKeywordClick && (
            <p className="text-[10px] text-muted-foreground mt-3">
              💡 키워드 클릭 시 이미지 트렌드 탭에서 검색합니다
            </p>
          )}
        </>
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
  onCategoryClick,
}: {
  data: CategoryRankPoint[];
  loading: boolean;
  onCategoryClick?: (category: string) => void;
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
              <th className="text-right pb-2 pr-3 font-medium text-muted-foreground whitespace-nowrap">전주 대비</th>
              <th className="text-right pb-2 font-medium text-muted-foreground">상세</th>
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
                  <td className="py-2.5 pr-3 text-right tabular-nums whitespace-nowrap">
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

                  {/* 상세보기 */}
                  <td className="py-2.5 text-right">
                    {!isOthers && !isUnclassified && onCategoryClick ? (
                      <button
                        onClick={() => onCategoryClick(row.category)}
                        className="text-primary hover:underline text-[10px] font-medium"
                      >
                        상세보기
                      </button>
                    ) : (
                      <span className="text-muted-foreground text-[10px]">—</span>
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
interface TrendReportTabProps {
  /** 키워드 클릭 시 호출 — 부모(TrendRecommendation)에서 탭 전환 + 검색 연동 */
  onKeywordClick?: (keyword: string) => void;
}

export const TrendReportTab = ({ onKeywordClick }: TrendReportTabProps = {}) => {
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
    <div className="space-y-6">

      {/* ── 헤더: 페이지 제목 + 기간 선택 + 내보내기 ────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">트렌드 리포트</h1>
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
      <div ref={reportRef} className="space-y-6">

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

        {/* 섹션 3+4: 급상승 키워드 + 인기 키워드 (2열 / 1열) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RisingKeywords
            data={data?.risingKeywords ?? []}
            loading={loading}
            onKeywordClick={onKeywordClick}
          />
          <HotKeywords
            data={data?.hotKeywords ?? []}
            loading={loading}
            onKeywordClick={onKeywordClick}
          />
        </div>

        {/* 섹션 5: 카테고리별 트렌드 랭킹 */}
        <CategoryRankingTable
          data={data?.categoryRanking ?? []}
          loading={loading}
          onCategoryClick={onKeywordClick}
        />

        {/* 섹션 6+7: 라이프사이클 + 스타일 (2열 / 1열) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <LifecycleDonut data={data?.lifecycleData ?? []} loading={loading} />
          <StyleChart     data={data?.styleData     ?? []} loading={loading} />
        </div>

      </div>

    </div>
  );
};

export default TrendReportTab;
