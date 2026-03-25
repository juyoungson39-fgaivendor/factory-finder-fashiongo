import { useState, useCallback, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ImageIcon, Check, AlertTriangle, Sparkles, Settings, ChevronRight, RefreshCw, ZoomIn, Pause, Lock, Unlock, Package } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadBase64Image } from '@/lib/imageStorage';
import { getVendorModelSettings, type ModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import VendorModelSettingsDialog from '@/components/vendor/VendorModelSettingsDialog';
import { AI_VENDORS } from '@/integrations/va-api/vendor-config';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

/** FashionGo required fields for product registration */
const FG_FIELDS: Array<{ key: string; label: string; required: boolean; type?: string }> = [
  { key: 'item_name', label: '상품명', required: true },
  { key: 'category', label: '카테고리', required: true },
  { key: 'price', label: '판매가($)', required: true, type: 'number' },
  { key: 'material', label: '소재', required: false },
  { key: 'color_size', label: '컬러/사이즈', required: false },
  { key: 'weight_kg', label: '중량(kg)', required: false, type: 'number' },
];

interface SourceProduct {
  id: string;
  product_no?: string | null;
  item_name?: string | null;
  category?: string | null;
  price?: number | null;
  material?: string | null;
  color_size?: string | null;
  weight_kg?: number | null;
  image_url?: string | null;
  vendor_name?: string | null;
  [key: string]: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  products: SourceProduct[];
}

type ConvertStatus = 'idle' | 'converting' | 'converted' | 'error';
type VendorStatus = 'editing' | 'confirmed' | 'hold';

const VENDOR_COLORS: Record<string, string> = {};
AI_VENDORS.forEach(v => { VENDOR_COLORS[v.name.toUpperCase()] = v.color; });

export default function FGDataConvertDialog({ open, onClose, products }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();

  // Vendor assignment: map product id -> vendor name
  const [vendorAssignments, setVendorAssignments] = useState<Record<string, string>>({});

  // FG data edits per product
  const [fgEdits, setFgEdits] = useState<Record<string, Record<string, any>>>({});

  // Image conversion
  const [statuses, setStatuses] = useState<Record<string, ConvertStatus>>({});
  const [convertedImages, setConvertedImages] = useState<Record<string, string>>({});

  // Vendor-level status
  const [vendorStatuses, setVendorStatuses] = useState<Record<string, VendorStatus>>({});

  // Model settings
  const [modelSettingsCache, setModelSettingsCache] = useState<Record<string, ModelSettings>>({});
  const [modelSettingsDialogVendor, setModelSettingsDialogVendor] = useState<string | null>(null);

  // Active vendor tab
  const [activeVendor, setActiveVendor] = useState('');

  // Popup image
  const [popupImage, setPopupImage] = useState<{ src: string; title: string } | null>(null);

  // Product-level data confirm
  const [confirmedProducts, setConfirmedProducts] = useState<Set<string>>(new Set());

  // Group products by vendor
  const vendorGroups = useMemo(() => {
    const groups: Record<string, SourceProduct[]> = {};
    products.forEach(p => {
      const vendor = vendorAssignments[p.id] || p.vendor_name || '미배정';
      if (!groups[vendor]) groups[vendor] = [];
      groups[vendor].push(p);
    });
    return groups;
  }, [products, vendorAssignments]);

  const vendorKeys = useMemo(() => Object.keys(vendorGroups), [vendorGroups]);

  // Initialize
  useEffect(() => {
    if (!open) return;

    // Init vendor assignments from existing data
    const assignments: Record<string, string> = {};
    const edits: Record<string, Record<string, any>> = {};
    products.forEach(p => {
      assignments[p.id] = p.vendor_name || '미배정';
      edits[p.id] = {
        item_name: p.item_name || '',
        category: p.category || '',
        price: p.price || '',
        material: p.material || '',
        color_size: p.color_size || '',
        weight_kg: p.weight_kg || '',
      };
    });
    setVendorAssignments(assignments);
    setFgEdits(edits);

    // Load model settings for AI_VENDORS + any vendor names found in products
    const cache: Record<string, ModelSettings> = {};
    AI_VENDORS.forEach(v => {
      cache[v.name.toUpperCase()] = getVendorModelSettings(v.id);
    });
    // Also load for product vendor names not in AI_VENDORS
    const productVendorNames = new Set(products.map(p => (p.vendor_name || '').toUpperCase()).filter(Boolean));
    productVendorNames.forEach(vName => {
      if (!cache[vName]) {
        cache[vName] = getVendorModelSettings(vName.toLowerCase());
      }
    });
    setModelSettingsCache(cache);

    if (vendorKeys.length > 0) setActiveVendor(vendorKeys[0]);

    // Load previously converted images
    const loadConverted = async () => {
      if (!user) return;
      const ids = products.map(p => p.id);
      // Use product_no as product_id reference
      const { data } = await supabase
        .from('converted_product_images')
        .select('product_id, converted_image_url, vendor_key')
        .eq('user_id', user.id);
      if (data) {
        const cached: Record<string, string> = {};
        const sts: Record<string, ConvertStatus> = {};
        data.forEach((row: any) => {
          // Match by string
          const matchProduct = products.find(p => String(p.product_no) === String(row.product_id) || p.id === String(row.product_id));
          if (matchProduct) {
            cached[matchProduct.id] = row.converted_image_url;
            sts[matchProduct.id] = 'converted';
          }
        });
        setConvertedImages(cached);
        setStatuses(prev => ({ ...prev, ...sts }));
      }
    };
    loadConverted();
  }, [open, products, user]);

  // Update active vendor when vendorKeys change
  useEffect(() => {
    if (vendorKeys.length > 0 && !vendorKeys.includes(activeVendor)) {
      setActiveVendor(vendorKeys[0]);
    }
  }, [vendorKeys, activeVendor]);

  const hasModel = useCallback((vendorName: string): boolean => {
    const settings = modelSettingsCache[vendorName.toUpperCase()];
    if (!settings) return false;
    return !!(settings.modelImageUrl && !settings.modelImageUrl.includes('unsplash.com'));
  }, [modelSettingsCache]);

  const handleConvert = useCallback(async (product: SourceProduct) => {
    const vendorName = vendorAssignments[product.id] || product.vendor_name || '';
    const vendorConfig = AI_VENDORS.find(v => v.name.toUpperCase() === vendorName.toUpperCase());
    const settings = modelSettingsCache[vendorName.toUpperCase()];
    if (!settings || !hasModel(vendorName)) return;

    setStatuses(prev => ({ ...prev, [product.id]: 'converting' }));
    try {
      const { data, error } = await supabase.functions.invoke('convert-product-image', {
        body: {
          productImageUrl: product.image_url,
          gender: settings.gender,
          ethnicity: settings.ethnicity,
          bodyType: settings.bodyType,
          pose: settings.pose,
          productName: product.item_name,
          modelImageUrl: settings.modelImageUrl,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error('이미지 변환 실패');

      const vendorId = vendorConfig?.id || 'unknown';
      const publicUrl = await uploadBase64Image(data.imageUrl, `converted/${vendorId}`, product.item_name || product.product_no || 'product');

      if (user) {
        await supabase.from('converted_product_images').upsert({
          user_id: user.id,
          product_id: parseInt(product.product_no || '0') || 0,
          product_name: product.item_name || '',
          vendor_key: vendorId,
          original_image_url: product.image_url,
          converted_image_url: publicUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,product_id,vendor_key' });
      }

      setConvertedImages(prev => ({ ...prev, [product.id]: publicUrl }));
      setStatuses(prev => ({ ...prev, [product.id]: 'converted' }));
    } catch (err: any) {
      console.error('Image conversion failed:', err);
      setStatuses(prev => ({ ...prev, [product.id]: 'error' }));
      toast({ title: '이미지 변환 실패', description: err.message, variant: 'destructive' });
    }
  }, [vendorAssignments, modelSettingsCache, hasModel, toast, user]);

  const handleConvertAllVendor = useCallback(async (vendor: string) => {
    const vProducts = vendorGroups[vendor] || [];
    for (const p of vProducts) {
      if (statuses[p.id] !== 'converted' && statuses[p.id] !== 'converting') {
        await handleConvert(p);
      }
    }
  }, [vendorGroups, statuses, handleConvert]);

  const handleConfirmProduct = (productId: string) => {
    setConfirmedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleVendorConfirm = (vendor: string) => {
    setVendorStatuses(prev => ({ ...prev, [vendor]: 'confirmed' }));
    toast({ title: `${vendor} 확정`, description: '해당 벤더의 상품이 확정되었습니다.' });
  };

  const handleVendorHold = (vendor: string) => {
    setVendorStatuses(prev => ({ ...prev, [vendor]: 'hold' }));
    toast({ title: `${vendor} 홀딩`, description: '해당 벤더의 상품이 홀딩 상태로 전환되었습니다.' });
  };

  const handleVendorUnlock = (vendor: string) => {
    setVendorStatuses(prev => ({ ...prev, [vendor]: 'editing' }));
  };

  const handleModelSettingsSaved = () => {
    const cache: Record<string, ModelSettings> = {};
    AI_VENDORS.forEach(v => {
      cache[v.name.toUpperCase()] = getVendorModelSettings(v.id);
    });
    setModelSettingsCache(cache);
  };

  const updateFgField = (productId: string, field: string, value: any) => {
    setFgEdits(prev => ({
      ...prev,
      [productId]: { ...prev[productId], [field]: value },
    }));
  };

  const isProductDataComplete = (productId: string) => {
    const edit = fgEdits[productId];
    if (!edit) return false;
    return FG_FIELDS.filter(f => f.required).every(f => {
      const val = edit[f.key];
      return val !== '' && val !== null && val !== undefined;
    });
  };

  const activeProducts = vendorGroups[activeVendor] || [];
  const activeVendorStatus = vendorStatuses[activeVendor] || 'editing';
  const activeHasModel = hasModel(activeVendor);
  const activeConverted = activeProducts.filter(p => statuses[p.id] === 'converted').length;
  const activeConfirmed = activeProducts.filter(p => confirmedProducts.has(p.id)).length;
  const activeAllDataComplete = activeProducts.every(p => isProductDataComplete(p.id));
  const activeAllConverted = activeConverted === activeProducts.length && activeProducts.length > 0;
  const activeAllConfirmed = activeConfirmed === activeProducts.length && activeProducts.length > 0;

  const totalConfirmedVendors = vendorKeys.filter(v => vendorStatuses[v] === 'confirmed' || vendorStatuses[v] === 'hold').length;

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5 text-primary" />
                  FG 데이터 변환
                </DialogTitle>
                <DialogDescription>
                  FashionGo 등록 데이터 확인 · 이미지 변환 · 벤더별 확정/홀딩 · {totalConfirmedVendors}/{vendorKeys.length} 벤더 처리
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden border-t border-border mt-4">
            {/* Vendor sidebar */}
            <div className="w-52 border-r border-border bg-muted/30 overflow-y-auto shrink-0">
              {vendorKeys.map(vendor => {
                const vProducts = vendorGroups[vendor];
                const vConverted = vProducts.filter(p => statuses[p.id] === 'converted').length;
                const vConfirmed = vProducts.filter(p => confirmedProducts.has(p.id)).length;
                const vStatus = vendorStatuses[vendor] || 'editing';
                const vHasModel = hasModel(vendor);
                return (
                  <button
                    key={vendor}
                    onClick={() => setActiveVendor(vendor)}
                    className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${
                      activeVendor === vendor ? 'bg-background' : 'hover:bg-muted/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: VENDOR_COLORS[vendor.toUpperCase()] || '#666' }}
                      >
                        {vendor}
                      </span>
                      {vStatus === 'confirmed' && <Check className="w-3.5 h-3.5 text-green-500" />}
                      {vStatus === 'hold' && <Pause className="w-3.5 h-3.5 text-warning" />}
                      {!vHasModel && <AlertTriangle className="w-3.5 h-3.5 text-warning" />}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
                      <span>🖼 {vConverted}/{vProducts.length}</span>
                      <span>✓ {vConfirmed}/{vProducts.length}</span>
                    </div>
                    {vStatus !== 'editing' && (
                      <Badge variant={vStatus === 'confirmed' ? 'default' : 'secondary'} className="mt-1 text-[9px]">
                        {vStatus === 'confirmed' ? '확정' : '홀딩'}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Vendor header */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-background">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded"
                    style={{ backgroundColor: VENDOR_COLORS[activeVendor.toUpperCase()] || '#666' }}>
                    {activeVendor}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    이미지 {activeConverted}/{activeProducts.length} · 데이터확인 {activeConfirmed}/{activeProducts.length}
                  </span>
                  {activeVendorStatus !== 'editing' && (
                    <Badge variant={activeVendorStatus === 'confirmed' ? 'default' : 'secondary'} className="text-[10px]">
                      {activeVendorStatus === 'confirmed' ? '✅ 확정됨' : '⏸ 홀딩중'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {activeVendorStatus === 'editing' ? (
                    <>
                      {!activeHasModel ? (
                        <Button size="sm" variant="destructive" className="text-xs gap-1"
                          onClick={() => {
                            const vendorConfig = AI_VENDORS.find(v => v.name.toUpperCase() === activeVendor.toUpperCase());
                            setModelSettingsDialogVendor(vendorConfig?.id || activeVendor.toLowerCase());
                          }}>
                          <AlertTriangle className="w-3 h-3" /> AI 모델 먼저 생성
                        </Button>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="text-xs gap-1"
                            onClick={() => {
                              const vendorConfig = AI_VENDORS.find(v => v.name.toUpperCase() === activeVendor.toUpperCase());
                              setModelSettingsDialogVendor(vendorConfig?.id || activeVendor.toLowerCase());
                            }}>
                            <Settings className="w-3 h-3" /> 모델 설정
                          </Button>
                          <Button size="sm" className="text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                            onClick={() => handleConvertAllVendor(activeVendor)}
                            disabled={activeAllConverted}>
                            <Sparkles className="w-3 h-3" /> 전체 이미지 변환
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <Button variant="outline" size="sm" className="text-xs gap-1"
                      onClick={() => handleVendorUnlock(activeVendor)}>
                      <Unlock className="w-3 h-3" /> 잠금 해제
                    </Button>
                  )}
                </div>
              </div>

              {/* No model warning */}
              {!activeHasModel && activeVendorStatus === 'editing' && (
                <div className="mx-5 mt-4 p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">{activeVendor} 벤더의 AI 모델이 없습니다</p>
                    <p className="text-xs text-muted-foreground mt-1">이미지 변환 전 AI 모델을 먼저 생성해야 합니다.</p>
                  </div>
                </div>
              )}

              {/* Products list */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {activeProducts.map(p => {
                    const status = statuses[p.id] || 'idle';
                    const aiImg = convertedImages[p.id];
                    const edit = fgEdits[p.id] || {};
                    const isConfirmed = confirmedProducts.has(p.id);
                    const dataComplete = isProductDataComplete(p.id);
                    const isLocked = activeVendorStatus !== 'editing';

                    return (
                      <div key={p.id} className={`rounded-lg border overflow-hidden ${isConfirmed ? 'border-green-300 bg-green-50/30' : 'border-border bg-background'}`}>
                        <div className="flex gap-0">
                          {/* Image section */}
                          <div className="w-36 shrink-0 flex">
                            <div className="w-1/2 relative cursor-pointer group"
                              onClick={() => p.image_url && setPopupImage({ src: p.image_url, title: `${p.product_no} 원본` })}>
                              {p.image_url ? (
                                <img src={p.image_url} alt="" className="w-full h-24 object-cover" />
                              ) : (
                                <div className="w-full h-24 bg-muted flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 text-muted-foreground/30" />
                                </div>
                              )}
                              <Badge variant="secondary" className="absolute top-1 left-1 text-[8px] px-1 py-0">원본</Badge>
                            </div>
                            <div className="w-1/2 relative cursor-pointer group"
                              onClick={() => aiImg && setPopupImage({ src: aiImg, title: `${p.product_no} AI` })}>
                              {status === 'converting' ? (
                                <div className="w-full h-24 flex items-center justify-center bg-muted">
                                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                                </div>
                              ) : aiImg ? (
                                <img src={aiImg} alt="" className="w-full h-24 object-cover" />
                              ) : (
                                <div className="w-full h-24 bg-muted/50 flex items-center justify-center">
                                  <ImageIcon className="w-4 h-4 text-muted-foreground/20" />
                                </div>
                              )}
                              {status === 'converted' && <Badge className="absolute top-1 right-1 text-[8px] px-1 py-0 bg-green-500 text-white border-0">✓</Badge>}
                              {status === 'error' && <Badge className="absolute top-1 right-1 text-[8px] px-1 py-0 bg-destructive text-white border-0">✕</Badge>}
                            </div>
                          </div>

                          {/* Data fields */}
                          <div className="flex-1 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-mono font-bold text-muted-foreground">{p.product_no || '-'}</span>
                              {!dataComplete && <Badge variant="outline" className="text-[9px] text-warning border-warning/30">필수 항목 누락</Badge>}
                              {isConfirmed && <Badge className="text-[9px] bg-green-500 text-white border-0">✓ 확인완료</Badge>}
                            </div>
                            <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                              {FG_FIELDS.map(field => (
                                <div key={field.key}>
                                  <label className="text-[9px] text-muted-foreground flex items-center gap-1">
                                    {field.label}
                                    {field.required && <span className="text-destructive">*</span>}
                                  </label>
                                  <Input
                                    value={edit[field.key] ?? ''}
                                    onChange={e => updateFgField(p.id, field.key, field.type === 'number' ? e.target.value : e.target.value)}
                                    className="h-7 text-xs mt-0.5"
                                    type={field.type === 'number' ? 'number' : 'text'}
                                    disabled={isLocked}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="w-24 shrink-0 p-2 flex flex-col items-center justify-center gap-1.5 border-l border-border">
                            {!isLocked && activeHasModel && status !== 'converted' && status !== 'converting' && (
                              <Button variant="outline" size="sm" className="w-full text-[9px] h-7 gap-1" onClick={() => handleConvert(p)}>
                                <Sparkles className="w-3 h-3" /> 변환
                              </Button>
                            )}
                            {status === 'converted' && !isLocked && (
                              <Button variant="outline" size="sm" className="w-full text-[9px] h-7 gap-1" onClick={() => handleConvert(p)}>
                                <RefreshCw className="w-3 h-3" /> 재변환
                              </Button>
                            )}
                            {status === 'error' && !isLocked && (
                              <Button variant="outline" size="sm" className="w-full text-[9px] h-7 gap-1 text-destructive" onClick={() => handleConvert(p)}>
                                <RefreshCw className="w-3 h-3" /> 재시도
                              </Button>
                            )}
                            {!isLocked && (
                              <Button
                                variant={isConfirmed ? 'default' : 'outline'}
                                size="sm"
                                className={`w-full text-[9px] h-7 gap-1 ${isConfirmed ? 'bg-green-600 hover:bg-green-700 text-white' : ''}`}
                                onClick={() => handleConfirmProduct(p.id)}
                                disabled={!dataComplete}
                              >
                                <Check className="w-3 h-3" /> {isConfirmed ? '확인됨' : '확인'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              {/* Vendor action footer */}
              {activeVendorStatus === 'editing' && activeProducts.length > 0 && (
                <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    {activeAllConfirmed && activeAllConverted
                      ? '✅ 모든 상품 준비 완료'
                      : `이미지 ${activeConverted}/${activeProducts.length} · 데이터 ${activeConfirmed}/${activeProducts.length}`}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="text-xs gap-1"
                      onClick={() => handleVendorHold(activeVendor)}>
                      <Pause className="w-3 h-3" /> 홀딩
                    </Button>
                    <Button size="sm" className="text-xs gap-1"
                      onClick={() => handleVendorConfirm(activeVendor)}
                      disabled={!activeAllConfirmed || !activeAllConverted}>
                      <Lock className="w-3 h-3" /> 확정
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Global footer */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {totalConfirmedVendors}/{vendorKeys.length} 벤더 처리 완료
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>닫기</Button>
              <Button
                onClick={onClose}
                disabled={totalConfirmedVendors === 0}
                className="gap-1"
              >
                <ChevronRight className="w-4 h-4" />
                등록 단계로 이동 ({totalConfirmedVendors}개 벤더)
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image popup */}
      {popupImage && (
        <Dialog open={!!popupImage} onOpenChange={() => setPopupImage(null)}>
          <DialogContent className="max-w-3xl p-2 sm:p-4">
            <DialogHeader className="sr-only">
              <DialogTitle>{popupImage.title}</DialogTitle>
              <DialogDescription>이미지 확대</DialogDescription>
            </DialogHeader>
            <img src={popupImage.src} alt={popupImage.title} className="max-h-[80vh] w-auto object-contain rounded-lg mx-auto" />
          </DialogContent>
        </Dialog>
      )}

      {/* Model Settings Dialog */}
      {modelSettingsDialogVendor && (
        <VendorModelSettingsDialog
          open={!!modelSettingsDialogVendor}
          onOpenChange={v => { if (!v) setModelSettingsDialogVendor(null); }}
          vendorId={modelSettingsDialogVendor}
          vendorName={modelSettingsDialogVendor.toUpperCase()}
          onSaved={handleModelSettingsSaved}
        />
      )}
    </>
  );
}
