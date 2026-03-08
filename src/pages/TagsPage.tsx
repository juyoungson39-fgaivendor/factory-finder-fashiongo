import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2 } from 'lucide-react';

const COLORS = ['#141414', '#6b7280', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const TagsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);

  const { data: tags = [] } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('tags').select('*').order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addTag = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tags').insert({ user_id: user!.id, name: newTag.trim(), color: selectedColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNewTag('');
      toast({ title: '태그 추가 완료' });
    },
    onError: (e: any) => toast({ title: '추가 실패', description: e.message, variant: 'destructive' }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      toast({ title: '태그 삭제 완료' });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Tags</h1>
      <p className="text-sm text-muted-foreground mb-8">공장을 분류하기 위한 태그를 관리하세요</p>

      <Card className="mb-8">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">New Tag</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input placeholder="태그 이름..." value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && newTag.trim() && addTag.mutate()} className="h-10" />
            </div>
            <div className="flex gap-1.5 items-center">
              {COLORS.map((c) => (
                <button key={c} className="w-6 h-6 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: selectedColor === c ? 'hsl(var(--ring))' : 'transparent', transform: selectedColor === c ? 'scale(1.2)' : 'scale(1)' }} onClick={() => setSelectedColor(c)} />
              ))}
            </div>
            <Button size="sm" className="h-10 text-xs uppercase tracking-wider" onClick={() => addTag.mutate()} disabled={!newTag.trim()}>
              <Plus className="w-3 h-3 mr-1.5" />Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <div key={tag.id} className="inline-flex items-center gap-2 bg-card border border-border rounded-md px-3 py-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color ?? '#141414' }} />
            <span className="text-sm font-medium">{tag.name}</span>
            <button onClick={() => deleteTag.mutate(tag.id)} className="text-muted-foreground/40 hover:text-destructive transition-colors">
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {tags.length === 0 && <p className="text-sm text-muted-foreground">아직 태그가 없습니다</p>}
      </div>
    </div>
  );
};

export default TagsPage;
