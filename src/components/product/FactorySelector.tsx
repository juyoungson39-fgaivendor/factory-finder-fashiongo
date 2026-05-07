import React, { useState } from 'react';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface FactoryOption {
  id: string;
  name: string;
}

interface Props {
  value: string | null;
  onChange: (factoryId: string | null, factoryName: string | null) => void;
  placeholder?: string;
  className?: string;
}

const FactorySelector: React.FC<Props> = ({ value, onChange, placeholder = '공장 선택', className }) => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: factories = [], isLoading } = useQuery({
    queryKey: ['factories', 'selector-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('id, name')
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return (data ?? []) as FactoryOption[];
    },
    staleTime: 60_000,
  });

  const selected = factories.find((f) => f.id === value);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('로그인이 필요합니다');

      // 동일 이름(case-insensitive) 존재 시 재사용
      const existing = factories.find((f) => f.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        onChange(existing.id, existing.name);
        setOpen(false); setCreating(false); setNewName('');
        toast({ title: '기존 공장을 선택했습니다', description: existing.name });
        return;
      }

      const { data, error } = await (supabase as any)
        .from('factories')
        .insert({
          user_id: user.id,
          name,
          source_note: 'created_from_product_dialog',
          status: 'new',
        })
        .select('id, name')
        .single();
      if (error) throw error;

      await qc.invalidateQueries({ queryKey: ['factories', 'selector-list'] });
      onChange(data.id, data.name);
      setOpen(false); setCreating(false); setNewName('');
      toast({ title: '✅ 신규 공장 등록 완료', description: data.name });
    } catch (e: any) {
      toast({ title: '공장 등록 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreating(false); setNewName(''); } }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {creating ? (
          <div className="p-3 space-y-2">
            <label className="text-xs font-medium text-muted-foreground">신규 공장명</label>
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              placeholder="예: 광저우 OO 의류 유한공사"
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName(''); }}>취소</Button>
              <Button size="sm" disabled={saving || !newName.trim()} onClick={handleCreate}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : '등록'}
              </Button>
            </div>
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="공장 검색..." />
            <CommandList>
              <CommandEmpty>{isLoading ? '로딩 중...' : '결과 없음'}</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => { onChange(null, null); setOpen(false); }}>
                  <span className="text-muted-foreground">— 미지정 —</span>
                </CommandItem>
                {factories.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={f.name}
                    onSelect={() => { onChange(f.id, f.name); setOpen(false); }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', value === f.id ? 'opacity-100' : 'opacity-0')} />
                    {f.name}
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup>
                <CommandItem onSelect={() => setCreating(true)} className="text-primary">
                  <Plus className="mr-2 h-4 w-4" /> 신규 공장 등록
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default FactorySelector;
