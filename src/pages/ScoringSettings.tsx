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
    { name: '품질', weight: 2, maxScore: 10, desc: '제품 품질 및 마감 수준' },
    { name: '가격 경쟁력', weight: 1.5, maxScore: 10, desc: '가격 대비 가치' },
    { name: '납기 신뢰도', weight: 1.5, maxScore: 10, desc: '약속된 납기 준수 여부' },
    { name: '커뮤니케이션', weight: 1, maxScore: 10, desc: '의사소통 속도 및 정확성' },
    { name: 'MOQ 유연성', weight: 1, maxScore: 10, desc: '최소주문량 협상 가능 여부' },
    { name: '인증/컴플라이언스', weight: 1, maxScore: 10, desc: 'ISO, BSCI 등 인증 보유' },
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
