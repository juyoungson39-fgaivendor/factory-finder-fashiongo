import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Upload, Sparkles, ImageOff } from 'lucide-react';
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

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────
interface FormState {
  item_name:        string;
  product_no:       string;
  category:         string;
  isCustomCategory: boolean;
  vendor_name:      string;
  unit_price_usd:   string;
  material:         string;
  color_size:       string;
  weight_kg:        string;
  description:      string;
  description_source: string | null;
  manualEdited:     boolean;
  imageFile:        File | null;
  imagePreviewUrl:  string | null;  // blob URL for new file
  removeImage:      boolean;
}

interface Props {
  row:            ProductRow;
  open:           boolean;
  onOpenChange:   (open: boolean) => void;
  queryKey:       string[];
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────
const CUSTOM_CATEGORY_KEY = '__custom__';

function initForm(row: ProductRow): FormState {
  return {
    item_name:        row.item_name    ?? '',
    product_no:       row.product_no   ?? '',
    category:         row.category     ?? '',
    isCustomCategory: false,
    vendor_name:      row.vendor_name  ?? '',
    unit_price_usd:   row.unit_price_usd != null ? String(row.unit_price_usd) : '',
    material:         row.material     ?? '',
    color_size:       row.color_size   ?? '',
    weight_kg:        row.weight_kg    != null ? String(row.weight_kg)    : '',
    description:      row.description  ?? '',
    description_source: row.description_source ?? null,
    manualEdited:     false,
    imageFile:        null,
    imagePreviewUrl:  null,
    removeImage:      false,
  };
}

const str = (v: string | null | undefined) => v ?? '';

const SOURCE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
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
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────
const EditSourceableProductDialog: React.FC<Props> = ({
  row, open, onOpenChange, queryKey,
}) => {
  const queryClient  = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form,      setForm]      = useState<FormState>(() => initForm(row));
  const [saving,    setSaving]    = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  // ── Re-init form when dialog opens or row changes ─────────
  useEffect(() => {
    if (open) setForm(initForm(row));
  }, [row.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup blob URLs on unmount ──────────────────────────
  useEffect(() => {
    return () => {
      if (form.imagePreviewUrl) URL.revokeObjectURL(form.imagePreviewUrl);
    };
  }, [form.imagePreviewUrl]);

  // ── Distinct categories query ─────────────────────────────
  const { data: distinctCategories = [] } = useQuery({
    queryKey: ['distinct-sourceable-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sourceable_products')
        .select('category')
        .not('category', 'is', null)
        .order('category');
      return [...new Set((data ?? []).map((d: any) => d.category).filter(Boolean))] as string[];
    },
    staleTime: 120_000,
    enabled: open,
  });

  // ── Distinct vendors for datalist ─────────────────────────
  const { data: distinctVendors = [] } = useQuery({
    queryKey: ['distinct-sourceable-vendors'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sourceable_products')
        .select('vendor_name')
        .not('vendor_name', 'is', null)
        .order('vendor_name');
      return [...new Set((data ?? []).map((d: any) => d.vendor_name).filter(Boolean))] as string[];
    },
    staleTime: 120_000,
    enabled: open,
  });

  // ── Resolved preview image ────────────────────────────────
  // new file → blob URL; removed → null; else → storage > mirror > original
  const previewSrc: string | null = form.removeImage
    ? null
    : form.imageFile && form.imagePreviewUrl
      ? form.imagePreviewUrl
      : ((row as any).image_url_storage ?? (row as any).image_url_mirror ?? row.image_url ?? null);

  // ── Event handlers ────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (form.imagePreviewUrl) URL.revokeObjectURL(form.imagePreviewUrl);
    const previewUrl = URL.createObjectURL(file);
    setForm(f => ({ ...f, imageFile: file, imagePreviewUrl: previewUrl, removeImage: false }));
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    if (form.imagePreviewUrl) URL.revokeObjectURL(form.imagePreviewUrl);
    setForm(f => ({ ...f, imageFile: null, imagePreviewUrl: null, removeImage: true }));
  };

  const handleCategorySelect = (val: string) => {
    if (val === CUSTOM_CATEGORY_KEY) {
      setForm(f => ({ ...f, category: '', isCustomCategory: true }));
    } else {
      setForm(f => ({ ...f, category: val, isCustomCategory: false }));
    }
  };

  const handleDescriptionChange = (val: string) => {
    setForm(f => ({
      ...f,
      description:      val,
      manualEdited:     true,
      description_source: 'manual',
    }));
  };

  const handleAiRegenerate = async () => {
    // Use persisted image URL (blob URLs can't be used by the Edge Function)
    const imageUrl =
      (row as any).image_url_storage ??
      (row as any).image_url_mirror  ??
      row.image_url                  ??
      undefined;

    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        'generate-product-description',
        {
          body: {
            productId: row.id,
            imageUrl:  imageUrl ?? null,
            category:  form.category  || null,
            material:  form.material  || null,
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

  const handleSave = async () => {
    setSaving(true);
    try {
      let newStorageUrl: string | null = null;

      // ── A. Upload new image ───────────────────────────────
      if (form.imageFile) {
        const ext  = form.imageFile.name.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `products/${row.product_no || row.id}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('factory-photos')
          .upload(path, form.imageFile, { upsert: true, contentType: form.imageFile.type });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from('factory-photos')
          .getPublicUrl(path);
        newStorageUrl = publicUrl;
      }

      // ── B+C. Build diff payload ────────────────────────────
      const payload: Record<string, any> = {};

      if (form.item_name   !== str(row.item_name))    payload.item_name   = form.item_name   || null;
      if (form.product_no  !== str(row.product_no))   payload.product_no  = form.product_no  || null;
      if (form.category    !== str(row.category))     payload.category    = form.category    || null;
      if (form.vendor_name !== str(row.vendor_name))  payload.vendor_name = form.vendor_name || null;
      if (form.material    !== str(row.material))     payload.material    = form.material    || null;
      if (form.color_size  !== str(row.color_size))   payload.color_size  = form.color_size  || null;

      const newPrice  = form.unit_price_usd ? parseFloat(form.unit_price_usd) : null;
      if (newPrice !== ((row.unit_price_usd as number | null | undefined) ?? null))
        payload.unit_price_usd = newPrice;

      const newWeight = form.weight_kg ? parseFloat(form.weight_kg) : null;
      if (newWeight !== ((row.weight_kg as number | null | undefined) ?? null))
        payload.weight_kg = newWeight;

      if (newStorageUrl) {
        payload.image_url_storage = newStorageUrl;
      }
      if (form.removeImage) {
        payload.image_url_storage = null;
        payload.image_url_mirror  = null;
      }

      // description: only persist if user manually edited OR AI generated (non-manual)
      const descChanged = form.description !== str(row.description);
      if (descChanged) {
        payload.description        = form.description || null;
        payload.description_source = form.manualEdited ? 'manual' : (form.description_source ?? 'manual');
      }

      if (Object.keys(payload).length === 0) {
        onOpenChange(false);
        return;
      }

      // ── D. Update ─────────────────────────────────────────
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

  // ── Source badge ──────────────────────────────────────────
  const sourceCfg = row.source
    ? (SOURCE_MAP[row.source] ?? { label: row.source, variant: 'outline' as const })
    : null;

  // ── detected chips ────────────────────────────────────────
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

  const labelCls = 'text-xs font-medium text-muted-foreground block mb-1';
  const sectionCls = 'space-y-3';
  const headingCls = 'text-sm font-semibold text-foreground border-b border-border pb-1.5';

  // ── Show AI badge when source is 'ai' and user hasn't re-edited ──
  const showAiBadge = form.description_source === 'ai' && !form.manualEdited;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>상품 수정</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-2">

          {/* ── 기본 정보 ──────────────────────────────────── */}
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

              {/* 카테고리 */}
              <div>
                <label className={labelCls}>카테고리</label>
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
                    className="mt-1"
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    placeholder="카테고리 직접 입력"
                    autoFocus
                  />
                )}
              </div>

              {/* 소싱처 */}
              <div className="col-span-2">
                <label className={labelCls}>소싱처 (vendor)</label>
                <Input
                  value={form.vendor_name}
                  onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                  placeholder="소싱처명"
                  list="edit-vendor-list"
                />
                <datalist id="edit-vendor-list">
                  {distinctVendors.map(v => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              </div>
            </div>
          </section>

          {/* ── 가격 / 스펙 ────────────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>가격 / 스펙</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>공급가 (USD)</label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.unit_price_usd}
                  onChange={e => setForm(f => ({ ...f, unit_price_usd: e.target.value }))}
                  placeholder="0.00"
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

          {/* ── 이미지 ────────────────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>이미지</h3>
            <div className="flex items-start gap-4">
              {/* 미리보기 */}
              <div className="shrink-0">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="상품 이미지"
                    className="w-24 h-32 object-cover rounded-md border border-border"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                ) : (
                  <div className="w-24 h-32 rounded-md border border-border bg-muted flex flex-col items-center justify-center text-muted-foreground gap-1">
                    <ImageOff className="w-6 h-6" />
                    <span className="text-[10px]">이미지 없음</span>
                  </div>
                )}
              </div>
              {/* 버튼 */}
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-3.5 h-3.5" />
                  이미지 변경
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={handleRemoveImage}
                  disabled={!previewSrc && !form.imageFile}
                >
                  이미지 제거
                </Button>
                {form.imageFile && (
                  <p className="text-[11px] text-muted-foreground max-w-[160px] truncate">
                    {form.imageFile.name}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          </section>

          {/* ── 상품설명 ──────────────────────────────────── */}
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
                직접 편집됨 — 저장 시 description_source가 'manual'로 설정됩니다
              </p>
            )}
          </section>

          {/* ── 메타 (읽기 전용) ──────────────────────────── */}
          <section className={sectionCls}>
            <h3 className={headingCls}>메타 정보</h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              {/* 출처 */}
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">출처</span>
                {sourceCfg
                  ? <Badge variant={sourceCfg.variant} className="text-[10px] h-5 px-1.5">{sourceCfg.label}</Badge>
                  : <span>—</span>
                }
              </div>
              {/* 등록일 */}
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">등록일</span>
                <span>{formatDateTime(row.created_at)}</span>
              </div>
              {/* 최종수정 */}
              <div className="flex items-center gap-2">
                <span className="min-w-[80px]">최종수정</span>
                <span>{formatDateTime(row.operator_last_modified_at)}</span>
              </div>
              {/* AI 비전 분석 결과 */}
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

        <DialogFooter className="gap-2">
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
