import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import ModelVersionDetailDialog from './ModelVersionDetailDialog';
import { cn } from '@/lib/utils';

interface Props {
  versions: any[];
}

type SortKey = 'internal_version' | 'version' | 'base_model' | 'deployed_at';
type SortDir = 'asc' | 'desc' | null;

const parseInternalVersion = (v: string | null): number => {
  if (!v) return 0;
  const match = v.match(/V(\d+)\.(\d+)/);
  if (!match) return 0;
  return parseInt(match[1]) * 100 + parseInt(match[2]);
};

const ModelHistorySection = ({ versions }: Props) => {
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [sortKey, setSortKey] = useState<SortKey>('deployed_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      // Toggle: asc → desc → null (default = deployed_at desc)
      if (sortDir === 'asc') setSortDir('desc');
      else if (sortDir === 'desc') {
        setSortKey('deployed_at');
        setSortDir('desc');
      }
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortedVersions = useMemo(() => {
    const sorted = [...versions];

    sorted.sort((a, b) => {
      const aIsBase = a.version === 'v0-base' || a.internal_version === 'V1.0';
      const bIsBase = b.version === 'v0-base' || b.internal_version === 'V1.0';

      // For deployed_at sorting, v0-base always goes to bottom
      if (sortKey === 'deployed_at') {
        if (aIsBase && !bIsBase) return 1;
        if (!aIsBase && bIsBase) return -1;
      }

      let cmp = 0;
      if (sortKey === 'internal_version') {
        cmp = parseInternalVersion(a.internal_version) - parseInternalVersion(b.internal_version);
      } else if (sortKey === 'version') {
        cmp = (a.version || '').localeCompare(b.version || '');
      } else if (sortKey === 'base_model') {
        cmp = (a.base_model || '').localeCompare(b.base_model || '');
      } else if (sortKey === 'deployed_at') {
        const aDate = a.deployed_at ? new Date(a.deployed_at).getTime() : 0;
        const bDate = b.deployed_at ? new Date(b.deployed_at).getTime() : 0;
        cmp = aDate - bDate;
      }

      return sortDir === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }, [versions, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col || !sortDir) {
      return <ArrowUpDown size={13} className="text-muted-foreground/40" />;
    }
    return sortDir === 'asc'
      ? <ArrowUp size={13} className="text-foreground" />
      : <ArrowDown size={13} className="text-foreground" />;
  };

  const sortableHeadClass = "cursor-pointer select-none hover:text-foreground transition-colors";

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History size={18} className="text-primary" />
            모델 이력
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sortedVersions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={sortableHeadClass} onClick={() => handleSort('internal_version')}>
                    <span className="inline-flex items-center gap-1">내부 버전 <SortIcon col="internal_version" /></span>
                  </TableHead>
                  <TableHead className={sortableHeadClass} onClick={() => handleSort('version')}>
                    <span className="inline-flex items-center gap-1">버전 <SortIcon col="version" /></span>
                  </TableHead>
                  <TableHead className="text-center">상태</TableHead>
                  <TableHead className={sortableHeadClass} onClick={() => handleSort('base_model')}>
                    <span className="inline-flex items-center gap-1">기반 모델 <SortIcon col="base_model" /></span>
                  </TableHead>
                  <TableHead className="text-center">학습 건수</TableHead>
                  <TableHead className={sortableHeadClass} onClick={() => handleSort('deployed_at')}>
                    <span className="inline-flex items-center gap-1">배포일 <SortIcon col="deployed_at" /></span>
                  </TableHead>
                  <TableHead className="text-center">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedVersions.map((mv: any) => {
                  const isBase = mv.version === 'v0-base' || mv.internal_version === 'V1.0';
                  const isActive = mv.status === 'ACTIVE';

                  return (
                    <TableRow
                      key={mv.id}
                      className={cn(
                        "cursor-pointer transition-all duration-200",
                        isActive && "bg-success/10 hover:bg-success/20",
                        isBase && !isActive && "bg-muted/50 hover:bg-muted/70",
                        !isActive && !isBase && "hover:bg-muted/50"
                      )}
                      onClick={() => setSelectedVersion(mv)}
                    >
                      <TableCell className="font-mono font-bold text-sm text-primary">
                        {mv.internal_version || '-'}
                      </TableCell>
                      <TableCell className="font-medium text-sm">{mv.version}</TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={isActive ? 'default' : mv.status === 'TRAINING' ? 'secondary' : 'outline'}
                          className="text-[10px]"
                        >
                          {mv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{mv.base_model}</TableCell>
                      <TableCell className="text-center text-sm">{mv.training_count}</TableCell>
                      <TableCell className="text-sm">
                        {mv.deployed_at
                          ? new Date(mv.deployed_at).toLocaleString('ko-KR', {
                              year: 'numeric', month: '2-digit', day: '2-digit',
                              hour: '2-digit', minute: '2-digit', second: '2-digit',
                            })
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
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
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              아직 학습된 모델 버전이 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <ModelVersionDetailDialog
        open={!!selectedVersion}
        onOpenChange={(open) => { if (!open) setSelectedVersion(null); }}
        version={selectedVersion}
        allVersions={versions}
      />
    </>
  );
};

export default ModelHistorySection;
