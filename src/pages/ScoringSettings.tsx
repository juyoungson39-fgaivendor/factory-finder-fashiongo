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
import { Plus, Trash2, GripVertical } from 'lucide-react';

const ScoringSettings = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Scoring</h1>
      <p className="text-sm text-muted-foreground mb-8">공장 평가에 사용할 기준과 가중치를 설정하세요</p>

      {criteria.length === 0 && (
        <Card className="mb-6 border-dashed">
          <CardContent className="flex flex-col items-center py-10">
            <p className="text-sm text-muted-foreground mb-4">추천 기준을 한번에 추가할 수 있습니다</p>
            <Button variant="outline" size="sm" className="text-xs uppercase tracking-wider" onClick={addDefaults}>
              Add Default Criteria
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2 mb-8">
        {criteria.map((c) => (
          <Card key={c.id}>
            <CardContent className="flex items-center gap-4 py-3">
              <GripVertical className="w-4 h-4 text-muted-foreground/30" />
              <div className="flex-1">
                <p className="text-sm font-medium">{c.name}</p>
                {c.description && <p className="text-[11px] text-muted-foreground">{c.description}</p>}
              </div>
              <span className="text-xs text-muted-foreground">Weight: <span className="font-medium text-foreground">{c.weight}</span></span>
              <span className="text-xs text-muted-foreground">Max: <span className="font-medium text-foreground">{c.max_score}</span></span>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteCriteria.mutate(c.id)}>
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Add Criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">기준 이름</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="예: 품질" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">가중치</Label>
              <Input type="number" step="0.5" min="0.5" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">최대 점수</Label>
              <Input type="number" min="1" value={newMaxScore} onChange={(e) => setNewMaxScore(e.target.value)} className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">설명</Label>
              <Textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <Button size="sm" className="mt-4 h-9 text-xs uppercase tracking-wider" onClick={() => addCriteria.mutate()} disabled={!newName.trim()}>
            <Plus className="w-3 h-3 mr-1.5" />Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScoringSettings;
