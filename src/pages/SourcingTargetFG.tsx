import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, ImageIcon } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

interface Product {
  id: string;
  brand: string | null;
  name: string;
  price: number | null;
  image_url: string | null;
  created_at: string;
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

const SourcingTargetFG = () => {
  const queryClient = useQueryClient();

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
      toast({ title: '저장 완료' });
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground text-sm">
        등록된 상품이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">총 {items.length}개 상품</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {items.map((p) => (
          <div
            key={p.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col"
          >
            {/* Image */}
            <div
              className="aspect-[3/4] bg-muted flex items-center justify-center cursor-pointer relative group"
              onClick={() => handleImageClick(p.id, p.image_url)}
              title="클릭하여 이미지 URL 변경"
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <ImageIcon className="w-8 h-8 text-muted-foreground/40" />
              )}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>

            {/* Info */}
            <div className="p-3 space-y-1 flex-1">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                <InlineEdit
                  value={p.brand ?? ''}
                  onSave={(v) => handleSave(p.id, 'brand', v)}
                />
              </div>
              <div className="text-[13px] font-medium text-foreground leading-tight">
                <InlineEdit
                  value={p.name}
                  onSave={(v) => handleSave(p.id, 'name', v)}
                />
              </div>
              <div className="text-[13px] font-semibold text-foreground pt-1">
                <InlineEdit
                  value={p.price != null ? String(p.price) : ''}
                  onSave={(v) => handleSave(p.id, 'price', v)}
                  type="number"
                  prefix="$"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SourcingTargetFG;
