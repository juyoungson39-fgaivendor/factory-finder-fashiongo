import { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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
  const queryClient = useQueryClient();
  const [selectedVersion, setSelectedVersion] = useState<any>(null);
  const [rollbackTarget, setRollbackTarget] = useState<any>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('deployed_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setIsRollingBack(true);
    try {
      // v0-base (vertex_job_id IS NULL) 은 Vertex endpoint 가 없어 롤백 대상 아님
      if (!rollbackTarget.vertex_job_id) {
        toast.error('기본 모델(v0-base)은 롤백 대상이 아닙니다. 다른 파인튜닝 버전을 선택하세요.');
        setRollbackTarget(null);
        return;
      }

      const currentActive = versions.find((v: any) => v.status === 'ACTIVE');

      // 1) 대상 버전을 ACTIVE 로
      const { error: activateErr } = await supabase
        .from('ai_model_versions')
        .update({ status: 'ACTIVE' })
        .eq('id', rollbackTarget.id);
      if (activateErr) throw activateErr;

      // 2) 기존 ACTIVE 를 INACTIVE 로 (있을 때만)
      if (currentActive && currentActive.id !== rollbackTarget.id) {
        const { error: deactivateErr } = await supabase
          .from('ai_model_versions')
          .update({ status: 'INACTIVE' })
          .eq('id', currentActive.id);
        if (deactivateErr) throw deactivateErr;
      }

      toast.success(`모델 ${rollbackTarget.version} (으)로 롤백되었습니다.`);
      queryClient.invalidateQueries({ queryKey: ['ai-model-active'] });
      queryClient.invalidateQueries({ queryKey: ['ai-model-versions'] });
    } catch (err: any) {
      toast.error(`롤백 실패: ${err.message ?? err}`);
    } finally {
      setIsRollingBack(false);
      setRollbackTarget(null);
    }
  };

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
                        {mv.status !== 'ACTIVE' && mv.status !== 'TRAINING' && mv.vertex_job_id && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setRollbackTarget(mv)}
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

      <AlertDialog open={!!rollbackTarget} onOpenChange={(open) => { if (!open && !isRollingBack) setRollbackTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>모델 롤백 확인</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-mono font-semibold">{rollbackTarget?.version}</span>
                  {rollbackTarget?.internal_version ? ` (${rollbackTarget.internal_version})` : ''} 을(를) 활성 모델로 전환합니다.
                </p>
                <p className="text-muted-foreground">
                  현재 ACTIVE 모델은 INACTIVE 로 전환되며, 이후 scrape-factory 채점은 선택한 버전으로 수행됩니다.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRollingBack}>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleRollback} disabled={isRollingBack}>
              {isRollingBack && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              롤백 실행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ModelHistorySection;
