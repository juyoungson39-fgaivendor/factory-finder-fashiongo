import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Navigate } from 'react-router-dom';
import TrainingDataStatus from '@/components/ai-learning/TrainingDataStatus';
import ActiveModelSection from '@/components/ai-learning/ActiveModelSection';
import CorrectionStatsSection from '@/components/ai-learning/CorrectionStatsSection';
import FineTuningSection from '@/components/ai-learning/FineTuningSection';
import RunningJobSection from '@/components/ai-learning/RunningJobSection';
import ModelHistorySection from '@/components/ai-learning/ModelHistorySection';
import TrainingDetailReport from '@/components/ai-learning/TrainingDetailReport';
import FewShotStatusSection from '@/components/ai-learning/FewShotStatusSection';

const AILearning = () => {
  const { isAdmin, isLoading: adminLoading } = useIsAdmin();
  const isDev = import.meta.env.DEV;
  const queryClient = useQueryClient();

  // 1. Training data stats — 실제 학습에 투입되는 데이터 기준
  const { data: trainingStats } = useQuery({
    queryKey: ['training-stats'],
    queryFn: async () => {
      const [confirmed, newCorrections, usedCorrections, deleted] = await Promise.all([
        supabase.from('factories').select('id', { count: 'exact', head: true }).eq('score_confirmed', true).is('deleted_at', null),
        supabase.from('scoring_corrections').select('id', { count: 'exact', head: true }).eq('is_valid', true).is('used_in_version', null),
        supabase.from('scoring_corrections').select('id', { count: 'exact', head: true }).eq('is_valid', true).not('used_in_version', 'is', null),
        supabase.from('factories').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
      ]);
      const confirmedCount = confirmed.count ?? 0;
      const newCorrectionCount = newCorrections.count ?? 0;
      const usedCorrectionCount = usedCorrections.count ?? 0;
      const deletedCount = deleted.count ?? 0;
      // 다음 학습에 투입될 총 데이터: 정답(매번) + 새 교정 + 부적합(매번)
      const total = confirmedCount + newCorrectionCount + deletedCount;
      return {
        confirmed: confirmedCount,
        modified: newCorrectionCount,
        modifiedUsed: usedCorrectionCount,
        deleted: deletedCount,
        total,
        remaining: Math.max(0, 1 - total), // TODO: 테스트 후 100으로 복구
      };
    },
    enabled: isAdmin || isDev,
  });

  // 2. Active model
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
    enabled: isAdmin || isDev,
  });

  // 3. Correction stats per criteria
  const { data: correctionStats = [] } = useQuery({
    queryKey: ['correction-stats'],
    queryFn: async () => {
      const { data } = await supabase
        .from('factory_scores')
        .select('criteria_id, score, ai_original_score, scoring_criteria!inner(name)')
        .not('ai_original_score', 'is', null);

      // Filter client-side: only rows where score differs from ai_original_score
      const filtered = (data || []).filter((row: any) => row.score !== row.ai_original_score);
      if (filtered.length === 0) return [];

      // Group by criteria_id
      const grouped: Record<string, { name: string; items: { score: number; ai: number }[] }> = {};
      for (const row of filtered as any[]) {
        const key = row.criteria_id;
        if (!grouped[key]) {
          grouped[key] = { name: row.scoring_criteria?.name || key, items: [] };
        }
        grouped[key].items.push({ score: row.score, ai: row.ai_original_score });
      }

      return Object.entries(grouped).map(([key, val]) => {
        const diffs = val.items.map(i => i.ai - i.score);
        const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
        return {
          key,
          criteriaName: val.name,
          count: val.items.length,
          avgDiff: avgDiff.toFixed(1),
          direction: avgDiff > 0 ? 'overrate' as const : avgDiff < 0 ? 'underrate' as const : 'neutral' as const,
          status: Math.abs(avgDiff) >= 2.0 ? '개선 필요' : Math.abs(avgDiff) >= 1.5 ? '관찰 중' : '양호',
        };
      }).sort((a, b) => b.count - a.count);
    },
    enabled: isAdmin || isDev,
  });

  // 4. Scoring corrections for fine-tuning counts
  const { data: corrections = [] } = useQuery({
    queryKey: ['scoring-corrections'],
    queryFn: async () => {
      const { data } = await supabase
        .from('scoring_corrections')
        .select('*')
        .order('collected_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin || isDev,
  });

  // 5. Training jobs
  const { data: trainingJobs = [] } = useQuery({
    queryKey: ['training-jobs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_training_jobs')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin || isDev,
  });

  // 5b. Running job — DB만 읽음 (상태 동기화는 Cloud Scheduler → poll-training-job Edge Function이 처리)
  const { data: runningJobData } = useQuery({
    queryKey: ['ai-running-job'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_training_jobs')
        .select('*')
        .in('status', ['PENDING', 'RUNNING', 'pending', 'running'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: isAdmin || isDev,
  });

  // 6. All model versions
  const { data: modelVersions = [] } = useQuery({
    queryKey: ['ai-model-versions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('ai_model_versions')
        .select('*')
        .order('created_at', { ascending: false });
      return data || [];
    },
    enabled: isAdmin || isDev,
  });

  // 7. Few-shot status
  const { data: fewShotCount = 0 } = useQuery({
    queryKey: ['few-shot-count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('factory_scores')
        .select('id', { count: 'exact', head: true })
        .not('correction_reason', 'is', null);
      return count ?? 0;
    },
    enabled: isAdmin || isDev,
  });

  if (adminLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">로딩 중...</div>;
  }

  if (!isAdmin && !isDev) {
    return <Navigate to="/" replace />;
  }

  const runningJob = runningJobData || trainingJobs.find((j: any) => ['PENDING', 'RUNNING', 'pending', 'running'].includes(j.status));

  const handleJobStarted = () => {
    queryClient.invalidateQueries({ queryKey: ['ai-running-job'] });
    queryClient.invalidateQueries({ queryKey: ['training-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['training-stats'] });
  };

  return (
    <div className="space-y-6">
      <TrainingDataStatus stats={trainingStats} />
      <ActiveModelSection activeModel={activeModel} newSinceTraining={
        corrections.filter((c: any) => !c.used_in_version || c.used_in_version !== activeModel?.version).length
      } />
      <CorrectionStatsSection stats={correctionStats} />
      <FineTuningSection
        trainingStats={trainingStats}
        runningJob={runningJob}
        onJobStarted={handleJobStarted}
        activeModel={activeModel}
      />
      <RunningJobSection job={runningJob} />
      <ModelHistorySection versions={modelVersions} />
      <FewShotStatusSection count={fewShotCount} />
    </div>
  );
};

export default AILearning;
