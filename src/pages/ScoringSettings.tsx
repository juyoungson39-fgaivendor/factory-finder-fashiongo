import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, GripVertical, Star, Sparkles, ChevronDown, ChevronUp, Weight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getWeightTier = (weight: number | null) => {
  const w = weight ?? 1;
  if (w >= 2) return { label: '핵심', tier: 'critical' as const };
  if (w >= 1.5) return { label: '중요', tier: 'important' as const };
  if (w >= 1) return { label: '보통', tier: 'normal' as const };
  return { label: '참고', tier: 'minor' as const };
};

const tierStyles = {
  critical: {
    border: 'border-l-4 border-l-[hsl(var(--score-excellent))]',
    badge: 'bg-[hsl(var(--score-excellent))]/10 text-[hsl(var(--score-excellent))]',
    bar: 'bg-[hsl(var(--score-excellent))]',
  },
  important: {
    border: 'border-l-4 border-l-[hsl(var(--info))]',
    badge: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
    bar: 'bg-[hsl(var(--info))]',
  },
  normal: {
    border: 'border-l-4 border-l-[hsl(var(--muted-foreground))]/30',
    badge: 'bg-secondary text-muted-foreground',
    bar: 'bg-muted-foreground/40',
  },
  minor: {
    border: 'border-l-4 border-l-border',
    badge: 'bg-secondary text-muted-foreground/60',
    bar: 'bg-muted-foreground/20',
  },
};

const ScoringSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWeight, setNewWeight] = useState('1');
  const [newMaxScore, setNewMaxScore] = useState('10');
  const [newDescription, setNewDescription] = useState('');

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addCriteria = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('scoring_criteria').insert({
        user_id: user!.id, name: newName, weight: parseFloat(newWeight),
        max_score: parseInt(newMaxScore), description: newDescription || null, sort_order: criteria.length,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoring-criteria'] });
      setNewName(''); setNewWeight('1'); setNewMaxScore('10'); setNewDescription('');
      setShowAddForm(false);
      toast({ title: '기준 추가 완료' });
    },
  });

  const deleteCriteria = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('scoring_criteria').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scoring-criteria'] });
      toast({ title: '기준 삭제 완료' });
    },
  });

  const defaultCriteria = [
    { name: '재고 보유 여부', weight: 2.5, maxScore: 10, desc: 'Ready-to-ship 재고 보유 수준. 즉시 출하 가능한 SKU 비율' },
    { name: '북미 타겟 상품력', weight: 2.5, maxScore: 10, desc: '북미 트렌드/사이즈/스타일 적합성. US 시장 맞춤 디자인 역량' },
    { name: '상품 이미지 품질', weight: 2, maxScore: 10, desc: 'FashionGo 기준 이미지 보유 여부. 화이트 배경, 모델컷, 디테일컷 등 Grade A~C' },
    { name: '타 플랫폼 운영 경험', weight: 1.5, maxScore: 10, desc: 'FashionGo, Faire, Amazon, 자체몰 등 B2B/B2C 플랫폼 운영 이력' },
    { name: '자체 발송 능력', weight: 2, maxScore: 10, desc: '미국 내 웨어하우스 보유 또는 3PL 연동. 직접 패킹/배송 가능 여부' },
    { name: '가격 경쟁력', weight: 1.5, maxScore: 10, desc: 'Wholesale 마진율 기준 가격 적정성. 볼륨 디스카운트 유연성' },
    { name: 'MOQ 유연성', weight: 1.5, maxScore: 10, desc: '소량 주문 대응력. 색상/사이즈별 최소 수량 유연성' },
    { name: '납기 신뢰도', weight: 1.5, maxScore: 10, desc: '리드타임 준수율. 생산→출하까지 약속된 일정 이행 능력' },
    { name: '커뮤니케이션', weight: 1, maxScore: 10, desc: '영어 소통 능력, 응답 속도, 문제 해결 적극성' },
    { name: '상품 다양성', weight: 1, maxScore: 10, desc: '카테고리 폭 및 신상품 출시 빈도. 시즌별 라인업 보유' },
    { name: '반품/교환 정책', weight: 1, maxScore: 10, desc: '불량품 처리 유연성. 반품/교환 절차 및 비용 부담 정책' },
    { name: '인증/컴플라이언스', weight: 1, maxScore: 10, desc: 'CPSIA, CA Prop 65, 라벨링 등 미국 수입규정 준수 여부' },
    { name: '패키징/브랜딩', weight: 0.5, maxScore: 10, desc: 'OEM/ODM 가능 여부. 행택, 패키징 커스텀 대응력' },
    { name: '결제 조건', weight: 0.5, maxScore: 10, desc: 'Net 30/60 등 결제 유연성. 신규 거래 시 조건 협상 가능 여부' },
  ];

  const addDefaults = async () => {
    if (!user) return;
    for (let i = 0; i < defaultCriteria.length; i++) {
      const c = defaultCriteria[i];
      await supabase.from('scoring_criteria').insert({
        user_id: user.id, name: c.name, weight: c.weight, max_score: c.maxScore, description: c.desc, sort_order: i,
      });
    }
    queryClient.invalidateQueries({ queryKey: ['scoring-criteria'] });
    toast({ title: '기본 기준 추가 완료' });
  };

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const maxWeight = Math.max(...criteria.map((c) => c.weight ?? 1), 1);

  // Group by tier
  const grouped = {
    critical: criteria.filter((c) => getWeightTier(c.weight).tier === 'critical'),
    important: criteria.filter((c) => getWeightTier(c.weight).tier === 'important'),
    normal: criteria.filter((c) => getWeightTier(c.weight).tier === 'normal'),
    minor: criteria.filter((c) => getWeightTier(c.weight).tier === 'minor'),
  };

  const groupLabels = {
    critical: { title: '핵심 항목', subtitle: '가중치 2.0 이상', icon: Star },
    important: { title: '중요 항목', subtitle: '가중치 1.5 이상', icon: Weight },
    normal: { title: '일반 항목', subtitle: '가중치 1.0', icon: null },
    minor: { title: '참고 항목', subtitle: '가중치 1.0 미만', icon: null },
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Scoring Criteria</h1>
          <p className="text-sm text-muted-foreground">AI가 공장을 평가할 때 사용하는 기준과 가중치를 관리합니다</p>
        </div>
        <Button
          size="sm"
          className="h-9 text-xs uppercase tracking-wider font-medium"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? <ChevronUp className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
          {showAddForm ? 'Close' : 'Add Criteria'}
        </Button>
      </div>

      {/* Add Form (collapsible) */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-6"
          >
            <Card className="border-2 border-dashed border-primary/20">
              <CardContent className="pt-5 pb-5">
                <div className="grid grid-cols-[1fr_1fr] gap-x-4 gap-y-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">기준 이름 *</Label>
                    <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 샘플 품질" className="h-10" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">가중치</Label>
                    <Input type="number" step="0.5" min="0.5" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} className="h-10" />
                    <p className="text-[10px] text-muted-foreground">높을수록 총점에 더 큰 영향</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">최대 점수</Label>
                    <Input type="number" min="1" value={newMaxScore} onChange={(e) => setNewMaxScore(e.target.value)} className="h-10" />
                  </div>
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs font-medium">설명 (AI 평가 시 참고)</Label>
                    <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} placeholder="이 기준에 대해 AI가 어떤 점을 평가해야 하는지 설명하세요..." />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" className="h-9 text-xs uppercase tracking-wider" onClick={() => addCriteria.mutate()} disabled={!newName.trim()}>
                    <Plus className="w-3 h-3 mr-1.5" />추가
                  </Button>
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowAddForm(false)}>
                    취소
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty State */}
      {criteria.length === 0 && (
        <Card className="border-dashed mb-6">
          <CardContent className="flex flex-col items-center py-16">
            <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-muted-foreground/50" />
            </div>
            <p className="font-medium text-foreground mb-1">아직 평가 기준이 없습니다</p>
            <p className="text-sm text-muted-foreground mb-6">FashionGo 벤더 평가에 최적화된 14개 기준을 추가할 수 있습니다</p>
            <Button variant="outline" size="sm" className="text-xs uppercase tracking-wider" onClick={addDefaults}>
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              추천 기준 한번에 추가
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Summary bar */}
      {criteria.length > 0 && (
        <div className="flex items-center gap-6 mb-6 px-1">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>총 <span className="font-semibold text-foreground">{criteria.length}</span>개 기준</span>
            <span className="w-px h-3 bg-border" />
            <span>총 가중치 <span className="font-semibold text-foreground">{totalWeight.toFixed(1)}</span></span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {(['critical', 'important', 'normal', 'minor'] as const).map((tier) => {
              const count = grouped[tier].length;
              if (count === 0) return null;
              return (
                <span key={tier} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${tierStyles[tier].badge}`}>
                  {getWeightTier(tier === 'critical' ? 2.5 : tier === 'important' ? 1.5 : tier === 'normal' ? 1 : 0.5).label} {count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Grouped criteria list */}
      {criteria.length > 0 && (
        <div className="space-y-8">
          {(['critical', 'important', 'normal', 'minor'] as const).map((tier) => {
            const items = grouped[tier];
            if (items.length === 0) return null;
            const group = groupLabels[tier];
            const Icon = group.icon;
            return (
              <div key={tier}>
                <div className="flex items-center gap-2 mb-3 px-1">
                  {Icon && <Icon className={`w-3.5 h-3.5 ${tier === 'critical' ? 'text-[hsl(var(--score-excellent))]' : 'text-[hsl(var(--info))]'}`} />}
                  <span className="text-xs font-semibold uppercase tracking-widest">{group.title}</span>
                  <span className="text-[10px] text-muted-foreground">{group.subtitle}</span>
                </div>
                <div className="space-y-2">
                  {items.map((c, idx) => {
                    const { tier: t } = getWeightTier(c.weight);
                    const style = tierStyles[t];
                    const weightPct = maxWeight > 0 ? ((c.weight ?? 1) / maxWeight) * 100 : 0;

                    return (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.03 }}
                      >
                        <Card className={`${style.border} hover:shadow-sm transition-shadow`}>
                          <CardContent className="flex items-center gap-4 py-3.5 px-4">
                            <GripVertical className="w-4 h-4 text-muted-foreground/20 shrink-0 cursor-grab" />

                            {/* Order number */}
                            <span className="text-[11px] text-muted-foreground/40 font-mono w-5 text-center shrink-0">{c.sort_order !== null ? c.sort_order + 1 : idx + 1}</span>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <p className={`text-sm truncate ${t === 'critical' ? 'font-bold' : 'font-medium'}`}>
                                  {c.name}
                                </p>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0 ${style.badge}`}>
                                  {getWeightTier(c.weight).label}
                                </span>
                              </div>
                              {c.description && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1">{c.description}</p>
                              )}
                            </div>

                            {/* Weight visual bar */}
                            <div className="w-24 shrink-0 hidden sm:block">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] text-muted-foreground">가중치</span>
                                <span className={`text-xs font-bold tabular-nums ${t === 'critical' ? 'text-[hsl(var(--score-excellent))]' : ''}`}>
                                  ×{c.weight}
                                </span>
                              </div>
                              <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${style.bar}`} style={{ width: `${weightPct}%` }} />
                              </div>
                            </div>

                            {/* Max score */}
                            <div className="text-center shrink-0 w-12">
                              <span className="text-[10px] text-muted-foreground block">만점</span>
                              <span className="text-xs font-bold tabular-nums">{c.max_score}</span>
                            </div>

                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                              onClick={() => deleteCriteria.mutate(c.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ScoringSettings;
