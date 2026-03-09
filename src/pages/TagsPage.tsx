import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, Pencil, Check, X, Search, Tag, Factory } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const COLORS = [
  '#141414', '#6b7280', '#ef4444', '#f97316', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

const TagsPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState('');
  const [selectedColor, setSelectedColor] = useState(COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [search, setSearch] = useState('');

  const { data: tags = [], isLoading } = useQuery({
    queryKey: ['tags', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Get usage counts for each tag
  const { data: tagUsage = {} } = useQuery({
    queryKey: ['tag-usage', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factory_tags')
        .select('tag_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((ft) => {
        counts[ft.tag_id] = (counts[ft.tag_id] || 0) + 1;
      });
      return counts;
    },
    enabled: !!user,
  });

  const addTag = useMutation({
    mutationFn: async () => {
      if (!newTag.trim()) return;
      const { error } = await supabase
        .from('tags')
        .insert({ user_id: user!.id, name: newTag.trim(), color: selectedColor });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['tag-usage'] });
      setNewTag('');
      toast({ title: '태그가 추가되었습니다' });
    },
    onError: (e: any) =>
      toast({ title: '추가 실패', description: e.message, variant: 'destructive' }),
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      const { error } = await supabase
        .from('tags')
        .update({ name: name.trim(), color })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      setEditingId(null);
      toast({ title: '태그가 수정되었습니다' });
    },
    onError: (e: any) =>
      toast({ title: '수정 실패', description: e.message, variant: 'destructive' }),
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] });
      queryClient.invalidateQueries({ queryKey: ['tag-usage'] });
      toast({ title: '태그가 삭제되었습니다' });
    },
  });

  const startEdit = (tag: { id: string; name: string; color: string | null }) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color ?? COLORS[0]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor('');
  };

  const filteredTags = tags.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalUsage = Object.values(tagUsage).reduce((a, b) => a + b, 0);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">태그 관리</h1>
          <p className="text-sm text-muted-foreground">
            공장을 분류하기 위한 태그를 관리하세요
          </p>
        </div>
        <div className="flex gap-3 text-center">
          <div className="bg-card border border-border rounded-lg px-4 py-2.5">
            <div className="text-lg font-bold">{tags.length}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">태그</div>
          </div>
          <div className="bg-card border border-border rounded-lg px-4 py-2.5">
            <div className="text-lg font-bold">{totalUsage}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">사용</div>
          </div>
        </div>
      </div>

      {/* Add new tag */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            새 태그 추가
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="태그 이름을 입력하세요..."
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && newTag.trim() && addTag.mutate()}
                className="h-10"
              />
            </div>
            <div className="flex gap-1.5 items-center">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className="w-6 h-6 rounded-full border-2 transition-all duration-150 hover:scale-110"
                  style={{
                    backgroundColor: c,
                    borderColor: selectedColor === c ? 'hsl(var(--ring))' : 'transparent',
                    transform: selectedColor === c ? 'scale(1.2)' : undefined,
                  }}
                  onClick={() => setSelectedColor(c)}
                />
              ))}
            </div>
            <Button
              size="sm"
              className="h-10 text-xs uppercase tracking-wider"
              onClick={() => addTag.mutate()}
              disabled={!newTag.trim() || addTag.isPending}
            >
              <Plus className="w-3 h-3 mr-1.5" />
              추가
            </Button>
          </div>
          {newTag.trim() && (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span>미리보기:</span>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium"
                style={{
                  backgroundColor: selectedColor + '18',
                  color: selectedColor,
                  border: `1px solid ${selectedColor}30`,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedColor }} />
                {newTag.trim()}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Search */}
      {tags.length > 0 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="태그 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      )}

      {/* Tags list */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search ? '검색 결과가 없습니다' : '아직 태그가 없습니다. 위에서 새 태그를 추가하세요.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <AnimatePresence mode="popLayout">
            {filteredTags.map((tag) => {
              const isEditing = editingId === tag.id;
              const usageCount = tagUsage[tag.id] || 0;

              return (
                <motion.div
                  key={tag.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="group bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-3 hover:border-foreground/20 transition-colors"
                >
                  {isEditing ? (
                    <>
                      <div className="flex gap-1 items-center">
                        {COLORS.map((c) => (
                          <button
                            key={c}
                            className="w-4 h-4 rounded-full border transition-all"
                            style={{
                              backgroundColor: c,
                              borderColor: editColor === c ? 'hsl(var(--ring))' : 'transparent',
                              transform: editColor === c ? 'scale(1.3)' : undefined,
                            }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && editName.trim())
                            updateTag.mutate({ id: tag.id, name: editName, color: editColor });
                          if (e.key === 'Escape') cancelEdit();
                        }}
                      />
                      <button
                        onClick={() =>
                          updateTag.mutate({ id: tag.id, name: editName, color: editColor })
                        }
                        disabled={!editName.trim()}
                        className="text-foreground hover:text-primary transition-colors"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: tag.color ?? '#141414' }}
                      />
                      <span className="text-sm font-medium flex-1 truncate">{tag.name}</span>
                      {usageCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          <Factory className="w-3 h-3" />
                          {usageCount}
                        </span>
                      )}
                      <button
                        onClick={() => startEdit(tag)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>태그 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              <span className="font-medium text-foreground">"{tag.name}"</span> 태그를 삭제하시겠습니까?
                              {usageCount > 0 && (
                                <span className="block mt-1 text-destructive">
                                  현재 {usageCount}개의 공장에 사용 중입니다.
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteTag.mutate(tag.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
};

export default TagsPage;
