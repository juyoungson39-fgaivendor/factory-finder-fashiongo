import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

interface Props {
  selfShipping?: number | null;
  imageQuality?: number | null;
  moqFlex?: number | null;
  leadTime?: number | null;
  communication?: number | null;
  variety?: number | null;
}

export default function AIPhase1RadarCard(p: Props) {
  const all = [
    { axis: '자체발송', value: Number(p.selfShipping ?? 0) },
    { axis: '이미지', value: Number(p.imageQuality ?? 0) },
    { axis: 'MOQ', value: Number(p.moqFlex ?? 0) },
    { axis: '납기', value: Number(p.leadTime ?? 0) },
    { axis: '소통', value: Number(p.communication ?? 0) },
    { axis: '다양성', value: Number(p.variety ?? 0) },
  ];
  // 0점 항목 제외
  const data = all.filter((d) => d.value > 0);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
          📊 점수 기준 스파이더
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        {data.length < 3 ? (
          <div className="h-[280px] flex items-center justify-center text-xs text-muted-foreground">
            유효 항목 부족 (0점 제외 시 3개 미만)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data} outerRadius="75%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis
                dataKey="axis"
                tick={{ fontSize: 11, fill: 'hsl(var(--foreground))' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 10]}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [`${v.toFixed(1)} / 10`, '점수']}
              />
              <Radar
                name="점수"
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}
        <p className="text-[10px] text-muted-foreground mt-2 text-center">
          * 0점 항목은 제외하여 표시 ({all.length - data.length}개 제외)
        </p>
      </CardContent>
    </Card>
  );
}
