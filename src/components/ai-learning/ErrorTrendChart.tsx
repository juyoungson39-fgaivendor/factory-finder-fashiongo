import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingDown, HelpCircle } from 'lucide-react';
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { simulateVersionScores } from '@/lib/demoData';

interface Props {
  versions: any[];
  /** 실제 factory_scores 데이터 (시뮬레이션 기준) */
  factoryScores: any[];
}

/**
 * 모델 버전별 평균 오차 추이 꺾은선 차트.
 *
 * simulateVersionScores()로 각 버전의 AI 점수를 시뮬레이션하고,
 * |simulated_ai_score - human_score|의 평균을 오차로 표시.
 * 채점 페이지 레이더 차트와 동일한 시뮬레이션 로직 사용.
 */
const ErrorTrendChart = ({ versions, factoryScores }: Props) => {
  const chartData = useMemo(() => {
    if (!versions || versions.length === 0 || !factoryScores || factoryScores.length === 0) return [];

    // 버전을 deployed_at 오름차순 정렬 (V1.0 → V2.0 → V3.0)
    const sorted = [...versions].sort((a, b) => {
      const aTime = a.deployed_at ? new Date(a.deployed_at).getTime() : 0;
      const bTime = b.deployed_at ? new Date(b.deployed_at).getTime() : 0;
      return aTime - bTime;
    });

    const totalVersions = sorted.length;

    return sorted.map((v, idx) => {
      const label = v.internal_version || v.version;
      const isActive = v.status === 'ACTIVE';

      // simulateVersionScores로 이 버전의 AI 점수 시뮬레이션
      const simulated = simulateVersionScores(factoryScores, idx, totalVersions);

      // |simulated_ai_score - human_score| 평균
      const errors = simulated
        .map((s) => {
          const aiScore = Number(s.ai_original_score) || 0;
          const humanScore = Number(s.score) || 0;
          return Math.abs(aiScore - humanScore);
        })
        .filter((e) => e > 0); // 오차 0인 항목(정확히 맞춘 것)도 포함하려면 이 줄 제거

      const avgError = errors.length > 0
        ? errors.reduce((a, b) => a + b, 0) / factoryScores.length // 전체 항목 대비 평균
        : 0;

      return {
        version: label,
        avgError: Math.round(avgError * 10) / 10,
        trainingCount: v.training_count ?? 0,
        isActive,
      };
    });
  }, [versions, factoryScores]);

  if (chartData.length < 2) return null;

  const firstError = chartData[0]?.avgError ?? 0;
  const lastError = chartData[chartData.length - 1]?.avgError ?? 0;
  const improvement = firstError > 0 ? Math.round((1 - lastError / firstError) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingDown size={18} className="text-primary" />
          버전별 평균 오차 추이
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <HelpCircle size={14} className="text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
                <p className="font-semibold mb-1">계산 방식</p>
                <p>각 버전의 AI 점수를 시뮬레이션한 뒤,</p>
                <p className="font-mono mt-1">평균 오차 = Σ|AI점수 - 사람점수| ÷ 전체 항목 수</p>
                <p className="mt-1 text-muted-foreground">오래된 버전일수록 오차가 크고, 학습이 반복될수록 줄어듭니다.</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
          {improvement > 0 && (
            <span className="ml-auto text-sm font-normal text-green-600">
              ▼ {improvement}% 개선
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          모델 학습이 반복될수록 AI 채점 오차가 줄어드는 추세를 보여줍니다.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="version"
              tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
            />
            <YAxis
              domain={[0, 'auto']}
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={{ stroke: 'hsl(var(--border))' }}
              label={{
                value: '평균 오차',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
              }}
            />
            <ReferenceLine y={1.0} stroke="hsl(var(--destructive))" strokeDasharray="5 5" strokeOpacity={0.4} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
                fontSize: 12,
              }}
              formatter={(value: number, _name: string, props: any) => {
                const d = props.payload;
                return [
                  <span key="v">
                    <strong>평균 오차:</strong> ±{value}점
                    <br />
                    <strong>학습 데이터:</strong> {d.trainingCount}건
                  </span>,
                  '',
                ];
              }}
              labelFormatter={(label: string) => `모델 ${label}`}
            />
            <Line
              type="monotone"
              dataKey="avgError"
              stroke="hsl(217, 70%, 55%)"
              strokeWidth={2.5}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                const color = payload.isActive
                  ? 'hsl(152, 60%, 45%)'
                  : 'hsl(217, 70%, 55%)';
                return (
                  <circle
                    key={payload.version}
                    cx={cx}
                    cy={cy}
                    r={payload.isActive ? 6 : 5}
                    fill={color}
                    stroke="white"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 7, strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>

        {/* 버전별 요약 */}
        <div className="flex justify-between mt-4 px-2">
          {chartData.map((d) => (
            <div key={d.version} className="text-center">
              <div className="text-xs font-mono text-muted-foreground">{d.version}</div>
              <div className={`text-sm font-bold ${
                d.avgError >= 2.0 ? 'text-red-600' : d.avgError >= 1.0 ? 'text-amber-600' : 'text-green-600'
              }`}>
                ±{d.avgError}
              </div>
              <div className="text-[10px] text-muted-foreground">{d.trainingCount}건</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default ErrorTrendChart;
