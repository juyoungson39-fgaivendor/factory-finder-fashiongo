import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, Upload, Sparkles, ImageOff, X, Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ProductRow } from './ProductTable';
import FactorySelector from './FactorySelector';
import { useExchangeRate } from '@/hooks/useExchangeRate';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
type ImageSlot =
  | { kind: 'existing'; url: string }
  | { kind: 'new';      file: File; blobUrl: string };

interface FormState {
  item_name:          string;
  product_no:         string;
  category:           string;
  isCustomCategory:   boolean;
  vendor_name:        string;
  factory_id:         string | null;
  unit_price_cny:     string;
  material:           string;
  color_size:         string;
  weight_kg:          string;
  description:        string;
  description_source: string | null;
  manualEdited:       boolean;
}

interface Props {
  row:          ProductRow;
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  queryKey:     string[];
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
const CUSTOM_CATEGORY_KEY = '__custom__';

function initForm(row: ProductRow): FormState {
  return {
    item_name:          row.item_name    ?? '',
    product_no:         row.product_no   ?? '',
    category:           row.category     ?? '',
    isCustomCategory:   false,
    vendor_name:        row.vendor_name  ?? '',
    factory_id:         (row as any).factory_id ?? null,
    unit_price_cny:     row.unit_price_cny != null ? String(row.unit_price_cny) : '',
    material:           row.material     ?? '',
    color_size:         row.color_size   ?? '',
    weight_kg:          row.weight_kg    != null ? String(row.weight_kg) : '',
    description:        row.description  ?? '',
    description_source: row.description_source ?? null,
    manualEdited:       false,
  };
}

/** row의 images 배열 → ImageSlot 배열. images가 없으면 storage>mirror>url fallback. */
function initImageSlots(row: ProductRow): ImageSlot[] {
  const imgs: string[] = row.images ?? [];
  if (imgs.length > 0) return imgs.map(url => ({ kind: 'existing', url }));
  const fallback = row.image_url_storage ?? row.image_url_mirror ?? row.image_url ?? null;
  return fallback ? [{ kind: 'existing', url: fallback }] : [];
}

/** 변경 감지를 위한 "원래" URL 배열 */
function getOrigUrls(row: ProductRow): string[] {
  const imgs: string[] = row.images ?? [];
  if (imgs.length > 0) return imgs;
  const fallback = row.image_url_storage ?? row.image_url_mirror ?? row.image_url ?? null;
  return fallback ? [fallback] : [];
}

const str = (v: string | null | undefined) => v ?? '';

const SOURCE_MAP: Record<string, {
  label: string;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
}> = {
  agent:      { label: 'Agent', variant: 'default' },
  agent_auto: { label: 'Agent', variant: 'default' },
  csv_upload: { label: 'CSV',   variant: 'secondary' },
  csv:        { label: 'CSV',   variant: 'secondary' },
  manual:     { label: '수동',  variant: 'outline' },
  seed:       { label: '시드',  variant: 'destructive' },
};

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
const EditSourceableProductDialog: React.FC<Props> = ({
  row, open, onOpenChange, queryKey,
}) => {
  const queryClient  = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // ref for cleanup on unmount — avoids stale closure
  const slotsRef     = useRef<ImageSlot[]>([]);

  // 환율 (read-only USD 미리보기용)
  const { data: rateData } = useExchangeRate();

  const [form,       setForm]       = useState<FormState>(() => initForm(row));
  const [imageSlots, setImageSlots] = useState<ImageSlot[]>(() => initImageSlots(row));
  const [saving,     setSaving]     = useState(false);
  const [aiLoading,  setAiLoading]  = useState(false);

  slotsRef.current = imageSlots;

  // ── USD 미리보기 (CNY × 현재 환율) ───────────────────────
  const previewUsd = useMemo(() => {
    const cny  = parseFloat(form.unit_price_cny);
    const rate = rateData?.cny_to_usd_rate;
    if (!isNaN(cny) && cny > 0 && rate) {
      return (cny * rate).toFixed(2);
    }
    return null;
  }, [form.unit_price_cny, rateData?.cny_to_usd_rate]);

  // ── Re-init when dialog opens / row changes ───────────────
  useEffect(() => {
    if (open) {
      setForm(initForm(row));
      setImageSlots(initImageSlots(row));
    }
  }, [row.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup all blob URLs on unmount ──────────────────────
  useEffect(() => {
    return () => {
      slotsRef.current.forEach(s => {
        if (s.kind === 'new') URL.revokeObjectURL(s.blobUrl);
      });
    };
  }, []);

  // ── Distinct categories query ─────────────────────────────
  const { data: distinctCategories = [] } = useQuery({
    queryKey: ['distinct-sourceable-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sourceable_products')
        .select('category')
        .not('category', 'is', null)
        .order('category');
      return [
        ...new Set(
          (data ?? []).map((d: any) => d.category as string).filter(Boolean),
        ),
      ] as string[];
    },
    staleTime: 120_000,
    enabled: open,
  });

  // ── Image handlers ────────────────────────────────────────
  const handleAddImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newSlots: ImageSlot[] = files.map(file => ({
      kind: 'new',
      file,
      blobUrl: URL.createObjectURL(file),
    }));
    setImageSlots(prev => [...prev, ...newSlots]);
    e.target.value = '';
  };

  const handleRemoveImage = (idx: number) => {
    setImageSlots(prev => {
      const slot = prev[idx];
      if (slot.kind === 'new') URL.revokeObjectURL(slot.blobUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Category handler ──────────────────────────────────────
  const handleCategorySelect = (val: string) => {
    if (val === CUSTOM_CATEGORY_KEY) {
      setForm(f => ({ ...f, category: '', isCustomCategory: true }));
    } else {
      setForm(f => ({ ...f, category: val, isCustomCategory: false }));
    }
  };

  // ── Description handlers ──────────────────────────────────
  const handleDescriptionChange = (val: string) => {
    setForm(f => ({
      ...f,
      description:        val,
      manualEdited:       true,
      description_source: 'manual',
    }));
  };

  // ── AI regenerate ─────────────────────────────────────────
  const handleAiRegenerate = async () => {
    const imageUrl =
      row.image_url_storage ??
      row.image_url_mirror  ??
      row.image_url         ??
      undefined;

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-product-description',
        {
          body: {
            productId: row.id,
            imageUrl:  imageUrl ?? null,
            category:  form.category   || null,
            material:  form.material   || null,
            colorSize: form.color_size || null,
          },
        },
      );
      if (error) throw error;
      if (data?.description) {
        setForm(f => ({
          ...f,
          description:        data.description,
          description_source: 'ai',
          manualEdited:       false,
        }));
        toast({ title: '✨ AI 설명 생성 완료' });
      }
    } catch (e: any) {
      toast({ title: 'AI 재생성 실패', description: e.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, any> = {};

      // ── Text field diffs ─────────────────────────────────
      if (form.item_name   !== str(row.item_name))   payload.item_name   = form.item_name   || null;
      if (form.product_no  !== str(row.product_no))  payload.product_no  = form.product_no  || null;
      if (form.category    !== str(row.category))    payload.category    = form.category    || null;
      if (form.vendor_name !== str(row.vendor_name)) payload.vendor_name = form.vendor_name || null;
      if (form.material    !== str(row.material))    payload.material    = form.material    || null;
      if (form.color_size  !== str(row.color_size))  payload.color_size  = form.color_size  || null;

      const newPrice  = form.unit_price_cny ? parseFloat(form.unit_price_cny) : null;
      if (newPrice  !== (row.unit_price_cny ?? null)) payload.unit_price_cny = newPrice;
      // NOTE: exchange_rate_at_import은 최초 INSERT 시점에만 기록되므로 수정 시 건드리지 않음

      const newWeight = form.weight_kg ? parseFloat(form.weight_kg) : null;
      if (newWeight !== (row.weight_kg ?? null))      payload.weight_kg = newWeight;

      const descChanged = form.description !== str(row.description);
      if (descChanged) {
        payload.description        = form.description || null;
        payload.description_source = form.manualEdited
          ? 'manual'
          : (form.description_source ?? 'manual');
      }

      // ── Images ───────────────────────────────────────────
      const origUrls    = getOrigUrls(row);
      const hasNewFiles = imageSlots.some(s => s.kind === 'new');
      const existingNow = imageSlots
        .filter((s): s is { kind: 'existing'; url: string } => s.kind === 'existing')
        .map(s => s.url);
      const imagesChanged =
        hasNewFiles ||
        imageSlots.length !== origUrls.length ||
        existingNow.some((u, i) => u !== origUrls[i]);

      if (imagesChanged) {
        const ts = Date.now();
        const finalUrls: string[] = [];

        for (let i = 0; i < imageSlots.length; i++) {
          const slot = imageSlots[i];
          if (slot.kind === 'existing') {
            finalUrls.push(slot.url);
          } else {
            const ext  = slot.file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
            const path = `products/${row.product_no || row.id}_${ts}_${i}.${ext}`;
            const { error: uploadErr } = await supabase.storage
              .from('factory-photos')
              .upload(path, slot.file, { upsert: true, contentType: slot.file.type });
            if (uploadErr) throw uploadErr;
            const { data: { publicUrl } } = supabase.storage
              .from('factory-photos')
              .getPublicUrl(path);
            finalUrls.push(publicUrl);
          }
        }

        payload.images            = finalUrls.length > 0 ? finalUrls : null;
        payload.image_url_storage = finalUrls[0] ?? null;
      }

      if (Object.keys(payload).length === 0) {
        onOpenChange(false);
        return;
      }

      const { error } = await (supabase as any)
        .from('sourceable_products')
        .update(payload)
        .eq('id', row.id);
      if (error) throw error;

      toast({ title: '✅ 저장 완료' });
      queryClient.invalidateQueries({ queryKey });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────
  const sourceCfg = row.source
    ? (SOURCE_MAP[row.source] ?? { label: row.source, variant: 'outline' as const })
    : null;

  const detectedChips: { v: string; cls: string }[] = [
    ...(row.detected_colors ?? []).filter(Boolean).map(v => ({
      v, cls: 'bg-muted text-foreground/80 border-border',
    })),
    ...(row.detected_style ? [{
      v: row.detected_style,
      cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300',
    }] : []),
    ...(row.detected_material ? [{
      v: row.detected_material,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300',
    }] : []),
  ];

  const showAiBadge = form.description_source === 'ai' && !form.manualEdited;
  const labelCls    = 'text-xs font-medium text-muted-foreground block mb-1';
  const sectionCls  = 'space-y-3';
  const headingCls  = 'text-sm font-semibold text-foreground border-b border-border pb-1.5';

  // ── Render ────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* #1: flex-col layout so body scrolls and header/footer stay fixed */}
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header — fixed */}
        <DialogHeader className="shrink-0">
          <DialogTitle>상품 수정</DialogTitle>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-1 -mx-1 space-y-6 py-2">

          {/* ── 기본 정보 ────────────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>기본 정보</h3>
            <div className="grid grid-cols-2 gap-3">

              {/* 상품명 */}
              <div className="col-span-2">
                <label className={labelCls}>상품명</label>
                <Input
                  value={form.item_name}
                  onChange={e => setForm(f => ({ ...f, item_name: e.target.value }))}
                  placeholder="상품명을 입력하세요"
                />
              </div>

              {/* 상품코드 */}
              <div>
                <label className={labelCls}>상품코드</label>
                <Input
                  value={form.product_no}
                  onChange={e => setForm(f => ({ ...f, product_no: e.target.value }))}
                  placeholder="상품코드"
                />
              </div>

              {/* #3: 카테고리 — space-y-2로 직접입력 input 간격 확보 */}
              <div>
                <label className={labelCls}>카테고리</label>
                <div className="space-y-2">
                  <Select
                    value={form.isCustomCategory ? CUSTOM_CATEGORY_KEY : (form.category || '')}
                    onValueChange={handleCategorySelect}
                  >
                    <SelectTrigger className="text-sm">
                      <SelectValue placeholder="카테고리 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {distinctCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                      <SelectItem value={CUSTOM_CATEGORY_KEY}>✏️ 직접 입력</SelectItem>
                    </SelectContent>
                  </Select>
                  {form.isCustomCategory && (
                    <Input
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="카테고리 직접 입력"
                      autoFocus
                    />
                  )}
                </div>
              </div>

              {/* 소싱공장 — combobox + 신규 등록 */}
              <div className="col-span-2">
                <label className={labelCls}>소싱공장</label>
                <FactorySelector
                  value={form.factory_id}
                  onChange={(id, name) =>
                    setForm(f => ({ ...f, factory_id: id, vendor_name: name ?? '' }))
                  }
                  placeholder="공장을 선택하거나 신규 등록"
                />
              </div>
            </div>
          </section>

          {/* ── 가격 / 스펙 ──────────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>가격 / 스펙</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>공급가 (CNY)</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.unit_price_cny}
                  onChange={e => setForm(f => ({ ...f, unit_price_cny: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelCls}>
                  공급가 (USD)
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">자동 계산</span>
                </label>
                <Input
                  type="text"
                  readOnly
                  value={previewUsd != null ? `$${previewUsd}` : (row.unit_price_usd != null ? `$${row.unit_price_usd}` : "—")}
                  className="bg-muted/40 cursor-not-allowed text-muted-foreground"
                  tabIndex={-1}
                />
              </div>
              <div>
                <label className={labelCls}>무게 (kg)</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.weight_kg}
                  onChange={e => setForm(f => ({ ...f, weight_kg: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className={labelCls}>소재</label>
                <Input
                  value={form.material}
                  onChange={e => setForm(f => ({ ...f, material: e.target.value }))}
                  placeholder="면, 폴리에스터 등"
                />
              </div>
              <div>
                <label className={labelCls}>색상 / 사이즈</label>
                <Input
                  value={form.color_size}
                  onChange={e => setForm(f => ({ ...f, color_size: e.target.value }))}
                  placeholder="블랙/S,M,L"
                />
              </div>
            </div>
          </section>

          {/* ── 이미지 ───────────────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>이미지</h3>

            {/* #4: 빈 상태 placeholder */}
            {imageSlots.length === 0 ? (
              <div className="space-y-3">
                <div className="w-full flex items-center justify-center py-8 rounded-md border border-dashed border-border bg-muted/30">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <ImageOff className="h-8 w-8" />
                    <span className="text-xs">이미지 없음</span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  이미지 추가
                </Button>
              </div>
            ) : (
              /* #2: 다중 이미지 thumbnail row */
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imageSlots.map((slot, idx) => {
                  const src = slot.kind === 'new' ? slot.blobUrl : slot.url;
                  return (
                    <div
                      key={`${src}-${idx}`}
                      className="relative shrink-0"
                    >
                      <img
                        src={src}
                        alt={`이미지 ${idx + 1}`}
                        className="w-24 h-32 object-cover rounded-md border border-border"
                        onError={e => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {/* primary 뱃지 */}
                      {idx === 0 && (
                        <Badge
                          variant="secondary"
                          className="absolute bottom-1 left-1 text-[9px] h-4 px-1 py-0 pointer-events-none"
                        >
                          primary
                        </Badge>
                      )}
                      {/* 제거 버튼 */}
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  );
                })}

                {/* + 추가 버튼 */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-32 shrink-0 rounded-md border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  <span className="text-[10px]">추가</span>
                </button>
              </div>
            )}

            {/* hidden file input — multiple 지원 */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleAddImages}
            />
          </section>

          {/* ── 상품설명 ─────────────────────────────────── */}
          <section className={sectionCls}>
            <div className="flex items-center justify-between">
              <h3 className={headingCls}>상품설명</h3>
              <div className="flex items-center gap-2">
                {showAiBadge && (
                  <Badge variant="secondary" className="gap-1 text-[11px]">
                    <Sparkles className="w-3 h-3" />AI작성
                  </Badge>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleAiRegenerate}
                  disabled={aiLoading}
                >
                  {aiLoading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />
                  }
                  AI 재생성
                </Button>
              </div>
            </div>
            <Textarea
              rows={5}
              value={form.description}
              onChange={e => handleDescriptionChange(e.target.value)}
              placeholder="상품 설명을 입력하거나 AI 재생성 버튼을 누르세요"
              className="resize-none text-sm"
            />
            {form.manualEdited && (
              <p className="text-[11px] text-muted-foreground">
                직접 편집됨 — 저장 시 description_source가 &apos;manual&apos;로 설정됩니다
              </p>
            )}
          </section>

          {/* ── 메타 (읽기 전용) ─────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>메타 정보</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">출처</span>
                {sourceCfg
                  ? <Badge variant={sourceCfg.variant} className="text-[10px] h-5 px-1.5">{sourceCfg.label}</Badge>
                  : <span>—</span>
                }
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">등록일</span>
                <span>{formatDateTime(row.created_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">최종수정</span>
                <span>{formatDateTime(row.operator_last_modified_at)}</span>
              </div>
              {detectedChips.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="min-w-[80px] pt-0.5">AI 비전 분석</span>
                  <div className="flex flex-wrap gap-1">
                    {detectedChips.map((c, i) => (
                      <Badge
                        key={`${c.v}-${i}`}
                        variant="outline"
                        className={`text-[10px] h-5 px-1.5 ${c.cls}`}
                      >
                        {c.v}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* Footer — fixed */}
        <DialogFooter className="shrink-0 gap-2 pt-4 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
            저장
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
};

export default EditSourceableProductDialog;
