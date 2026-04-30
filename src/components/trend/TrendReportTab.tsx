import { useState, useMemo, type ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from 'recharts';
import { Layers, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
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
  type RisingKeywordPoint,
  type KeywordChangePoint,
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
// Section 3 — Keyword Word Cloud (상승 / 하강)
// ─────────────────────────────────────────────────────────────

/** 변화율에 비례한 폰트 크기 계산 (14 ~ 40px) */
function calcFontSize(absRate: number, maxRate: number): number {
  const ratio = maxRate > 0 ? Math.min(absRate / maxRate, 1) : 0;
  return Math.round(14 + ratio * 26);
}

/** 상승 키워드 색상: 연초록(hsl 142,71%,72%) → 진초록(hsl 142,71%,28%) */
function risingColor(absRate: number, maxRate: number): string {
  const ratio = maxRate > 0 ? Math.min(absRate / maxRate, 1) : 0;
  const lightness = Math.round(72 - ratio * 44); // 72% → 28%
  return `hsl(142, 71%, ${lightness}%)`;
}

/** 하강 키워드 색상: 회색(hsl 220,9%,65%) → 붉은색(hsl 0,72%,51%) */
function fallingColor(absRate: number, maxRate: number): string {
  const ratio = maxRate > 0 ? Math.min(absRate / maxRate, 1) : 0;
  const hue        = Math.round(220 - ratio * 220);   // 220 → 0
  const saturation = Math.round(9   + ratio * 63);    // 9% → 72%
  const lightness  = Math.round(65  - ratio * 14);    // 65% → 51%
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function buildTooltip(kw: KeywordChangePoint): string {
  if (kw.isGone) {
    return `${kw.keyword}: 이번 주 0건, 지난 주 ${kw.lastWeek}건 (사라짐)`;
  }
  if (kw.changeRate === null) {
    return `${kw.keyword}: 이번 주 ${kw.thisWeek}건 (신규 등장)`;
  }
  const arrow = kw.changeRate > 0 ? '↑ +' : '↓ ';
  return `${kw.keyword}: 이번 주 ${kw.thisWeek}건, 지난 주 ${kw.lastWeek}건 (${arrow}${kw.changeRate}%)`;
}

const KeywordCloudSection = ({
  type,
  data,
  loading,
  onKeywordClick,
}: {
  type: 'rising' | 'falling';
  data: KeywordChangePoint[];
  loading: boolean;
  onKeywordClick?: (keyword: string) => void;
}) => {
  const isRising = type === 'rising';

  // 최대 절대변화율 계산 (스케일 기준)
  const maxRate = useMemo(() => {
    return Math.max(
      ...data.map(k =>
        k.changeRate === null ? 999 :
        k.isGone            ? 100 :
        Math.abs(k.changeRate),
      ),
      1,
    );
  }, [data]);

  const title       = isRising ? '📈 상승 키워드' : '📉 하강 키워드';
  const description = isRising
    ? '지난 주 대비 등장 횟수가 증가한 키워드입니다'
    : '지난 주 대비 등장 횟수가 감소한 키워드입니다';

  return (
    <Section title={<span>{title}</span>}>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>

      {/* 로딩 */}
      {loading && (
        <div className="flex flex-wrap gap-2 min-h-[200px] items-start content-start">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton
              key={i}
              className="rounded-full"
              style={{ height: `${14 + (i % 4) * 7}px`, width: `${50 + (i % 5) * 18}px` }}
            />
          ))}
        </div>
      )}

      {/* 데이터 없음 */}
      {!loading && data.length === 0 && (
        <div className="flex items-center justify-center min-h-[200px]">
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            데이터가 축적되면<br />키워드 변화를 분석합니다
          </p>
        </div>
      )}

      {/* 워드 클라우드 */}
      {!loading && data.length > 0 && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-2.5 items-baseline min-h-[200px] max-h-[400px] overflow-y-auto py-1 pr-1">
            {data.map(kw => {
              const absRate  = kw.changeRate === null ? 999 : kw.isGone ? 100 : Math.abs(kw.changeRate);
              const fontSize = calcFontSize(absRate, maxRate);
              const fontWeight = Math.round(400 + (absRate / maxRate) * 300); // 400→700
              const color    = isRising
                ? risingColor(absRate, maxRate)
                : fallingColor(absRate, maxRate);
              const tooltip  = buildTooltip(kw);

              return (
                <button
                  key={kw.keyword}
                  type="button"
                  onClick={() => onKeywordClick?.(kw.keyword)}
                  style={{ fontSize, fontWeight, color }}
                  title={tooltip}
                  className={cn(
                    'leading-tight transition-opacity hover:opacity-70',
                    onKeywordClick ? 'cursor-pointer' : 'cursor-default',
                  )}
                >
                  {/* 신규 배지 */}
                  {kw.changeRate === null && (
                    <span className="text-xs mr-0.5 align-middle">🆕</span>
                  )}
                  {kw.keyword}
                  {/* 소멸 배지 */}
                  {kw.isGone && (
                    <span
                      className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded bg-red-100 text-red-500 align-middle"
                      style={{ fontSize: 9 }}
                    >
                      사라짐
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {onKeywordClick && (
            <p className="text-[10px] text-muted-foreground mt-3">
              💡 키워드 클릭 시 트렌드 탐색에서 검색합니다
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

      {/* ── 헤더: 페이지 제목 + 기간 선택 ─────────────────────── */}
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

      {/* ── 섹션 3+4: 상승/하강 키워드 워드 클라우드 (2열 / 1열) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <KeywordCloudSection
          type="rising"
          data={data?.risingCloud ?? []}
          loading={loading}
          onKeywordClick={onKeywordClick}
        />
        <KeywordCloudSection
          type="falling"
          data={data?.fallingCloud ?? []}
          loading={loading}
          onKeywordClick={onKeywordClick}
        />
      </div>

      {/* ── 섹션 5+6: 라이프사이클 + 스타일 (2열 / 1열) ────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LifecycleDonut data={data?.lifecycleData ?? []} loading={loading} />
        <StyleChart     data={data?.styleData     ?? []} loading={loading} />
      </div>

    </div>
  );
};

export default TrendReportTab;
