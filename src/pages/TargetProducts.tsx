import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Sparkles, Edit, Trash2, Archive, Power } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import TargetProductFormModal from '@/components/target/TargetProductFormModal';

type TargetProduct = {
  id: string;
  name: string;
  trend_keywords: string[] | null;
  category: string | null;
  style_tags: string[] | null;
  price_min_usd: number | null;
  price_max_usd: number | null;
  moq_max: number | null;
  reference_image_urls: string[] | null;
  source: string | null;
  status: string | null;
  valid_until: string | null;
  created_at: string | null;
};

export default function TargetProducts() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'active' | 'draft' | 'archived' | 'all'>('active');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<TargetProduct | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['target-products', statusFilter],
    queryFn: async () => {
      let q = supabase.from('target_products').select('*').order('created_at', { ascending: false });
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as TargetProduct[];
    },
  });

  const filtered = targets.filter(
    (t) =>
      !search.trim() ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.trend_keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase())),
  );

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('target_products').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['target-products'] });
      toast({ title: '✅ 상태 변경됨' });
    },
    onError: (e: Error) => toast({ title: '실패', description: e.message, variant: 'destructive' }),
  });

  const deleteTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('target_products').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['target-products'] });
      toast({ title: '✅ 삭제됨' });
    },
  });

  const handleAiSuggest = async () => {
    setIsAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-target-products', { body: {} });
      if (error) throw error;
      if (!(data as any)?.ok) throw new Error((data as any)?.reason || 'unknown');
      toast({
        title: `🪄 AI 추천 ${(data as any).inserted}건 완료`,
        description: '「초안」 탭에서 검토 후 활성화하세요.',
      });
      qc.invalidateQueries({ queryKey: ['target-products'] });
      setStatusFilter('draft');
    } catch (e: any) {
      toast({ title: 'AI 추천 실패', description: e.message, variant: 'destructive' });
    } finally {
      setIsAiLoading(false);
    }
  };

  const counts = {
    active: targets.filter((t) => t.status === 'active').length,
    draft: targets.filter((t) => t.status === 'draft').length,
    archived: targets.filter((t) => t.status === 'archived').length,
    all: targets.length,
  };

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">타겟 상품 정의</h1>
          <p className="text-sm text-muted-foreground mt-1">
            트렌드 키워드 + 카테고리 + 가격대 + MOQ 묶음으로 「이런 상품 찾아라」 정의.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAiSuggest} disabled={isAiLoading}>
            <Sparkles className="w-4 h-4" />
            {isAiLoading ? 'AI 분석 중...' : '🪄 AI 추천'}
          </Button>
          <Button onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
            <Plus className="w-4 h-4" />
            신규 타겟
          </Button>
        </div>
      </div>

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="active">활성 ({counts.active})</TabsTrigger>
          <TabsTrigger value="draft">초안 ({counts.draft})</TabsTrigger>
          <TabsTrigger value="archived">보관 ({counts.archived})</TabsTrigger>
          <TabsTrigger value="all">전체 ({counts.all})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Input
        placeholder="이름 / 키워드 검색..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">로딩 중...</p>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            <p className="mb-3">
              {statusFilter === 'active' ? '활성 타깃이 없습니다.' : '항목이 없습니다.'}
            </p>
            <Button variant="outline" size="sm" onClick={handleAiSuggest} disabled={isAiLoading}>
              🪄 AI 추천으로 시작
            </Button>
            <span className="mx-2">또는</span>
            <Button size="sm" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
              + 신규 정의
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base">{t.name}</CardTitle>
                  <div className="flex gap-1 flex-wrap">
                    {t.source === 'ai_suggested' && (
                      <Badge variant="secondary" className="text-[10px]">🪄 AI</Badge>
                    )}
                    <Badge
                      variant={t.status === 'active' ? 'default' : 'outline'}
                      className="text-[10px]"
                    >
                      {t.status === 'active' ? '활성' : t.status === 'draft' ? '초안' : t.status === 'archived' ? '보관' : '만료'}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {t.category && <p><span className="text-muted-foreground">카테고리:</span> {t.category}</p>}
                {t.trend_keywords?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {t.trend_keywords.slice(0, 6).map((k, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{k}</Badge>
                    ))}
                  </div>
                ) : null}
                {t.style_tags?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {t.style_tags.map((s, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                ) : null}
                {(t.price_min_usd != null || t.price_max_usd != null) && (
                  <p><span className="text-muted-foreground">가격:</span> ${t.price_min_usd ?? '?'} ~ ${t.price_max_usd ?? '?'}</p>
                )}
                {t.moq_max != null && <p><span className="text-muted-foreground">MOQ ≤</span> {t.moq_max}</p>}
                {t.valid_until && (
                  <p className="text-muted-foreground">유효: {format(new Date(t.valid_until), 'yyyy-MM-dd')}</p>
                )}
                <div className="flex flex-wrap gap-1 pt-2 border-t">
                  {t.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: 'active' })}>
                      <Power className="w-3 h-3" /> 활성화
                    </Button>
                  )}
                  {t.status === 'active' && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: t.id, status: 'archived' })}>
                      <Archive className="w-3 h-3" /> 보관
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setEditTarget(t); setIsModalOpen(true); }}>
                    <Edit className="w-3 h-3" /> 편집
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => {
                    if (confirm(`「${t.name}」 삭제?`)) deleteTarget.mutate(t.id);
                  }}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <TargetProductFormModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        editTarget={editTarget}
        onSaved={() => qc.invalidateQueries({ queryKey: ['target-products'] })}
      />
    </div>
  );
}
