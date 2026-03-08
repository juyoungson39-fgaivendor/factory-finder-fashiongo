import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, GripVertical, Sparkles, ChevronUp, ChevronDown, LayoutGrid, List, Shield, AlertTriangle, Info, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const getWeightTier = (weight: number | null) => {
  const w = weight ?? 1;
  if (w >= 2) return { label: '핵심', tier: 'critical' as const };
  if (w >= 1.5) return { label: '중요', tier: 'important' as const };
  if (w >= 1) return { label: '보통', tier: 'normal' as const };
  return { label: '참고', tier: 'minor' as const };
};

const tierConfig = {
  critical: {
    label: '핵심 (Critical)',
    desc: '가중치 2.0 이상 — 총점에 가장 큰 영향',
    icon: Shield,
    border: 'border-l-4 border-l-[hsl(var(--score-excellent))]',
    badge: 'bg-[hsl(var(--score-excellent))]/10 text-[hsl(var(--score-excellent))]',
    bar: 'bg-[hsl(var(--score-excellent))]',
    headerBg: 'bg-[hsl(var(--score-excellent))]/5',
    headerText: 'text-[hsl(var(--score-excellent))]',
    ring: 'ring-[hsl(var(--score-excellent))]/20',
  },
  important: {
    label: '중요 (Important)',
    desc: '가중치 1.5~1.9 — 평가에 핵심적인 역할',
    icon: AlertTriangle,
    border: 'border-l-4 border-l-[hsl(var(--info))]',
    badge: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]',
    bar: 'bg-[hsl(var(--info))]',
    headerBg: 'bg-[hsl(var(--info))]/5',
    headerText: 'text-[hsl(var(--info))]',
    ring: 'ring-[hsl(var(--info))]/20',
  },
  normal: {
    label: '보통 (Normal)',
    desc: '가중치 1.0~1.4 — 기본 평가 항목',
    icon: Info,
    border: 'border-l-4 border-l-[hsl(var(--muted-foreground))]/30',
    badge: 'bg-secondary text-muted-foreground',
    bar: 'bg-muted-foreground/40',
    headerBg: 'bg-secondary/50',
    headerText: 'text-muted-foreground',
    ring: 'ring-border',
  },
  minor: {
    label: '참고 (Minor)',
    desc: '가중치 1.0 미만 — 보조적 참고 사항',
    icon: Minus,
    border: 'border-l-4 border-l-border',
    badge: 'bg-secondary text-muted-foreground/60',
    bar: 'bg-muted-foreground/20',
    headerBg: 'bg-secondary/30',
    headerText: 'text-muted-foreground/60',
    ring: 'ring-border/50',
  },
};

type Tier = keyof typeof tierConfig;

type CriteriaItem = {
  id: string;
  name: string;
  weight: number | null;
  max_score: number | null;
  description: string | null;
  sort_order: number | null;
  user_id: string;
  created_at: string;
};

const SortableCriteriaItem = ({
  c, idx, maxWeight, onDelete, compact,
}: {
  c: CriteriaItem; idx: number; maxWeight: number; onDelete: (id: string) => void; compact?: boolean;
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: c.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, position: 'relative' as const };

  const { tier: t } = getWeightTier(c.weight);
  const ts = tierConfig[t];
  const weightPct = maxWeight > 0 ? ((c.weight ?? 1) / maxWeight) * 100 : 0;

  return (
    <div ref={setNodeRef} style={style}>
      <Card className={`${compact ? '' : ts.border} ${isDragging ? 'shadow-lg ring-2 ring-primary/20 opacity-90' : 'hover:shadow-sm'} transition-shadow`}>
        <CardContent className="flex items-center gap-3 py-3 px-4 group">
          <button {...attributes} {...listeners} className="touch-none shrink-0 cursor-grab active:cursor-grabbing p-0.5 -m-0.5 rounded hover:bg-secondary transition-colors">
            <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
          </button>

          {!compact && <span className="text-[11px] text-muted-foreground/40 font-mono w-5 text-center shrink-0">{idx + 1}</span>}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className={`text-sm truncate ${t === 'critical' ? 'font-bold' : 'font-medium'}`}>{c.name}</p>
              {!compact && (
                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0 ${ts.badge}`}>
                  {getWeightTier(c.weight).label}
                </span>
              )}
            </div>
            {c.description && (
              <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-1">{c.description}</p>
            )}
          </div>

          <div className="w-24 shrink-0 hidden sm:block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-muted-foreground">가중치</span>
              <span className={`text-xs font-bold tabular-nums ${t === 'critical' ? 'text-[hsl(var(--score-excellent))]' : ''}`}>×{c.weight}</span>
            </div>
            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${ts.bar}`} style={{ width: `${weightPct}%` }} />
            </div>
          </div>

          <div className="text-center shrink-0 w-12">
            <span className="text-[10px] text-muted-foreground block">만점</span>
            <span className="text-xs font-bold tabular-nums">{c.max_score}</span>
          </div>

          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
            onClick={() => onDelete(c.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

const ScoringSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grouped'>('grouped');
  const [collapsedTiers, setCollapsedTiers] = useState<Set<Tier>>(new Set());
  const [newName, setNewName] = useState('');
  const [newWeight, setNewWeight] = useState('1');
  const [newMaxScore, setNewMaxScore] = useState('10');
  const [newDescription, setNewDescription] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      const hasCustomOrder = data.some((c: any) => c.sort_order !== null && c.sort_order !== 0);
      if (!hasCustomOrder) {
        return [...data].sort((a: any, b: any) => (b.weight ?? 1) - (a.weight ?? 1));
      }
      return data;
    },
    enabled: !!user,
  });

  const reorderMutation = useMutation({
    mutationFn: async (reordered: CriteriaItem[]) => {
      const updates = reordered.map((c, i) =>
        supabase.from('scoring_criteria').update({ sort_order: i }).eq('id', c.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['scoring-criteria'] }); },
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = criteria.findIndex((c) => c.id === active.id);
    const newIndex = criteria.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(criteria, oldIndex, newIndex);
    queryClient.setQueryData(['scoring-criteria', user?.id], reordered);
    reorderMutation.mutate(reordered);
    toast({ title: '순서가 변경되었습니다' });
  };

  const totalWeight = criteria.reduce((sum, c) => sum + (c.weight ?? 1), 0);
  const maxWeight = Math.max(...criteria.map((c) => c.weight ?? 1), 1);

  const grouped: Record<Tier, CriteriaItem[]> = {
    critical: criteria.filter((c) => getWeightTier(c.weight).tier === 'critical'),
    important: criteria.filter((c) => getWeightTier(c.weight).tier === 'important'),
    normal: criteria.filter((c) => getWeightTier(c.weight).tier === 'normal'),
    minor: criteria.filter((c) => getWeightTier(c.weight).tier === 'minor'),
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Scoring Criteria</h1>
          <p className="text-sm text-muted-foreground">AI가 공장을 평가할 때 사용하는 기준과 가중치를 관리합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-secondary rounded-md p-0.5">
            <button
              onClick={() => setViewMode('grouped')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'grouped' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="분류별 보기"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              title="리스트 보기"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
          <Button size="sm" className="h-9 text-xs uppercase tracking-wider font-medium" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? <ChevronUp className="w-3.5 h-3.5 mr-1.5" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            {showAddForm ? 'Close' : 'Add Criteria'}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {criteria.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {(['critical', 'important', 'normal', 'minor'] as const).map((tier) => {
            const cfg = tierConfig[tier];
            const Icon = cfg.icon;
            const items = grouped[tier];
            const tierWeight = items.reduce((s, c) => s + (c.weight ?? 1), 0);
            const pct = totalWeight > 0 ? (tierWeight / totalWeight * 100).toFixed(0) : '0';
            return (
              <Card key={tier} className={`${cfg.border} overflow-hidden`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center ${cfg.headerBg}`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.headerText}`} />
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{getWeightTier(tier === 'critical' ? 2.5 : tier === 'important' ? 1.5 : tier === 'normal' ? 1 : 0.5).label}</p>
                    </div>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <span className="text-2xl font-bold tabular-nums">{items.length}</span>
                      <span className="text-xs text-muted-foreground ml-1">개</span>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium tabular-nums">{pct}%</p>
                      <p className="text-[10px] text-muted-foreground">비중</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
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
                  <Button size="sm" variant="ghost" className="h-9 text-xs" onClick={() => setShowAddForm(false)}>취소</Button>
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
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />추천 기준 한번에 추가
            </Button>
          </CardContent>
        </Card>
      )}

      {/* GROUPED VIEW */}
      {criteria.length > 0 && viewMode === 'grouped' && (
        <div className="space-y-6">
          {(['critical', 'important', 'normal', 'minor'] as const).map((tier) => {
            const items = grouped[tier];
            if (items.length === 0) return null;
            const cfg = tierConfig[tier];
            const Icon = cfg.icon;
            return (
              <motion.div key={tier} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: tier === 'critical' ? 0 : tier === 'important' ? 0.05 : tier === 'normal' ? 0.1 : 0.15 }}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className={`w-6 h-6 rounded flex items-center justify-center ${cfg.headerBg}`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.headerText}`} />
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{cfg.label}</h3>
                  <span className="text-[10px] text-muted-foreground/60 ml-1">{cfg.desc}</span>
                  <span className={`ml-auto inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${cfg.badge}`}>{items.length}</span>
                </div>
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1.5">
                      {items.map((c, idx) => (
                        <SortableCriteriaItem
                          key={c.id} c={c} idx={idx} maxWeight={maxWeight} compact
                          onDelete={(id) => deleteCriteria.mutate(id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* LIST VIEW */}
      {criteria.length > 0 && viewMode === 'list' && (
        <>
          <div className="flex items-center gap-6 mb-3 px-1">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>총 <span className="font-semibold text-foreground">{criteria.length}</span>개 기준</span>
              <span className="w-px h-3 bg-border" />
              <span>총 가중치 <span className="font-semibold text-foreground">{totalWeight.toFixed(1)}</span></span>
            </div>
          </div>
          {criteria.length > 1 && (
            <p className="text-[11px] text-muted-foreground/60 mb-3 px-1 flex items-center gap-1.5">
              <GripVertical className="w-3 h-3" />드래그하여 순서를 변경하세요
            </p>
          )}
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={criteria.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {criteria.map((c, idx) => (
                  <SortableCriteriaItem key={c.id} c={c} idx={idx} maxWeight={maxWeight} onDelete={(id) => deleteCriteria.mutate(id)} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
};

export default ScoringSettings;
