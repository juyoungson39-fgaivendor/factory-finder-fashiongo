import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Plus, Trash2, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFgSettings, useUpdateFgSettings } from '@/integrations/supabase/hooks/use-fg-settings';
import type { CustomAIVendor } from '@/integrations/supabase/hooks/use-fg-settings';
import { AI_VENDORS } from '@/integrations/va-api/vendor-config';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';

const emptyForm = (): Omit<CustomAIVendor, 'id'> => ({
  name: '',
  wholesalerId: 0,
  defaultColorId: 0,
  position: '',
  categories: '',
  color: '#3B82F6',
  isActive: true,
});

const AIVendorManagementSection = () => {
  const { toast } = useToast();
  const { data: settings } = useFgSettings();
  const updateSettings = useUpdateFgSettings();
  const { all } = useResolvedVendors();

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [pendingActive, setPendingActive] = useState<Record<string, boolean>>({});

  // Keep pending toggle map in sync with resolved data
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const v of all) next[v.id] = v.isActive;
    setPendingActive(next);
  }, [all]);

  const dirty = all.some((v) => pendingActive[v.id] !== v.isActive);
  const activeCount = Object.values(pendingActive).filter(Boolean).length;

  const handleToggle = (id: string, checked: boolean) => {
    setPendingActive((prev) => ({ ...prev, [id]: checked }));
  };

  const handleSaveToggles = () => {
    if (!settings) return;
    const overrides: Record<string, { isActive: boolean }> = { ...(settings.aiVendors?.overrides ?? {}) };
    const custom = [...(settings.aiVendors?.custom ?? [])];

    for (const v of all) {
      const isActive = pendingActive[v.id];
      const isCustom = custom.some((c) => c.id === v.id);
      if (isCustom) {
        const idx = custom.findIndex((c) => c.id === v.id);
        custom[idx] = { ...custom[idx], isActive };
      } else {
        // Override only when value differs from catalog default to keep settings minimal
        const def = AI_VENDORS.find((d) => d.id === v.id);
        if (def && def.isActive !== isActive) {
          overrides[v.id] = { isActive };
        } else {
          delete overrides[v.id];
        }
      }
    }

    updateSettings.mutate(
      { aiVendors: { overrides, custom } },
      { onSuccess: () => toast({ title: '벤더 활성 상태가 저장되었습니다' }) },
    );
  };

  const handleDeleteCustom = (id: string) => {
    if (!settings) return;
    const custom = (settings.aiVendors?.custom ?? []).filter((c) => c.id !== id);
    const overrides = { ...(settings.aiVendors?.overrides ?? {}) };
    delete overrides[id];
    updateSettings.mutate(
      { aiVendors: { overrides, custom } },
      { onSuccess: () => toast({ title: '커스텀 벤더가 삭제되었습니다' }) },
    );
  };

  const handleAddCustom = () => {
    if (!form.name.trim()) {
      toast({ title: '벤더 이름을 입력하세요', variant: 'destructive' });
      return;
    }
    if (!form.wholesalerId || form.wholesalerId <= 0) {
      toast({ title: 'Wholesaler ID를 입력하세요', variant: 'destructive' });
      return;
    }
    const newVendor: CustomAIVendor = {
      ...form,
      id: `custom-${Date.now()}`,
    };
    const custom = [...(settings?.aiVendors?.custom ?? []), newVendor];
    const overrides = settings?.aiVendors?.overrides ?? {};
    updateSettings.mutate(
      { aiVendors: { overrides, custom } },
      {
        onSuccess: () => {
          toast({ title: `${newVendor.name} 벤더가 추가되었습니다` });
          setAddOpen(false);
          setForm(emptyForm());
        },
      },
    );
  };

  const isCustom = (id: string) => (settings?.aiVendors?.custom ?? []).some((c) => c.id === id);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            Angel's Vendor 관리
          </CardTitle>
          <CardDescription>
            노출할 AI Vendor를 활성/비활성으로 관리하거나 새 벤더를 추가합니다 ·{' '}
            <span className="font-medium text-foreground">{activeCount}개 활성</span>
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> 벤더 추가
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {all.map((v) => {
          const custom = isCustom(v.id);
          const checked = pendingActive[v.id] ?? v.isActive;
          return (
            <div
              key={v.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border hover:bg-accent/40 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: v.color }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{v.name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {v.position || '—'}
                    </Badge>
                    {custom && (
                      <Badge variant="secondary" className="text-[10px]">사용자 추가</Badge>
                    )}
                    {!checked && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">비활성</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    WID {v.wholesalerId} · {v.categories || '카테고리 미설정'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Switch
                  checked={checked}
                  onCheckedChange={(c) => handleToggle(v.id, c)}
                  aria-label={`${v.name} 활성 토글`}
                />
                {custom && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteCustom(v.id)}
                    aria-label={`${v.name} 삭제`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {dirty && (
          <div className="flex justify-end pt-2">
            <Button onClick={handleSaveToggles} disabled={updateSettings.isPending}>
              활성 상태 저장
            </Button>
          </div>
        )}
      </CardContent>

      {/* Add Custom Vendor Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>새 AI Vendor 추가</DialogTitle>
            <DialogDescription>FashionGo wholesaler 계정을 AI Vendor 페르소나로 등록합니다</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="v-name">벤더 이름 *</Label>
                <Input id="v-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: Sunny Style" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-wid">Wholesaler ID *</Label>
                <Input id="v-wid" type="number" value={form.wholesalerId || ''} onChange={(e) => setForm({ ...form, wholesalerId: parseInt(e.target.value) || 0 })} placeholder="예: 4933" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-color-id">Default Color ID</Label>
                <Input id="v-color-id" type="number" value={form.defaultColorId || ''} onChange={(e) => setForm({ ...form, defaultColorId: parseInt(e.target.value) || 0 })} placeholder="예: 222673 (BLACK)" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="v-color">브랜드 컬러</Label>
                <div className="flex items-center gap-2">
                  <Input id="v-color" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="w-14 h-9 p-1 cursor-pointer" />
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="#3B82F6" />
                </div>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="v-position">포지션</Label>
                <Input id="v-position" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="예: 미니멀 베이직" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="v-cats">주력 카테고리</Label>
                <Input id="v-cats" value={form.categories} onChange={(e) => setForm({ ...form, categories: e.target.value })} placeholder="Tops, Dresses, Casual" />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Switch id="v-active" checked={form.isActive} onCheckedChange={(c) => setForm({ ...form, isActive: c })} />
                <Label htmlFor="v-active" className="cursor-pointer">추가 즉시 활성화</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>취소</Button>
            <Button onClick={handleAddCustom} disabled={updateSettings.isPending}>벤더 추가</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default AIVendorManagementSection;
