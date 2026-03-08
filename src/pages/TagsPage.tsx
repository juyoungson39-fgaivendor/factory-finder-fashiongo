import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Tag } from 'lucide-react';

const COLORS = ['#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'];

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
      const { error } = await supabase.from('tags').insert({
        user_id: user!.id,
        name: newTag.trim(),
        color: selectedColor,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setNewTag('');
      toast({ title: '태그가 추가되었습니다' });
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
      toast({ title: '태그가 삭제되었습니다' });
    },
  });

  return (
    <div>
      <h1 className="text-3xl font-heading font-bold mb-2">태그 관리</h1>
      <p className="text-muted-foreground mb-8">공장을 분류하기 위한 태그를 관리하세요</p>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="w-5 h-5" />
            새 태그 추가
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Input
                placeholder="태그 이름..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newTag.trim() && addTag.mutate()}
              />
            </div>
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className="w-7 h-7 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c,
                    borderColor: selectedColor === c ? 'hsl(var(--foreground))' : 'transparent',
                    transform: selectedColor === c ? 'scale(1.15)' : 'scale(1)',
                  }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <Button onClick={() => addTag.mutate()} disabled={!newTag.trim()}>
              <Plus className="w-4 h-4 mr-2" />
              추가
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {tags.map((tag) => (
          <Card key={tag.id} className="inline-flex items-center gap-3 px-4 py-3">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color ?? '#f59e0b' }} />
            <span className="font-medium">{tag.name}</span>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => deleteTag.mutate(tag.id)}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          </Card>
        ))}
        {tags.length === 0 && (
          <p className="text-muted-foreground">아직 태그가 없습니다. 위에서 추가해보세요!</p>
        )}
      </div>
    </div>
  );
};

export default TagsPage;
