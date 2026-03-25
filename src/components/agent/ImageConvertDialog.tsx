import { useState, useCallback, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, ImageIcon, Check, AlertTriangle, Sparkles, Settings, ChevronRight, RefreshCw, ZoomIn, Pause, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { uploadBase64Image } from '@/lib/imageStorage';
import { getVendorModelSettings, type ModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import VendorModelSettingsDialog from '@/components/vendor/VendorModelSettingsDialog';
import { useToast } from '@/hooks/use-toast';

const FALLBACK_IMAGE = 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=300&fit=crop';

interface ConfirmProduct {
  id: number;
  name: string;
  vendor: string;
  vendorColor: string;
  image: string;
  [key: string]: any;
}

interface Props {
  open: boolean;
  onClose: () => void;
  products: ConfirmProduct[];
  onComplete: (convertedImages: Record<number, string>) => void;
  onStandby?: (convertedImages: Record<number, string>) => void;
}

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000',
};

type ConvertStatus = 'idle' | 'converting' | 'converted' | 'error';

export default function ImageConvertDialog({ open, onClose, products, onComplete, onStandby }: Props) {
  const { toast } = useToast();

  // Group products by vendor
  const vendorGroups = useMemo(() => {
    const groups: Record<string, ConfirmProduct[]> = {};
    products.forEach((p) => {
      if (!groups[p.vendor]) groups[p.vendor] = [];
      groups[p.vendor].push(p);
    });
    return groups;
  }, [products]);

  const vendorKeys = useMemo(() => Object.keys(vendorGroups), [vendorGroups]);
  const [activeVendor, setActiveVendor] = useState(vendorKeys[0] || '');
  const [modelSettingsCache, setModelSettingsCache] = useState<Record<string, ModelSettings>>({});
  const [statuses, setStatuses] = useState<Record<number, ConvertStatus>>({});
  const [convertedImages, setConvertedImages] = useState<Record<number, string>>({});
  const [modelSettingsDialogVendor, setModelSettingsDialogVendor] = useState<string | null>(null);
  const [popupImage, setPopupImage] = useState<{ src: string; title: string } | null>(null);
  const [feedbackInputs, setFeedbackInputs] = useState<Record<number, string>>({});
  const [showFeedback, setShowFeedback] = useState<Record<number, boolean>>({});

  // Load model settings for all vendors
  useEffect(() => {
    if (!open) return;
    const cache: Record<string, ModelSettings> = {};
    vendorKeys.forEach((v) => {
      cache[v] = getVendorModelSettings(v.toLowerCase());
    });
    setModelSettingsCache(cache);
    setActiveVendor(vendorKeys[0] || '');
    // Load previously converted images from localStorage
    const cached: Record<number, string> = {};
    products.forEach((p) => {
      const key = `fg_converted_img_${p.vendor.toLowerCase()}_${p.name}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        cached[p.id] = saved;
      }
    });
    setConvertedImages(cached);
    setStatuses(
      Object.fromEntries(products.map((p) => [p.id, cached[p.id] ? 'converted' : 'idle']))
    );
  }, [open, vendorKeys, products]);

  const hasModel = useCallback((vendor: string): boolean => {
    const settings = modelSettingsCache[vendor];
    if (!settings) return false;
    return !!(settings.modelImageUrl && !settings.modelImageUrl.includes('unsplash.com'));
  }, [modelSettingsCache]);

  const handleConvert = useCallback(async (product: ConfirmProduct, feedback?: string) => {
    const vendorId = product.vendor.toLowerCase();
    const settings = modelSettingsCache[product.vendor];
    if (!settings || !hasModel(product.vendor)) return;

    setStatuses((prev) => ({ ...prev, [product.id]: 'converting' }));
    try {
      const body: any = {
        productImageUrl: product.image,
        gender: settings.gender,
        ethnicity: settings.ethnicity,
        bodyType: settings.bodyType,
        pose: settings.pose,
        productName: product.name,
        modelImageUrl: settings.modelImageUrl,
      };
      if (feedback) {
        body.feedback = feedback;
      }

      const { data, error } = await supabase.functions.invoke('convert-product-image', { body });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error('이미지 변환 실패');

      const publicUrl = await uploadBase64Image(data.imageUrl, `converted/${vendorId}`, product.name);
      const cacheKey = `fg_converted_img_${vendorId}_${product.name}`;
      try { localStorage.setItem(cacheKey, publicUrl); } catch {}

      setConvertedImages((prev) => ({ ...prev, [product.id]: publicUrl }));
      setStatuses((prev) => ({ ...prev, [product.id]: 'converted' }));
      // Clear feedback after successful regeneration
      setShowFeedback((prev) => ({ ...prev, [product.id]: false }));
      setFeedbackInputs((prev) => ({ ...prev, [product.id]: '' }));
    } catch (err: any) {
      console.error('Image conversion failed:', err);
      setStatuses((prev) => ({ ...prev, [product.id]: 'error' }));
      toast({ title: '이미지 변환 실패', description: err.message, variant: 'destructive' });
    }
  }, [modelSettingsCache, hasModel, toast]);

  const handleConvertAll = useCallback(async (vendor: string) => {
    const vendorProducts = vendorGroups[vendor] || [];
    const toConvert = vendorProducts.filter((p) => statuses[p.id] !== 'converted' && statuses[p.id] !== 'converting');
    for (const p of toConvert) {
      await handleConvert(p);
    }
  }, [vendorGroups, statuses, handleConvert]);

  const handleConvertAllProducts = useCallback(async () => {
    for (const vendor of vendorKeys) {
      if (!hasModel(vendor)) continue;
      const vendorProducts = vendorGroups[vendor] || [];
      const toConvert = vendorProducts.filter((p) => statuses[p.id] !== 'converted' && statuses[p.id] !== 'converting');
      for (const p of toConvert) {
        await handleConvert(p);
      }
    }
  }, [vendorKeys, vendorGroups, statuses, handleConvert, hasModel]);

  const handleComplete = () => {
    onComplete(convertedImages);
    onClose();
  };

  const handleStandby = () => {
    if (onStandby) {
      onStandby(convertedImages);
    }
    toast({ title: 'Push 대기', description: '변환된 이미지가 대기 상태로 저장되었습니다.' });
    onClose();
  };

  const totalConverted = Object.values(statuses).filter((s) => s === 'converted').length;
  const totalProducts = products.length;
  const isAnyConverting = Object.values(statuses).some((s) => s === 'converting');

  const handleModelSettingsSaved = () => {
    const cache: Record<string, ModelSettings> = {};
    vendorKeys.forEach((v) => {
      cache[v] = getVendorModelSettings(v.toLowerCase());
    });
    setModelSettingsCache(cache);
  };

  const activeProducts = vendorGroups[activeVendor] || [];
  const activeHasModel = hasModel(activeVendor);
  const activeConverted = activeProducts.filter((p) => statuses[p.id] === 'converted').length;
  const activeConverting = activeProducts.some((p) => statuses[p.id] === 'converting');

  // Check if all vendors have all products converted
  const allVendorsComplete = vendorKeys.every((v) => {
    const vProducts = vendorGroups[v] || [];
    return vProducts.every((p) => statuses[p.id] === 'converted');
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          {/* Header with "모든 벤더 Push" button */}
          <DialogHeader className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-purple-600" />
                  AI 모델 이미지 변환
                </DialogTitle>
                <DialogDescription>
                  벤더별 AI 모델로 상품 이미지를 착용샷으로 변환합니다 · {totalConverted}/{totalProducts} 완료
                </DialogDescription>
              </div>
              {allVendorsComplete && totalProducts > 0 && (
                <Button
                  onClick={handleComplete}
                  className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Send className="w-4 h-4" />
                  모든 벤더 한번에 Push
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden border-t border-border mt-4">
            {/* Vendor sidebar */}
            <div className="w-48 border-r border-border bg-muted/30 overflow-y-auto shrink-0">
              {vendorKeys.map((vendor) => {
                const vProducts = vendorGroups[vendor];
                const vConverted = vProducts.filter((p) => statuses[p.id] === 'converted').length;
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
                        style={{ backgroundColor: VENDOR_COLORS[vendor] || '#666' }}
                      >
                        {vendor}
                      </span>
                      {!vHasModel && (
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1.5">
                      <span className="text-[11px] text-muted-foreground">
                        {vConverted}/{vProducts.length} 변환
                      </span>
                      {vConverted === vProducts.length && vProducts.length > 0 && (
                        <Check className="w-3 h-3 text-green-500" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Vendor header */}
              <div className="px-5 py-3 border-b border-border flex items-center justify-between bg-background">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-white px-2 py-0.5 rounded"
                    style={{ backgroundColor: VENDOR_COLORS[activeVendor] || '#666' }}>
                    {activeVendor}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {activeConverted}/{activeProducts.length} 변환 완료
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {activeHasModel ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs gap-1"
                        onClick={() => setModelSettingsDialogVendor(activeVendor.toLowerCase())}
                      >
                        <Settings className="w-3 h-3" /> 모델 설정
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                        onClick={() => handleConvertAll(activeVendor)}
                        disabled={activeConverting || activeConverted === activeProducts.length}
                      >
                        {activeConverting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {activeConverting ? '변환 중...' : '전체 변환'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      className="text-xs gap-1"
                      variant="destructive"
                      onClick={() => setModelSettingsDialogVendor(activeVendor.toLowerCase())}
                    >
                      <AlertTriangle className="w-3 h-3" /> AI 모델 먼저 생성
                    </Button>
                  )}
                </div>
              </div>

              {/* No model warning */}
              {!activeHasModel && (
                <div className="mx-5 mt-4 p-4 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {activeVendor} 벤더의 AI 모델이 생성되지 않았습니다
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      이미지 변환을 위해 먼저 AI 모델을 생성해주세요.
                    </p>
                    <Button
                      size="sm"
                      className="mt-3 text-xs gap-1"
                      onClick={() => setModelSettingsDialogVendor(activeVendor.toLowerCase())}
                    >
                      <Settings className="w-3 h-3" /> 모델 설정으로 이동
                    </Button>
                  </div>
                </div>
              )}

              {/* Products grid */}
              <ScrollArea className="flex-1 p-5">
                <div className="grid grid-cols-3 gap-3">
                  {activeProducts.map((p) => {
                    const status = statuses[p.id] || 'idle';
                    const aiImg = convertedImages[p.id];
                    const isFeedbackOpen = showFeedback[p.id] || false;
                    const feedbackText = feedbackInputs[p.id] || '';
                    return (
                      <div key={p.id} className="rounded-lg border border-border overflow-hidden bg-background">
                        {/* Image pair */}
                        <div className="grid grid-cols-2 gap-0">
                          <div
                            className="relative group cursor-pointer"
                            onClick={() => setPopupImage({ src: p.image, title: `${p.name} (원본)` })}
                          >
                            <img src={p.image} alt={p.name} className="w-full h-28 object-cover" loading="lazy" />
                            <Badge variant="secondary" className="absolute top-1 left-1 text-[9px] px-1 py-0">원본</Badge>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                              <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                          <div
                            className="relative group cursor-pointer"
                            onClick={() => aiImg && setPopupImage({ src: aiImg, title: `${p.name} (AI)` })}
                          >
                            {status === 'converting' ? (
                              <div className="w-full h-28 flex flex-col items-center justify-center bg-muted">
                                <Loader2 className="w-5 h-5 animate-spin text-purple-600 mb-1" />
                                <span className="text-[9px] text-muted-foreground">변환 중...</span>
                              </div>
                            ) : aiImg ? (
                              <>
                                <img src={aiImg} alt={`${p.name} AI`} className="w-full h-28 object-cover" loading="lazy" />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                  <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-28 flex items-center justify-center bg-muted/50">
                                <ImageIcon className="w-5 h-5 text-muted-foreground/30" />
                              </div>
                            )}
                            {status === 'converted' && (
                              <Badge className="absolute top-1 right-1 text-[9px] px-1 py-0 bg-green-500 text-white border-0">✓</Badge>
                            )}
                            {status === 'error' && (
                              <Badge className="absolute top-1 right-1 text-[9px] px-1 py-0 bg-destructive text-white border-0">✕</Badge>
                            )}
                          </div>
                        </div>
                        {/* Info & Actions */}
                        <div className="p-2 space-y-1.5">
                          <p className="text-[11px] font-medium truncate">{p.name}</p>

                          {/* Generate button for idle */}
                          {activeHasModel && status === 'idle' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-[10px] h-7 gap-1"
                              onClick={() => handleConvert(p)}
                            >
                              <Sparkles className="w-3 h-3" /> 이미지 생성
                            </Button>
                          )}

                          {/* Converted: regenerate with feedback */}
                          {status === 'converted' && (
                            <div className="space-y-1">
                              {!isFeedbackOpen ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-[10px] h-7 gap-1"
                                  onClick={() => setShowFeedback((prev) => ({ ...prev, [p.id]: true }))}
                                >
                                  <RefreshCw className="w-3 h-3" /> 다시 생성
                                </Button>
                              ) : (
                                <div className="space-y-1.5">
                                  <Textarea
                                    placeholder="수정사항을 입력하세요 (예: 포즈를 바꿔주세요, 배경을 밝게)"
                                    value={feedbackText}
                                    onChange={(e) => setFeedbackInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                    rows={2}
                                    className="text-[10px] resize-none"
                                  />
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="flex-1 text-[10px] h-6"
                                      onClick={() => setShowFeedback((prev) => ({ ...prev, [p.id]: false }))}
                                    >
                                      취소
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="flex-1 text-[10px] h-6 gap-1 bg-purple-600 hover:bg-purple-700 text-white"
                                      onClick={() => handleConvert(p, feedbackText)}
                                      disabled={!feedbackText.trim()}
                                    >
                                      <RefreshCw className="w-2.5 h-2.5" /> 재생성
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Error: retry */}
                          {status === 'error' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full text-[10px] h-7 gap-1 text-destructive"
                              onClick={() => handleConvert(p)}
                            >
                              <RefreshCw className="w-3 h-3" /> 재시도
                            </Button>
                          )}

                          {/* Converting spinner */}
                          {status === 'converting' && (
                            <Button variant="outline" size="sm" className="w-full text-[10px] h-7" disabled>
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Convert all products across all vendors */}
                {vendorKeys.some((v) => hasModel(v)) && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <Button
                      className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                      onClick={handleConvertAllProducts}
                      disabled={isAnyConverting || totalConverted === totalProducts}
                    >
                      {isAnyConverting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      {isAnyConverting ? '전체 변환 진행 중...' : `전상품 한번에 이미지 생성 (${totalProducts - totalConverted}개 남음)`}
                    </Button>
                  </div>
                )}
              </ScrollArea>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {totalConverted}/{totalProducts} 상품 변환 완료
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose}>취소</Button>
              <Button
                variant="outline"
                onClick={handleStandby}
                className="gap-1"
              >
                <Pause className="w-4 h-4" />
                Push 대기
              </Button>
              <Button
                onClick={handleComplete}
                className="gap-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Check className="w-4 h-4" />
                {totalConverted > 0
                  ? `변환 완료 Push (${totalConverted}개)`
                  : '변환 없이 Push 진행'}
                <ChevronRight className="w-4 h-4" />
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
          onOpenChange={(v) => { if (!v) setModelSettingsDialogVendor(null); }}
          vendorId={modelSettingsDialogVendor}
          vendorName={modelSettingsDialogVendor.toUpperCase()}
          onSaved={handleModelSettingsSaved}
        />
      )}
    </>
  );
}
