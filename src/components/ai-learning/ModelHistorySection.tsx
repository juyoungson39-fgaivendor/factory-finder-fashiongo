import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  versions: any[];
}

const getInternalVersion = (index: number, total: number) => {
  const versionNum = total - index;
  const major = Math.floor((versionNum - 1) / 10) + 1;
  const minor = (versionNum - 1) % 10;
  return `V${major}.${minor}`;
};

const ModelHistorySection = ({ versions }: Props) => (
  <Card>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <History size={18} className="text-primary" />
        모델 이력
      </CardTitle>
    </CardHeader>
    <CardContent>
      {versions.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>내부 버전</TableHead>
              <TableHead>버전</TableHead>
              <TableHead className="text-center">상태</TableHead>
              <TableHead>기반 모델</TableHead>
              <TableHead className="text-center">학습 건수</TableHead>
              <TableHead>개선 수치</TableHead>
              <TableHead>배포일</TableHead>
              <TableHead className="text-center">액션</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {versions.map((mv: any, idx: number) => (
              <TableRow key={mv.id}>
                <TableCell className="font-mono font-semibold text-sm text-primary">{getInternalVersion(idx, versions.length)}</TableCell>
                <TableCell className="font-medium text-sm">{mv.version}</TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant={mv.status === 'ACTIVE' ? 'default' : mv.status === 'TRAINING' ? 'secondary' : 'outline'}
                    className="text-[10px]"
                  >
                    {mv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{mv.base_model}</TableCell>
                <TableCell className="text-center text-sm">{mv.training_count}</TableCell>
                <TableCell className="text-sm">{mv.improvement_notes || '-'}</TableCell>
                <TableCell className="text-sm">
                  {mv.deployed_at ? new Date(mv.deployed_at).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                </TableCell>
                <TableCell className="text-center">
                  {mv.status !== 'ACTIVE' && mv.status !== 'TRAINING' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => toast.info('롤백 기능은 Vertex AI 연동 후 사용 가능합니다.')}
                    >
                      롤백
                    </Button>
                  )}
                  {mv.status === 'TRAINING' && (
                    <span className="text-xs text-muted-foreground">{mv.progress_pct}%</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="text-sm text-muted-foreground py-4 text-center">
          아직 학습된 모델 버전이 없습니다.
        </div>
      )}
    </CardContent>
  </Card>
);

export default ModelHistorySection;
