import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDown, TrendingUp, TrendingDown } from 'lucide-react';

interface Stat {
  key: string;
  criteriaName: string;
  count: number;
  avgDiff: string;
  direction: 'overrate' | 'underrate' | 'neutral';
  status: string;
}

interface Props {
  stats: Stat[];
}

const CorrectionStatsSection = ({ stats }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <ArrowUpDown size={18} className="text-primary" />
        항목별 교정 통계
      </CardTitle>
    </CardHeader>
    <CardContent>
      {stats.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>기준명</TableHead>
              <TableHead className="text-center">수정 횟수</TableHead>
              <TableHead className="text-center">평균 차이</TableHead>
              <TableHead className="text-center">방향</TableHead>
              <TableHead className="text-center">상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.map((stat) => (
              <TableRow key={stat.key}>
                <TableCell className="font-medium text-sm">{stat.criteriaName}</TableCell>
                <TableCell className="text-center text-sm">{stat.count}</TableCell>
                <TableCell className="text-center text-sm">
                  <span className={Number(stat.avgDiff) > 0 ? 'text-red-600' : Number(stat.avgDiff) < 0 ? 'text-blue-600' : ''}>
                    {Number(stat.avgDiff) > 0 ? '+' : ''}{stat.avgDiff}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="flex items-center justify-center gap-1 text-xs">
                    {stat.direction === 'overrate' ? (
                      <><TrendingUp size={14} className="text-red-500" /> <span className="text-red-600">AI 과대평가</span></>
                    ) : stat.direction === 'underrate' ? (
                      <><TrendingDown size={14} className="text-blue-500" /> <span className="text-blue-600">AI 과소평가</span></>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={stat.status === '개선 필요' ? 'destructive' : stat.status === '관찰 중' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {stat.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-sm text-muted-foreground py-4 text-center">
          아직 교정 데이터가 없습니다. 스코어링 화면에서 AI 점수를 교정해 주세요.
        </div>
      )}
    </CardContent>
  </Card>
);

export default CorrectionStatsSection;
