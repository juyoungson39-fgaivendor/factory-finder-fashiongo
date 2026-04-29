import { useState, useMemo, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Layers, Calendar, TrendingUp, TrendingDown, Package } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useTrendReport,
  LIFECYCLE_META,
  type TrendReportData,
  type LifecyclePoint,
  type StylePoint,
  type KeywordPoint,
  type PlatformPoint,
  type ClusterPoint,
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

// ─────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────
const Section = ({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <div className={cn('rounded-xl border border-border bg-card p-4', className)}>
    <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
      {title}
    </h3>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  const { totalActive, newThisPeriod, prevNewThisPeriod, activeClusters } = data.stats;

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
    {
      icon:        <Package className="w-4 h-4" />,
      label:       '활성 클러스터',
      value:       activeClusters.toLocaleString(),
      suffix:      '개',
      change:      null as number | null,
      changeLabel: '트렌드 군집',
      iconColor:   'text-purple-500',
      bgColor:     'bg-purple-50 dark:bg-purple-950/30',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
// Section 3 — Top 5 Clusters
// ─────────────────────────────────────────────────────────────
const ClusterChart = ({
  data,
  loading,
}: {
  data: ClusterPoint[];
  loading: boolean;
}) => (
  <Section title={<><span>🚀</span><span>급상승 클러스터 Top 5</span></>}>
    {loading ? (
      <Skeleton className="h-48 w-full" />
    ) : data.length === 0 ? (
      <div className="py-8 text-center space-y-1">
        <p className="text-sm text-2xl">📦</p>
        <p className="text-xs text-muted-foreground">
          트렌드 데이터가 축적되면 자동으로 클러스터가 생성됩니다
        </p>
      </div>
    ) : (
      <ResponsiveContainer
        width="100%"
        height={Math.max(160, data.length * 42 + 20)}
      >
        <BarChart data={data} layout="vertical" barSize={14} barCategoryGap="22%">
          <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={86} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(val: number) => [`${val}%`, '주간 성장률']}
          />
          <Bar dataKey="growth" radius={[0, 3, 3, 0]}>
            {data.map((entry, idx) => (
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
  </Section>
);

// ─────────────────────────────────────────────────────────────
// Section 4 — Lifecycle Donut
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
// Section 6 — Hot Keywords
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
    <Section title={<><span>🔥</span><span>이번 주 Hot Keywords Top 10</span></>}>
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
              // font-size 12 ~ 22px, opacity 0.55 ~ 1.0
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
                  title={`${kw.keyword} — ${kw.count}건`}
                >
                  {kw.keyword}
                  <span className="ml-1 text-[10px] font-normal opacity-60 tabular-nums">
                    {kw.count}
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
// TrendReportTab — Main
// ─────────────────────────────────────────────────────────────
interface TrendReportTabProps {
  /** 키워드 클릭 시 호출 — 부모(TrendRecommendation)에서 탭 전환 + 검색 연동 */
  onKeywordClick?: (keyword: string) => void;
}

export const TrendReportTab = ({ onKeywordClick }: TrendReportTabProps = {}) => {
  const [periodDays, setPeriodDays] = useState(7);
  const { data, loading, error } = useTrendReport(periodDays);

  return (
    <div className="space-y-6">

      {/* ── 헤더: 제목 + 기간 선택 ─────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">트렌드 리포트</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            수집된 트렌드 데이터를 기간별로 분석합니다
          </p>
          {error && (
            <p className="text-xs text-destructive mt-0.5">⚠ {error}</p>
          )}
        </div>
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
      </div>

      {/* ── 섹션 1: 핵심 수치 카드 ─────────────────────────── */}
      <StatCards data={data} loading={loading} periodDays={periodDays} />

      {/* ── 섹션 2: 플랫폼별 수집 현황 ─────────────────────── */}
      <PlatformChart data={data?.platformData ?? []} loading={loading} />

      {/* ── 섹션 3: 급상승 클러스터 Top 5 ──────────────────── */}
      <ClusterChart data={data?.topClusters ?? []} loading={loading} />

      {/* ── 섹션 4+5: 라이프사이클 + 스타일 (2열 / 1열) ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LifecycleDonut data={data?.lifecycleData ?? []} loading={loading} />
        <StyleChart     data={data?.styleData     ?? []} loading={loading} />
      </div>

      {/* ── 섹션 6: Hot Keywords ─────────────────────────────── */}
      <HotKeywords
        data={data?.hotKeywords ?? []}
        loading={loading}
        onKeywordClick={onKeywordClick}
      />

    </div>
  );
};

export default TrendReportTab;
