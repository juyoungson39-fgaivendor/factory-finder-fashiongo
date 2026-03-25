import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ImageIcon, Search, Type, TrendingUp, Pencil, Trash2, Check, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Product {
  id: string;
  brand: string | null;
  name: string;
  price: number | null;
  image_url: string | null;
  created_at: string;
  search_source_type: string | null;
  search_source_query: string | null;
  search_source_image_url: string | null;
}

const InlineEdit: React.FC<{
  value: string;
  onSave: (val: string) => void;
  className?: string;
  type?: 'text' | 'number';
  prefix?: string;
}> = ({ value, onSave, className = '', type = 'text', prefix }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!editing) {
    return (
      <span
        className={`cursor-pointer hover:bg-muted/60 rounded px-1 -mx-1 transition-colors ${className}`}
        onClick={() => { setDraft(value); setEditing(true); }}
        title="클릭하여 수정"
      >
        {prefix}{value || '—'}
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return (
    <Input
      ref={inputRef}
      type={type}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="h-7 text-[13px] px-1"
    />
  );
};

const SourceBadge = ({ type, query }: { type: string | null; query: string | null }) => {
  if (!type) return null;

  const icon = type === 'image' ? <ImageIcon className="w-3 h-3" />
    : type === 'text' ? <Type className="w-3 h-3" />
    : <TrendingUp className="w-3 h-3" />;

  const label = type === 'image' ? '이미지 검색'
    : type === 'text' ? '텍스트 검색'
    : '트렌드';

  return (
    <div className="space-y-1">
      <Badge variant="secondary" className="text-[9px] gap-1 px-1.5 py-0">
        {icon}
        {label}
      </Badge>
      {query && (
        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-tight" title={query}>
          "{query}"
        </p>
      )}
    </div>
  );
};

const SourcingTargetFG = () => {
  const queryClient = useQueryClient();
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['products-fg'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const { error } = await (supabase as any)
        .from('products')
        .update({ [field]: value })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products-fg'] });
      toast({ title: '✅ 저장 완료' });
    },
    onError: () => {
      toast({ title: '저장 실패', variant: 'destructive' });
    },
  });

  const handleSave = (id: string, field: string, value: string) => {
    const parsed = field === 'price' ? (value ? Number(value) : null) : value;
    updateMutation.mutate({ id, field, value: parsed });
  };

  const handleImageClick = (id: string, currentUrl: string | null) => {
    const newUrl = prompt('이미지 URL을 입력하세요', currentUrl ?? '');
    if (newUrl !== null && newUrl !== currentUrl) {
      updateMutation.mutate({ id, field: 'image_url', value: newUrl || null });
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any).from('products').delete().eq('id', deleteId);
    if (error) {
      toast({ title: '삭제 실패', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '🗑️ 삭제 완료' });
      queryClient.invalidateQueries({ queryKey: ['products-fg'] });
    }
    setDeleteId(null);
  };

  const sourceCounts = items.reduce<Record<string, number>>((acc, p) => {
    const key = p.search_source_type || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const filtered = filterSource
    ? items.filter(p => (p.search_source_type || 'unknown') === filterSource)
    : items;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <Search className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-muted-foreground text-sm">등록된 타겟 상품이 없습니다</p>
        <p className="text-xs text-muted-foreground/60">AI 상품 탐색에서 이미지나 텍스트로 상품을 검색하고 타겟에 추가하세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">총 {items.length}개 상품</span>
        <span className="text-border">|</span>
        <button
          onClick={() => setFilterSource(null)}
          className={`text-xs px-2 py-1 rounded transition-colors ${!filterSource ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}
        >
          전체
        </button>
        {sourceCounts['image'] && (
          <button onClick={() => setFilterSource('image')} className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${filterSource === 'image' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            <ImageIcon className="w-3 h-3" />이미지 ({sourceCounts['image']})
          </button>
        )}
        {sourceCounts['text'] && (
          <button onClick={() => setFilterSource('text')} className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${filterSource === 'text' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            <Type className="w-3 h-3" />텍스트 ({sourceCounts['text']})
          </button>
        )}
        {sourceCounts['trend'] && (
          <button onClick={() => setFilterSource('trend')} className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${filterSource === 'trend' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            <TrendingUp className="w-3 h-3" />트렌드 ({sourceCounts['trend']})
          </button>
        )}
        {sourceCounts['unknown'] && (
          <button onClick={() => setFilterSource('unknown')} className={`text-xs px-2 py-1 rounded transition-colors ${filterSource === 'unknown' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground'}`}>
            기타 ({sourceCounts['unknown']})
          </button>
        )}
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col relative group"
          >
            {/* Delete button */}
            <Button
              size="icon"
              variant="ghost"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-background/80 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setDeleteId(p.id)}
            >
              <Trash2 className="w-3 h-3" />
            </Button>

            {/* Image */}
            <div
              className="aspect-[3/4] bg-muted flex items-center justify-center cursor-pointer relative"
              onClick={() => handleImageClick(p.id, p.image_url)}
              title="클릭하여 이미지 URL 변경"
            >
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>

            {/* Info */}
            <div className="p-3 space-y-1.5 flex-1">
              <SourceBadge type={p.search_source_type} query={p.search_source_query} />
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                <InlineEdit value={p.brand ?? ''} onSave={(v) => handleSave(p.id, 'brand', v)} />
              </div>
              <div className="text-[13px] font-medium text-foreground leading-tight">
                <InlineEdit value={p.name} onSave={(v) => handleSave(p.id, 'name', v)} />
              </div>
              <div className="text-[13px] font-semibold text-foreground pt-1">
                <InlineEdit value={p.price != null ? String(p.price) : ''} onSave={(v) => handleSave(p.id, 'price', v)} type="number" prefix="$" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>상품 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 상품을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SourcingTargetFG;
