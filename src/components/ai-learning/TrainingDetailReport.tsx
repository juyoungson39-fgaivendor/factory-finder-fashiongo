import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import {
  ClipboardList, Users, Building2, ListChecks, Search, Download,
  TrendingDown, TrendingUp, BarChart3, CheckCircle, Trash2, Edit3,
} from 'lucide-react';

interface TrainingSnapshot {
  correction_ids: string[];
  confirmed_factory_ids: string[];
  deleted_factory_ids: string[];
}

interface Props {
  activeModel?: { version?: string } | null;
  trainingJobs?: any[];
}

const TrainingDetailReport = ({ activeModel, trainingJobs = [] }: Props) => {
  const [searchFactory, setSearchFactory] = useState('');
  const [filterCriteria, setFilterCriteria] = useState('all');
  const [filterCorrector, setFilterCorrector] = useState('all');

  // Find the training job for the active model version
  const activeJob = useMemo(() => {
    if (!activeModel?.version || !trainingJobs.length) return null;
    // Match by version suffix in vertex_job_name
    const versionSuffix = activeModel.version.split('-').pop();
    const succeeded = trainingJobs.filter((j: any) => j.status === 'SUCCEEDED');
    // Try matching by vertex_job_name suffix
    const matched = succeeded.find((j: any) => j.vertex_job_name?.endsWith(versionSuffix));
    // Fallback: latest succeeded job
    return matched || succeeded[0] || null;
  }, [activeModel?.version, trainingJobs]);

  const snapshot = useMemo<TrainingSnapshot | null>(() => {
    if (!activeJob?.training_snapshot) return null;
    const s = activeJob.training_snapshot as any;
    return {
      correction_ids: s.correction_ids || [],
      confirmed_factory_ids: s.confirmed_factory_ids || [],
      deleted_factory_ids: s.deleted_factory_ids || [],
    };
  }, [activeJob]);

  // --- Data queries ---

  // 1. Corrections (from snapshot IDs or fallback to used_in_version)
  const { data: corrections = [] } = useQuery({
    queryKey: ['training-report-corrections', activeModel?.version, snapshot?.correction_ids],
    queryFn: async () => {
      if (snapshot?.correction_ids?.length) {
        const { data } = await supabase
          .from('scoring_corrections')
          .select('*')
          .in('id', snapshot.correction_ids)
          .order('collected_at', { ascending: false });
        return data || [];
      }
      // Fallback: old approach
      let query = supabase
        .from('scoring_corrections')
        .select('*')
        .eq('is_valid', true)
        .order('collected_at', { ascending: false });
      if (activeModel?.version) {
        query = query.eq('used_in_version', activeModel.version);
      }
      const { data } = await query;
      return data || [];
    },
  });

  // 2. Confirmed factories (from snapshot)
  const { data: confirmedFactories = [] } = useQuery({
    queryKey: ['training-report-confirmed', snapshot?.confirmed_factory_ids],
    queryFn: async () => {
      if (!snapshot?.confirmed_factory_ids?.length) return [];
      const { data } = await supabase
        .from('factories')
        .select('id, name, country, city, main_products, overall_score, score_confirmed, created_at')
        .in('id', snapshot.confirmed_factory_ids);
      return data || [];
    },
    enabled: !!snapshot?.confirmed_factory_ids?.length,
  });

  // 3. Deleted factories (from snapshot)
  const { data: deletedFactories = [] } = useQuery({
    queryKey: ['training-report-deleted', snapshot?.deleted_factory_ids],
    queryFn: async () => {
      if (!snapshot?.deleted_factory_ids?.length) return [];
      const { data } = await supabase
        .from('factories')
        .select('id, name, country, city, main_products, overall_score, deleted_at, deleted_reason')
        .in('id', snapshot.deleted_factory_ids);
      return data || [];
    },
    enabled: !!snapshot?.deleted_factory_ids?.length,
  });

  // Factory names for corrections
  const vendorIds = useMemo(() => [...new Set(corrections.map((c: any) => c.vendor_id))], [corrections]);
  const { data: corrFactories = [] } = useQuery({
    queryKey: ['training-report-factories', vendorIds],
    queryFn: async () => {
      if (!vendorIds.length) return [];
      const { data } = await supabase.from('factories').select('id, name').in('id', vendorIds);
      return data || [];
    },
    enabled: vendorIds.length > 0,
  });

  // Corrector profiles
  const correctorIds = useMemo(() => [...new Set(corrections.map((c: any) => c.collected_by))], [corrections]);
  const { data: profiles = [] } = useQuery({
    queryKey: ['training-report-profiles', correctorIds],
    queryFn: async () => {
      if (!correctorIds.length) return [];
      const { data } = await supabase.from('profiles').select('user_id, display_name').in('user_id', correctorIds);
      return data || [];
    },
    enabled: correctorIds.length > 0,
  });

  const factoryMap = useMemo(() => Object.fromEntries(corrFactories.map((f: any) => [f.id, f.name])), [corrFactories]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p: any) => [p.user_id, p.display_name || p.user_id.slice(0, 6)])), [profiles]);

  // Summary
  const totalCount = corrections.length + confirmedFactories.length + deletedFactories.length;
  const uniqueCorrectors = useMemo(() => [...new Set(corrections.map((c: any) => c.collected_by))], [corrections]);
  const allCriteriaKeys = useMemo(() => [...new Set(corrections.map((c: any) => c.criteria_key))].sort(), [corrections]);

  // Filtered corrections
  const filtered = useMemo(() => {
    return corrections.filter((c: any) => {
      const fname = factoryMap[c.vendor_id] || '';
      if (searchFactory && !fname.toLowerCase().includes(searchFactory.toLowerCase())) return false;
      if (filterCriteria !== 'all' && c.criteria_key !== filterCriteria) return false;
      if (filterCorrector !== 'all' && c.collected_by !== filterCorrector) return false;
      return true;
    });
  }, [corrections, searchFactory, filterCriteria, filterCorrector, factoryMap]);

  // Pattern analysis
  const patterns = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const c of corrections) {
      const key = (c as any).criteria_key;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(c);
    }

    return Object.entries(grouped).map(([key, items]) => {
      const diffs = items.map((i: any) => (i.diff ?? (i.corrected_score - i.ai_score)));
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const absAvg = Math.abs(avgDiff);

      let representative: any = null;
      let maxAbsDiff = 0;
      for (const item of items) {
        const d = Math.abs(item.diff ?? (item.corrected_score - item.ai_score));
        if (d > maxAbsDiff) { maxAbsDiff = d; representative = item; }
      }

      const status = absAvg >= 2.0 ? '개선 필요' : absAvg >= 1.0 ? '관찰 중' : '양호';
      const statusColor = status === '개선 필요' ? 'destructive' : status === '관찰 중' ? 'secondary' : 'default';
      const statusEmoji = status === '개선 필요' ? '🔴' : status === '관찰 중' ? '🟡' : '🟢';

      let beforeTrend: string;
      let afterTrend: string;
      if (avgDiff < -0.3) {
        beforeTrend = `AI가 평균 ${absAvg.toFixed(1)}점 높게 평가하는 경향이 있었습니다. ${items.length}건의 교정에서 일관되게 하향 교정되었습니다.`;
        afterTrend = `${key}을(를) 더 보수적으로 평가하도록 학습되었습니다. 기존보다 약 ${absAvg.toFixed(1)}점 낮게 평가할 것으로 예상됩니다.`;
      } else if (avgDiff > 0.3) {
        beforeTrend = `AI가 평균 ${absAvg.toFixed(1)}점 낮게 평가하는 경향이 있었습니다. ${items.length}건의 교정에서 일관되게 상향 교정되었습니다.`;
        afterTrend = `${key}을(를) 더 적극적으로 평가하도록 학습되었습니다. 기존보다 약 ${absAvg.toFixed(1)}점 높게 평가할 것으로 예상됩니다.`;
      } else {
        beforeTrend = `평균 차이 ${avgDiff.toFixed(1)}으로 AI 평가가 대체로 정확했습니다. ${items.length}건의 교정에서 상향/하향이 균등하게 분포되었습니다.`;
        afterTrend = `큰 변화 없이 현재 평가 기준이 유지될 예정입니다.`;
      }

      return { key, count: items.length, avgDiff: avgDiff.toFixed(1), status, statusColor, statusEmoji, beforeTrend, afterTrend, representative };
    }).sort((a, b) => Math.abs(Number(b.avgDiff)) - Math.abs(Number(a.avgDiff)));
  }, [corrections]);

  // CSV export
  const handleExportCSV = () => {
    const headers = ['번호', '유형', '공장명', '평가 항목', 'AI 원본', '교정값', '차이', '교정 사유', '교정자', '일시'];
    const corrRows = filtered.map((c: any, i: number) => [
      i + 1, '교정', factoryMap[c.vendor_id] || c.vendor_id, c.criteria_key,
      c.ai_score, c.corrected_score, c.diff ?? (c.corrected_score - c.ai_score),
      `"${(c.reason || '').replace(/"/g, '""')}"`,
      profileMap[c.collected_by] || c.collected_by,
      new Date(c.collected_at).toLocaleString('ko-KR'),
    ]);
    const confRows = confirmedFactories.map((f: any, i: number) => [
      filtered.length + i + 1, '정답', f.name || f.id, '-',
      '-', f.overall_score || '-', '-', '"정답 확인됨"', '-', '-',
    ]);
    const delRows = deletedFactories.map((f: any, i: number) => [
      filtered.length + confirmedFactories.length + i + 1, '삭제',
      f.name || f.id, '-', '-', '0', '-',
      `"${(f.deleted_reason || '').replace(/"/g, '""')}"`, '-',
      f.deleted_at ? new Date(f.deleted_at).toLocaleString('ko-KR') : '-',
    ]);
    const allRows = [...corrRows, ...confRows, ...delRows];
    const csv = [headers.join(','), ...allRows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Empty state ---
  if (totalCount === 0 && !snapshot) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList size={18} className="text-primary" />
            학습 상세 리포트
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {activeModel?.version
              ? `모델 ${activeModel.version}에 사용된 학습 데이터가 없습니다.`
              : '아직 Fine-tuning이 실행되지 않았습니다.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Summary Cards ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList size={18} className="text-primary" />
            학습 상세 리포트
            {activeModel?.version && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                모델 {activeModel.version}
              </Badge>
            )}
            {!snapshot && (
              <Badge variant="secondary" className="ml-1 text-[10px]">
                snapshot 없음 (이전 버전)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <SummaryCard
              icon={<ClipboardList size={16} className="text-primary" />}
              label="총 학습 데이터"
              value={`${totalCount}건`}
            />
            <SummaryCard
              icon={<Edit3 size={16} className="text-amber-600" />}
              label="교정 데이터"
              value={`${corrections.length}건`}
            />
            <SummaryCard
              icon={<CheckCircle size={16} className="text-green-600" />}
              label="정답 공장"
              value={`${confirmedFactories.length}건`}
            />
            <SummaryCard
              icon={<Trash2 size={16} className="text-red-500" />}
              label="삭제 공장"
              value={`${deletedFactories.length}건`}
            />
            <SummaryCard
              icon={<Users size={16} className="text-primary" />}
              label="교정자"
              value={`${uniqueCorrectors.length}명`}
              sub={uniqueCorrectors.map(id => profileMap[id] || '').filter(Boolean).join(', ')}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Data Tabs ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-base">
              학습에 사용된 데이터
            </CardTitle>
            <Button variant="outline" size="sm" className="text-xs h-8" onClick={handleExportCSV}>
              <Download size={14} className="mr-1.5" />
              CSV 내보내기
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="corrections">
            <TabsList className="grid grid-cols-3 w-full md:w-auto md:inline-grid">
              <TabsTrigger value="corrections" className="text-xs gap-1.5">
                <Edit3 size={13} /> 교정 ({corrections.length})
              </TabsTrigger>
              <TabsTrigger value="confirmed" className="text-xs gap-1.5">
                <CheckCircle size={13} /> 정답 ({confirmedFactories.length})
              </TabsTrigger>
              <TabsTrigger value="deleted" className="text-xs gap-1.5">
                <Trash2 size={13} /> 삭제 ({deletedFactories.length})
              </TabsTrigger>
            </TabsList>

            {/* ── Corrections Tab ── */}
            <TabsContent value="corrections" className="mt-3 space-y-3">
              {corrections.length > 0 && (
                <div className="flex flex-col md:flex-row gap-2">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="공장명 검색..."
                      value={searchFactory}
                      onChange={e => setSearchFactory(e.target.value)}
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <Select value={filterCriteria} onValueChange={setFilterCriteria}>
                    <SelectTrigger className="w-full md:w-[180px] h-9 text-sm">
                      <SelectValue placeholder="평가 항목" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 항목</SelectItem>
                      {allCriteriaKeys.map(k => (
                        <SelectItem key={k} value={k}>{k}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterCorrector} onValueChange={setFilterCorrector}>
                    <SelectTrigger className="w-full md:w-[160px] h-9 text-sm">
                      <SelectValue placeholder="교정자" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체 교정자</SelectItem>
                      {uniqueCorrectors.map(id => (
                        <SelectItem key={id} value={id}>{profileMap[id] || id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead>공장명</TableHead>
                      <TableHead>평가 항목</TableHead>
                      <TableHead className="text-center">AI 원본</TableHead>
                      <TableHead className="text-center">교정값</TableHead>
                      <TableHead className="text-center">차이</TableHead>
                      <TableHead>교정 사유</TableHead>
                      <TableHead>교정자</TableHead>
                      <TableHead>일시</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                          {corrections.length === 0 ? '교정 데이터가 없습니다.' : '검색 결과가 없습니다.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((c: any, i: number) => {
                        const diff = c.diff ?? (c.corrected_score - c.ai_score);
                        return (
                          <TableRow key={c.id}>
                            <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="text-sm font-medium">{factoryMap[c.vendor_id] || c.vendor_id.slice(0, 8)}</TableCell>
                            <TableCell className="text-sm">{c.criteria_key}</TableCell>
                            <TableCell className="text-center text-sm">{c.ai_score}</TableCell>
                            <TableCell className="text-center text-sm font-medium">{c.corrected_score}</TableCell>
                            <TableCell className="text-center text-sm font-medium">
                              <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'}>
                                {diff > 0 ? `+${diff}` : diff}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="truncate block cursor-default">{c.reason || '-'}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-xs">
                                  <p className="text-xs">{c.reason}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{profileMap[c.collected_by] || c.collected_by.slice(0, 8)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {new Date(c.collected_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Confirmed Factories Tab ── */}
            <TabsContent value="confirmed" className="mt-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead>공장명</TableHead>
                      <TableHead>국가</TableHead>
                      <TableHead>주요 상품</TableHead>
                      <TableHead className="text-center">종합 점수</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {confirmedFactories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                          {snapshot ? '정답 공장 데이터가 없습니다.' : 'snapshot이 없는 이전 버전입니다. 정답 공장 이력을 확인할 수 없습니다.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      confirmedFactories.map((f: any, i: number) => (
                        <TableRow key={f.id}>
                          <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{f.name || f.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-sm">{f.country}{f.city ? `, ${f.city}` : ''}</TableCell>
                          <TableCell className="text-sm max-w-[200px]">
                            <span className="truncate block">{f.main_products || '-'}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="default" className="text-[10px]">{f.overall_score ?? '-'}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* ── Deleted Factories Tab ── */}
            <TabsContent value="deleted" className="mt-3">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px] text-center">#</TableHead>
                      <TableHead>공장명</TableHead>
                      <TableHead>국가</TableHead>
                      <TableHead>삭제 사유</TableHead>
                      <TableHead>삭제일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedFactories.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                          {snapshot ? '삭제 공장 데이터가 없습니다.' : 'snapshot이 없는 이전 버전입니다. 삭제 공장 이력을 확인할 수 없습니다.'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      deletedFactories.map((f: any, i: number) => (
                        <TableRow key={f.id}>
                          <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-sm font-medium">{f.name || f.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-sm">{f.country}{f.city ? `, ${f.city}` : ''}</TableCell>
                          <TableCell className="text-sm max-w-[250px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-default">{f.deleted_reason || '-'}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">{f.deleted_reason}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {f.deleted_at ? new Date(f.deleted_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }) : '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* ── AI Pattern Summary (corrections only) ── */}
      {corrections.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={18} className="text-primary" />
              AI가 학습한 패턴 요약
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {patterns.map(p => (
                <div
                  key={p.key}
                  className="rounded-lg border p-4 space-y-3"
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: p.status === '개선 필요' ? 'hsl(var(--destructive))' : p.status === '관찰 중' ? 'hsl(45 93% 47%)' : 'hsl(142 71% 45%)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{p.key}</span>
                    <Badge variant={p.statusColor as any} className="text-[10px]">
                      {p.status} {p.statusEmoji}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                      <TrendingDown size={13} />
                      학습 전 AI 경향
                    </div>
                    <p className="text-xs leading-relaxed">{p.beforeTrend}</p>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1">
                      <TrendingUp size={13} />
                      학습 후 예상 변화
                    </div>
                    <p className="text-xs leading-relaxed">{p.afterTrend}</p>
                  </div>
                  <div className="rounded bg-muted/50 p-2.5">
                    <p className="text-[11px] text-muted-foreground">
                      근거 데이터: 교정 {p.count}건 | 평균 차이: {Number(p.avgDiff) > 0 ? '+' : ''}{p.avgDiff}
                    </p>
                    {p.representative && (
                      <p className="text-[11px] text-muted-foreground mt-1">
                        대표 사례: {factoryMap[p.representative.vendor_id] || '공장'} (AI {p.representative.ai_score}→교정 {p.representative.corrected_score}, 사유: &quot;{p.representative.reason?.slice(0, 30)}{(p.representative.reason?.length ?? 0) > 30 ? '...' : ''}&quot;)
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {patterns.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-2 text-center py-4">
                  패턴 분석에 필요한 교정 데이터가 없습니다.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

/* ── Helper ── */
const SummaryCard = ({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) => (
  <div className="rounded-lg border p-3 space-y-1">
    <div className="flex items-center gap-1.5">
      {icon}
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
    <p className="text-lg font-semibold">{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
  </div>
);

export default TrainingDetailReport;
