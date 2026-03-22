import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Brain, Database, Rocket, History, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { toast } from 'sonner';

const AILearning = () => {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();

  // Fetch active model version
  const { data: activeModel } = useQuery({
    queryKey: ['ai-model-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_model_versions')
        .select('*')
        .eq('status', 'ACTIVE')
        .maybeSingle();
      return data;
    },
    enabled: isAdmin,
  });

  // Fetch all model versions
  const { data: modelVersions = [] } = useQuery({
    queryKey: ['ai-model-versions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_model_versions')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  // Fetch scoring corrections stats
  const { data: corrections = [] } = useQuery({
    queryKey: ['scoring-corrections'],
    queryFn: async () => {
      const { data } = await supabase
        .from('scoring_corrections')
        .select('*')
        .order('collected_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  if (adminLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">로딩 중...</div>;
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const totalCorrections = corrections.length;
  const validCorrections = corrections.filter((c: any) => c.is_valid).length;
  const invalidCorrections = totalCorrections - validCorrections;

  // Group corrections by criteria_key for stats
  const criteriaStats = corrections.reduce((acc: any, c: any) => {
    if (!acc[c.criteria_key]) {
      acc[c.criteria_key] = { count: 0, totalDiff: 0, diffs: [] };
    }
    acc[c.criteria_key].count++;
    acc[c.criteria_key].totalDiff += c.diff || 0;
    acc[c.criteria_key].diffs.push(c.diff || 0);
    return acc;
  }, {});

  const criteriaStatsArray = Object.entries(criteriaStats).map(([key, val]: any) => ({
    key,
    count: val.count,
    avgDiff: val.count > 0 ? (val.totalDiff / val.count).toFixed(1) : '0',
    direction: val.totalDiff > 0 ? 'overrate' : val.totalDiff < 0 ? 'underrate' : 'neutral',
  })).sort((a, b) => b.count - a.count);

  const trainingModel = modelVersions.find((m: any) => m.status === 'TRAINING');
  const canFineTune = validCorrections >= 100;

  return (
    <div className="space-y-6">
      {/* Section 1: 현재 적용 모델 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Brain size={18} className="text-primary" />
            현재 적용 모델
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeModel ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">모델 버전</p>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{activeModel.version}</span>
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">ACTIVE</Badge>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">학습 데이터</p>
                <span className="font-medium text-sm">{activeModel.training_count}건</span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">배포일</p>
                <span className="font-medium text-sm">
                  {activeModel.deployed_at ? new Date(activeModel.deployed_at).toLocaleDateString('ko-KR') : '-'}
                </span>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">마지막 학습 이후 신규</p>
                <span className="font-medium text-sm">
                  {corrections.filter((c: any) => !c.used_in_version || c.used_in_version !== activeModel.version).length}건
                </span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-4 text-center">
              활성 모델이 없습니다. 기본 AI 모델이 사용됩니다.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: 항목별 교정 통계 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpDown size={18} className="text-primary" />
            항목별 교정 통계
          </CardTitle>
        </CardHeader>
        <CardContent>
          {criteriaStatsArray.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>항목명</TableHead>
                  <TableHead className="text-center">수정 횟수</TableHead>
                  <TableHead className="text-center">평균 차이</TableHead>
                  <TableHead className="text-center">방향</TableHead>
                  <TableHead className="text-center">상태</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {criteriaStatsArray.map((stat) => (
                  <TableRow key={stat.key}>
                    <TableCell className="font-medium text-sm">{stat.key}</TableCell>
                    <TableCell className="text-center text-sm">{stat.count}</TableCell>
                    <TableCell className="text-center text-sm">
                      <span className={Number(stat.avgDiff) > 0 ? 'text-red-600' : Number(stat.avgDiff) < 0 ? 'text-blue-600' : ''}>
                        {Number(stat.avgDiff) > 0 ? '+' : ''}{stat.avgDiff}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="flex items-center justify-center gap-1 text-xs">
                        {stat.direction === 'overrate' ? (
                          <><TrendingUp size={14} className="text-red-500" /> <span className="text-red-600">↑ AI 과대평가</span></>
                        ) : stat.direction === 'underrate' ? (
                          <><TrendingDown size={14} className="text-blue-500" /> <span className="text-blue-600">↓ AI 과소평가</span></>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={stat.count >= 30 ? 'destructive' : stat.count >= 15 ? 'secondary' : 'outline'} className="text-[10px]">
                        {stat.count >= 30 ? '개선 필요' : stat.count >= 15 ? '관찰 중' : '양호'}
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

      {/* Section 3: Fine-tuning 실행 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Rocket size={18} className="text-primary" />
            Fine-tuning 실행
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">총 교정 데이터</p>
              <p className="text-lg font-semibold">{totalCorrections}건</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">유효 (교정)</p>
              <p className="text-lg font-semibold text-green-600">{validCorrections}건</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">부적합</p>
              <p className="text-lg font-semibold text-red-500">{invalidCorrections}건</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground mb-1">예상 비용 / 시간</p>
              <p className="text-lg font-semibold">~$0.77 / 1~3시간</p>
            </div>
          </div>

          {trainingModel && (
            <div className="rounded-lg border p-4 bg-blue-50">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">학습 진행 중: {trainingModel.version}</span>
                <span className="text-xs text-muted-foreground">{trainingModel.progress_pct}%</span>
              </div>
              <Progress value={trainingModel.progress_pct} className="h-2" />
            </div>
          )}

          {!canFineTune && (
            <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <AlertTriangle size={16} className="text-yellow-600 mt-0.5 shrink-0" />
              <p className="text-xs text-yellow-800">
                Fine-tuning을 시작하려면 최소 100건의 유효한 교정 데이터가 필요합니다.
                현재 {validCorrections}건 수집됨.
              </p>
            </div>
          )}

          <Button
            disabled={!canFineTune || !!trainingModel}
            onClick={() => toast.info('Fine-tuning 파이프라인은 Vertex AI 연동 후 사용 가능합니다.')}
            className="w-full"
          >
            <Rocket size={16} className="mr-2" />
            {trainingModel ? '학습 진행 중...' : 'Fine-tuning 시작'}
          </Button>
        </CardContent>
      </Card>

      {/* Section 4: 모델 이력 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History size={18} className="text-primary" />
            모델 이력
          </CardTitle>
        </CardHeader>
        <CardContent>
          {modelVersions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
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
                {modelVersions.map((mv: any) => (
                  <TableRow key={mv.id}>
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
                      {mv.deployed_at ? new Date(mv.deployed_at).toLocaleDateString('ko-KR') : '-'}
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
    </div>
  );
};

export default AILearning;
