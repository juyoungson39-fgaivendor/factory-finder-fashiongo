import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  BookOpen, Database, MessageSquare, BarChart3,
  TrendingUp, TrendingDown, ArrowRight,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: any;
  allVersions: any[];
}

const ModelVersionDetailDialog = ({ open, onOpenChange, version, allVersions }: Props) => {
  const navigate = useNavigate();

  // Find the previous version
  const prevVersion = useMemo(() => {
    if (!version || !allVersions.length) return null;
    const sorted = [...allVersions].sort(
      (a, b) => new Date(a.deployed_at || a.created_at).getTime() - new Date(b.deployed_at || b.created_at).getTime()
    );
    const idx = sorted.findIndex(v => v.id === version.id);
    return idx > 0 ? sorted[idx - 1] : null;
  }, [version, allVersions]);

  // Corrections used in this version
  const { data: corrections = [] } = useQuery({
    queryKey: ['model-detail-corrections', version?.version],
    queryFn: async () => {
      if (!version?.version) return [];
      const { data } = await supabase
        .from('scoring_corrections')
        .select('*')
        .eq('used_in_version', version.version)
        .eq('is_valid', true)
        .order('collected_at', { ascending: false });
      return data || [];
    },
    enabled: open && !!version?.version,
  });

  // Corrections used in prev version (for comparison)
  const { data: prevCorrections = [] } = useQuery({
    queryKey: ['model-detail-prev-corrections', prevVersion?.version],
    queryFn: async () => {
      if (!prevVersion?.version) return [];
      const { data } = await supabase
        .from('scoring_corrections')
        .select('*')
        .eq('used_in_version', prevVersion.version)
        .eq('is_valid', true);
      return data || [];
    },
    enabled: open && !!prevVersion?.version,
  });

  // Factory names
  const vendorIds = useMemo(() => [...new Set(corrections.map((c: any) => c.vendor_id))], [corrections]);
  const { data: factories = [] } = useQuery({
    queryKey: ['model-detail-factories', vendorIds],
    queryFn: async () => {
      if (!vendorIds.length) return [];
      const { data } = await supabase.from('factories').select('id, name, country, city, moq, lead_time, platform_score, repurchase_rate').in('id', vendorIds);
      return data || [];
    },
    enabled: open && vendorIds.length > 0,
  });

  // Scoring criteria names (to resolve UUID → name)
  const criteriaIds = useMemo(() => [...new Set(corrections.map((c: any) => c.criteria_key))], [corrections]);
  const { data: criteriaList = [] } = useQuery({
    queryKey: ['model-detail-criteria', criteriaIds],
    queryFn: async () => {
      if (!criteriaIds.length) return [];
      const { data } = await supabase.from('scoring_criteria').select('id, name').in('id', criteriaIds);
      return data || [];
    },
    enabled: open && criteriaIds.length > 0,
  });
  const criteriaMap = useMemo(() => Object.fromEntries(criteriaList.map((c: any) => [c.id, c.name])), [criteriaList]);

  // Profiles
  const correctorIds = useMemo(() => [...new Set(corrections.map((c: any) => c.collected_by))], [corrections]);
  const { data: profiles = [] } = useQuery({
    queryKey: ['model-detail-profiles', correctorIds],
    queryFn: async () => {
      if (!correctorIds.length) return [];
      const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', correctorIds);
      return data || [];
    },
    enabled: open && correctorIds.length > 0,
  });

  const factoryMap = useMemo(() => Object.fromEntries(factories.map((f: any) => [f.id, f])), [factories]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || p.user_id.slice(0, 6)])), [profiles]);

  // Group corrections by criteria for few-shot & pattern analysis
  const groupedByCriteria = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of corrections) {
      const key = (c as any).criteria_key;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [corrections]);

  const prevGroupedByCriteria = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const c of prevCorrections) {
      const key = (c as any).criteria_key;
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    return map;
  }, [prevCorrections]);

  // Overview summary
  const overviewSummary = useMemo(() => {
    if (!corrections.length) return '';
    const sorted = Object.entries(groupedByCriteria).sort((a, b) => b[1].length - a[1].length);
    const topItems = sorted.slice(0, 2).map(([k, v]) => `'${k}'`);
    const topCount = sorted[0]?.[1]?.length || 0;
    const topKey = sorted[0]?.[0] || '';
    const avgDiffs = sorted[0]?.[1]?.map((c: any) => c.diff ?? (c.corrected_score - c.ai_score)) || [];
    const avgDiff = avgDiffs.length ? avgDiffs.reduce((a: number, b: number) => a + b, 0) / avgDiffs.length : 0;
    const direction = avgDiff < 0 ? '과대평가 경향을 하향 조정' : avgDiff > 0 ? '과소평가 경향을 상향 조정' : '평가 정확도 유지';

    return `이 버전은 주로 ${topItems.join('와 ')} 항목의 평가 정확도를 개선하기 위해 학습되었습니다. ${corrections.length}건의 교정 데이터 중 ${topKey} 관련 교정이 ${topCount}건으로 가장 많았으며, AI의 ${direction}하는 방향으로 학습되었습니다.`;
  }, [corrections, groupedByCriteria]);

  // Training duration
  const trainingDuration = useMemo(() => {
    if (!version) return '-';
    const job = version;
    if (job.deployed_at && job.created_at) {
      const diff = new Date(job.deployed_at).getTime() - new Date(job.created_at).getTime();
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      if (hours > 0) return `${hours}시간 ${mins}분`;
      return `${mins}분`;
    }
    return '-';
  }, [version]);

  // Performance comparison chart data
  const chartData = useMemo(() => {
    const allKeys = [...new Set([
      ...Object.keys(groupedByCriteria),
      ...Object.keys(prevGroupedByCriteria),
    ])];

    return allKeys.map(key => {
      const curr = groupedByCriteria[key] || [];
      const prev = prevGroupedByCriteria[key] || [];

      const currAvgErr = curr.length
        ? curr.reduce((sum: number, c: any) => sum + Math.abs(c.diff ?? (c.corrected_score - c.ai_score)), 0) / curr.length
        : 0;
      const prevAvgErr = prev.length
        ? prev.reduce((sum: number, c: any) => sum + Math.abs(c.diff ?? (c.corrected_score - c.ai_score)), 0) / prev.length
        : 0;

      const displayName = criteriaMap[key] || key;
      return {
        name: displayName.length > 8 ? displayName.slice(0, 8) + '…' : displayName,
        fullName: displayName,
        이전: Number(prevAvgErr.toFixed(1)),
        현재: Number(currAvgErr.toFixed(1)),
      };
    }).sort((a, b) => b.현재 - a.현재);
  }, [groupedByCriteria, prevGroupedByCriteria]);

  // Overall avg error
  const overallStats = useMemo(() => {
    const currAll = corrections.map((c: any) => Math.abs(c.diff ?? (c.corrected_score - c.ai_score)));
    const prevAll = prevCorrections.map((c: any) => Math.abs(c.diff ?? (c.corrected_score - c.ai_score)));
    const currAvg = currAll.length ? currAll.reduce((a, b) => a + b, 0) / currAll.length : 0;
    const prevAvg = prevAll.length ? prevAll.reduce((a, b) => a + b, 0) / prevAll.length : 0;
    const improvement = prevAvg > 0 ? ((prevAvg - currAvg) / prevAvg * 100) : 0;

    // Best improved
    const best = chartData.reduce((best, d) => {
      const imp = d.이전 - d.현재;
      return imp > (best?.imp || 0) ? { name: d.fullName, prev: d.이전, curr: d.현재, imp } : best;
    }, null as any);

    // Needs improvement
    const worst = chartData.reduce((worst, d) => {
      return d.현재 > (worst?.curr || 0) ? { name: d.fullName, prev: d.이전, curr: d.현재 } : worst;
    }, null as any);

    return { currAvg, prevAvg, improvement, best, worst };
  }, [corrections, prevCorrections, chartData]);

  if (!version) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            모델 {version.version} 학습 상세
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="overview" className="text-xs gap-1.5">
              <BookOpen size={13} /> 학습 개요
            </TabsTrigger>
            <TabsTrigger value="data" className="text-xs gap-1.5">
              <Database size={13} /> 학습 데이터
            </TabsTrigger>
            <TabsTrigger value="fewshot" className="text-xs gap-1.5">
              <MessageSquare size={13} /> Few-shot
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs gap-1.5">
              <BarChart3 size={13} /> 성능 비교
            </TabsTrigger>
          </TabsList>

          {/* ─── Tab 1: Overview ─── */}
          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <InfoItem label="기반 모델" value={version.base_model} />
              <InfoItem label="학습 일시" value={version.deployed_at ? new Date(version.deployed_at).toLocaleString('ko-KR') : '-'} />
              <InfoItem label="교정 데이터 수" value={`${corrections.length}건`} />
              <InfoItem label="교정된 항목 수" value={`${Object.keys(groupedByCriteria).length}개 항목`} />
              <InfoItem label="교정 공장 수" value={`${vendorIds.length}개 공장`} />
              <InfoItem label="학습 소요 시간" value={trainingDuration} />
              <InfoItem label="이전 모델" value={prevVersion?.version || '없음 (초기)'} />
              <InfoItem
                label="상태"
                value={
                  <Badge
                    variant={version.status === 'ACTIVE' ? 'default' : 'secondary'}
                    className="text-[10px]"
                  >
                    {version.status}
                  </Badge>
                }
              />
            </div>

            {overviewSummary && (
              <Card className="bg-muted/30">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-2">📝 이 버전의 핵심 변화</p>
                  <p className="text-sm leading-relaxed">{overviewSummary}</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Tab 2: Training Data ─── */}
          <TabsContent value="data" className="mt-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>공장명</TableHead>
                    <TableHead>항목</TableHead>
                    <TableHead className="text-center">AI 원본</TableHead>
                    <TableHead className="text-center">교정값</TableHead>
                    <TableHead>사유</TableHead>
                    <TableHead>교정자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {corrections.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        이 버전에 사용된 학습 데이터가 없습니다.
                      </TableCell>
                    </TableRow>
                  ) : (
                    corrections.map((c: any) => {
                      const factory = factoryMap[c.vendor_id];
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/factory/${c.vendor_id}`);
                          }}
                        >
                          <TableCell className="text-sm font-medium">
                            {factory?.name || c.vendor_id.slice(0, 8)}
                          </TableCell>
                          <TableCell className="text-sm">{criteriaMap[c.criteria_key] || c.criteria_key}</TableCell>
                          <TableCell className="text-center text-sm">{c.ai_score}</TableCell>
                          <TableCell className="text-center text-sm font-medium">{c.corrected_score}</TableCell>
                          <TableCell className="text-sm max-w-[180px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-default">{c.reason || '-'}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{c.reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {profileMap[c.collected_by] || c.collected_by.slice(0, 8)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* ─── Tab 3: Few-shot Prompts ─── */}
          <TabsContent value="fewshot" className="mt-4 space-y-4">
            {Object.keys(groupedByCriteria).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Few-shot 프롬프트 데이터가 없습니다.
              </p>
            ) : (
              Object.entries(groupedByCriteria).map(([criteriaKey, items]) => (
                <div key={criteriaKey} className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare size={14} className="text-primary" />
                    {criteriaMap[criteriaKey] || criteriaKey}
                    <Badge variant="outline" className="text-[10px]">{items.length}건</Badge>
                  </h4>
                  {items.map((c: any, idx: number) => {
                    const factory = factoryMap[c.vendor_id];
                    const diff = c.diff ?? (c.corrected_score - c.ai_score);
                    const _absAvg = Math.abs(diff);

                    // Generate learning message
                    let learningMsg: string;
                    const criteriaName = criteriaMap[criteriaKey] || criteriaKey;
                    if (diff < 0) {
                      learningMsg = `이 공장은 관련 지표가 양호해 보이지만, 실제 확인이 필요합니다. ${criteriaName} 관련 명확한 증거가 없으면 ${Math.max(1, c.corrected_score)}점 이하로 평가하세요.`;
                    } else if (diff > 0) {
                      learningMsg = `이 공장은 ${criteriaName} 관련 실적이 확인되었습니다. 관련 증거가 확인되면 ${c.corrected_score}점 이상으로 평가하세요.`;
                    } else {
                      learningMsg = `현재 평가 기준을 유지하세요. AI의 판단이 정확했습니다.`;
                    }

                    return (
                      <Card key={c.id} className="border-l-[3px] border-l-primary/40">
                        <CardContent className="pt-4 pb-3 space-y-3">
                          <p className="text-xs font-semibold text-muted-foreground">
                            📝 {criteriaMap[criteriaKey] || criteriaKey} — 예시 {idx + 1}
                          </p>

                          {/* Input data */}
                          <div className="rounded bg-muted/40 p-3 space-y-1">
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">[입력 데이터]</p>
                            <p className="text-xs">공장: {factory?.name || c.vendor_id.slice(0, 8)}</p>
                            {factory?.country && (
                              <p className="text-xs">국가: {factory.country}{factory.city ? `, ${factory.city}` : ''}</p>
                            )}
                            <p className="text-xs">
                              {factory?.moq ? `MOQ: ${factory.moq}` : ''}
                              {factory?.moq && factory?.lead_time ? ' | ' : ''}
                              {factory?.lead_time ? `리드타임: ${factory.lead_time}` : ''}
                            </p>
                            {(factory?.platform_score || factory?.repurchase_rate) && (
                              <p className="text-xs">
                                {factory?.platform_score ? `플랫폼 점수: ${factory.platform_score}` : ''}
                                {factory?.platform_score && factory?.repurchase_rate ? ' | ' : ''}
                                {factory?.repurchase_rate ? `재구매율: ${factory.repurchase_rate}%` : ''}
                              </p>
                            )}
                          </div>

                          {/* Correction result */}
                          <div className="rounded bg-muted/40 p-3">
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">[AI 평가 → 교정 결과]</p>
                            <p className="text-xs">
                              AI 점수: <span className="font-medium">{c.ai_score}</span>
                              <ArrowRight size={12} className="inline mx-1.5" />
                              교정 점수: <span className="font-semibold">{c.corrected_score}</span>
                            </p>
                            {c.reason && <p className="text-xs mt-1">사유: {c.reason}</p>}
                          </div>

                          {/* Learning message */}
                          <div className="rounded bg-primary/5 border border-primary/10 p-3">
                            <p className="text-[11px] font-medium text-muted-foreground mb-1.5">[AI에게 전달되는 학습 메시지]</p>
                            <p className="text-xs italic leading-relaxed">"{learningMsg}"</p>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ))
            )}
          </TabsContent>

          {/* ─── Tab 4: Performance Comparison ─── */}
          <TabsContent value="performance" className="mt-4 space-y-4">
            {/* Chart */}
            {chartData.length > 0 ? (
              <>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 10 }}
                        angle={-45}
                        textAnchor="end"
                        height={80}
                      />
                      <YAxis tick={{ fontSize: 11 }} label={{ value: '평균 오차', angle: -90, position: 'insideLeft', style: { fontSize: 11 } }} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12 }}
                        labelFormatter={(label) => {
                          const item = chartData.find(d => d.name === label);
                          return item?.fullName || label;
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Bar
                        dataKey="이전"
                        fill="hsl(var(--muted-foreground) / 0.3)"
                        radius={[3, 3, 0, 0]}
                        name={prevVersion?.version || '이전 버전'}
                      />
                      <Bar
                        dataKey="현재"
                        fill="hsl(142 71% 45%)"
                        radius={[3, 3, 0, 0]}
                        name={version.version}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Card>
                    <CardContent className="pt-4 pb-3 text-center">
                      <p className="text-xs text-muted-foreground mb-1">전체 평균 오차</p>
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg text-muted-foreground">{overallStats.prevAvg.toFixed(1)}</span>
                        <ArrowRight size={14} className="text-muted-foreground" />
                        <span className="text-lg font-bold">{overallStats.currAvg.toFixed(1)}</span>
                      </div>
                      {overallStats.improvement !== 0 && (
                        <Badge
                          variant={overallStats.improvement > 0 ? 'default' : 'destructive'}
                          className="text-[10px] mt-1"
                        >
                          {overallStats.improvement > 0 ? (
                            <><TrendingDown size={10} className="mr-0.5" />{overallStats.improvement.toFixed(0)}% 개선</>
                          ) : (
                            <><TrendingUp size={10} className="mr-0.5" />{Math.abs(overallStats.improvement).toFixed(0)}% 증가</>
                          )}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>

                  {overallStats.best && (
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">가장 많이 개선된 항목</p>
                        <p className="text-sm font-semibold">{overallStats.best.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          오차 {overallStats.best.prev} → {overallStats.best.curr}
                        </p>
                      </CardContent>
                    </Card>
                  )}

                  {overallStats.worst && (
                    <Card>
                      <CardContent className="pt-4 pb-3 text-center">
                        <p className="text-xs text-muted-foreground mb-1">개선이 필요한 항목</p>
                        <p className="text-sm font-semibold">{overallStats.worst.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          오차 {overallStats.worst.prev} → {overallStats.worst.curr}
                        </p>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">
                성능 비교를 위한 데이터가 부족합니다.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

/* Helper */
const InfoItem = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="rounded-lg border p-3">
    <p className="text-[11px] text-muted-foreground mb-0.5">{label}</p>
    <div className="text-sm font-medium">{value}</div>
  </div>
);

export default ModelVersionDetailDialog;
