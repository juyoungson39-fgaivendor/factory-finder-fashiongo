import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Factory, Loader2, Check, RefreshCw, MessageSquare, ChevronLeft, ChevronRight, X, ZoomIn, Sparkles } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import FGRegistrationSheet from '@/components/vendor/FGRegistrationSheet';
import { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { useSyncRegisteredProductStatus } from '@/integrations/supabase/hooks/use-fg-registered-products';
import { getVendorById } from '@/integrations/va-api/vendor-config';
import { supabase } from '@/integrations/supabase/client';
import { uploadBase64Image } from '@/lib/imageStorage';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

// --- AI Vendor persona data (concept & palette are non-derivable from API) ---

const VENDOR_PERSONA: Record<string, { concept: string; palette: string[] }> = {
  basic: { concept: 'FashionGo 바이어에게 가장 많이 선택되는 뉴트럴 베이직 라인입니다. 데일리 착용에 최적화된 심플한 디자인으로 시즌 무관 꾸준히 판매됩니다.', palette: ['#1A1A1A', '#F5F5F0', '#A3A3A3'] },
  curve: { concept: '다양한 체형의 바이어를 위한 플러스사이즈 전문 라인입니다. 사이즈 인클루시브 트렌드에 맞춰 급성장 중인 카테고리입니다.', palette: ['#D60000', '#FFC0CB', '#8B0000'] },
  denim: { concept: '시즌 무관 스테디셀러인 데님 전문 라인입니다. 워시드부터 인디고까지 다양한 데님 아이템을 커버합니다.', palette: ['#1E3A5F', '#4A90D9', '#A0C4FF'] },
  vacation: { concept: '여름 시즌과 리조트 라이프스타일을 담은 라인입니다. 코스탈 감성의 스윔웨어와 린넨 아이템을 중심으로 구성됩니다.', palette: ['#F59E0B', '#FDE68A', '#92400E'] },
  festival: { concept: '미국 주요 시즌 이벤트에 최적화된 라인입니다. 4th of July, 프롬, 마르디그라, 홀리데이 등 이벤트별 특화 상품을 선별합니다.', palette: ['#7C3AED', '#C4B5FD', '#4C1D95'] },
  trend: { concept: 'TikTok과 Instagram에서 바이럴 중인 트렌드 아이템 라인입니다. 빠른 트렌드 사이클에 대응하여 SNS 급상승 상품을 선제 발굴합니다.', palette: ['#EC4899', '#FBCFE8', '#9D174D'] },
};

// --- Components ---

type VendorProduct = { name: string; nameKor?: string; styleNo: string; price: number; yuan?: number; img: string };

const getUsd = (yuan: number | undefined) => {
  const val = yuan ?? 0;
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  return (val / rate * multiplier).toFixed(2);
};

const VENDOR_DATA: Record<string, { color: string }> = {
  basic: { color: '#1A1A1A' },
  curve: { color: '#D60000' },
  denim: { color: '#1E3A5F' },
  vacation: { color: '#F59E0B' },
  festival: { color: '#7C3AED' },
  trend: { color: '#EC4899' },
};
type ProductStatus = 'idle' | 'converting' | 'converted' | 'registering' | 'registered' | 'feedback';

const ProductCard = ({
  product,
  status,
  convertedImg,
  selected,
  onToggleSelect,
  onConvert,
  onRetry,
  onRegisterClick,
  onFeedback,
  onImageClick,
  feedbackNote,
}: {
  product: VendorProduct;
  status: ProductStatus;
  convertedImg?: string;
  selected: boolean;
  onToggleSelect: () => void;
  onConvert: () => void;
  onRetry: () => void;
  onRegisterClick: () => void;
  onFeedback: () => void;
  onImageClick: (type: 'original' | 'ai') => void;
  feedbackNote?: string;
}) => {
  const converted = status === 'converted' || status === 'registering' || status === 'registered' || status === 'feedback';
  const aiImgSrc = convertedImg || product.img;

  return (
    <Card className={`overflow-hidden transition-shadow ${selected ? 'ring-2 ring-primary shadow-md' : ''}`}>
      <CardContent className="p-0">
        {/* Checkbox */}
        <div className="px-3 pt-2 flex items-center gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            className="h-4 w-4"
          />
          <span className="text-[10px] text-muted-foreground">선택</span>
        </div>

        {/* Image pair */}
        <div className="grid grid-cols-2 gap-0 mt-1">
          <div className="relative group cursor-pointer" onClick={() => onImageClick('original')}>
            {product.img ? (
              <img src={product.img} alt={product.name} className="w-full h-40 object-cover" loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.img-fallback')?.classList.remove('hidden'); }}
              />
            ) : null}
            <div className={`img-fallback w-full h-40 flex items-center justify-center bg-muted text-muted-foreground text-xs ${product.img ? 'hidden' : ''}`}>No Image</div>
            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">원본</Badge>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
              <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
            </div>
          </div>
          <div className="relative group cursor-pointer" onClick={() => onImageClick('ai')}>
            {status === 'converting' ? (
              <div className="w-full h-40 flex flex-col items-center justify-center bg-muted">
                <Loader2 className="w-6 h-6 animate-spin text-primary mb-1" />
                <span className="text-[10px] text-muted-foreground">AI 변환 중...</span>
              </div>
            ) : (
              <>
                <img src={aiImgSrc} alt={`${product.name} AI`} className="w-full h-40 object-cover" loading="lazy"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.ai-img-fallback')?.classList.remove('hidden'); }}
                />
                <div className="ai-img-fallback hidden w-full h-40 flex items-center justify-center bg-muted text-muted-foreground text-xs">AI Image</div>
              </>
            )}
            <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-destructive text-destructive-foreground border-0">AI 모델</Badge>
            {converted && (
              <Badge className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0 bg-success text-white border-0">✓ 변환완료</Badge>
            )}
            {status !== 'converting' && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <p className="text-sm font-bold truncate">{product.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{product.styleNo}</p>
          <span className="text-sm font-bold text-destructive">${product.price.toFixed(2)}</span>

          {status === 'idle' && (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={onConvert}>모델 변환</Button>
          )}
          {status === 'converting' && (
            <Button variant="outline" size="sm" className="w-full text-xs" disabled>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> AI 변환 중...
            </Button>
          )}
          {(status === 'converted' || status === 'feedback') && (
            <div className="space-y-1.5">
              <Button size="sm" className="w-full text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={onRegisterClick}>
                FashionGo 등록
              </Button>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={onRetry}>
                  <RefreshCw className="w-3 h-3" /> 다시 생성
                </Button>
                <Button variant="outline" size="sm" className="flex-1 text-xs gap-1" onClick={onFeedback}>
                  <MessageSquare className="w-3 h-3" /> 피드백
                </Button>
              </div>
              {feedbackNote && (
                <p className="text-[10px] text-muted-foreground bg-muted rounded px-2 py-1 truncate">💬 {feedbackNote}</p>
              )}
            </div>
          )}
          {status === 'registering' && (
            <Button size="sm" className="w-full text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground" disabled>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> 등록 중...
            </Button>
          )}
          {status === 'registered' && (
            <div className="space-y-1.5">
              <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                <Check className="w-3 h-3 mr-1" /> 등록완료
              </Button>
              <Button variant="outline" size="sm" className="w-full text-xs gap-1" onClick={onRetry}>
                <RefreshCw className="w-3 h-3" /> 다시 생성
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// --- Image Popup ---
const ImagePopup = ({ open, onClose, imgSrc, title }: { open: boolean; onClose: () => void; imgSrc: string; title: string }) => (
  <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
    <DialogContent className="max-w-3xl p-2 sm:p-4">
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>이미지 확대 보기</DialogDescription>
      </DialogHeader>
      <div className="relative flex items-center justify-center">
        <img src={imgSrc} alt={title} className="max-h-[80vh] w-auto object-contain rounded-lg" />
      </div>
      <p className="text-center text-sm text-muted-foreground mt-1 truncate">{title}</p>
    </DialogContent>
  </Dialog>
);

// --- Bulk Registration Wizard ---
const BulkRegistrationDialog = ({
  open,
  onClose,
  selectedProducts,
  convertedImages,
  vendorName,
  onConfirmAll,
}: {
  open: boolean;
  onClose: () => void;
  selectedProducts: { product: VendorProduct; idx: number }[];
  convertedImages: Record<number, string>;
  vendorName: string;
  onConfirmAll: () => void;
}) => {
  const [currentPage, setCurrentPage] = useState(0);
  const total = selectedProducts.length;
  const current = selectedProducts[currentPage];

  // Reset page when opening
  useEffect(() => {
    if (open) setCurrentPage(0);
  }, [open]);

  if (!current) return null;

  const usd = getUsd(current.product.yuan);
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  const msrpMult = parseFloat(localStorage.getItem('fg_msrp_multiplier') || '2');
  const price = (current.product.yuan / rate * multiplier);
  const msrp = (price * msrpMult).toFixed(2);
  const aiImg = convertedImages[current.idx] || current.product.img;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>FashionGo 일괄 등록</span>
            <Badge variant="outline" className="text-xs font-normal">
              {currentPage + 1} / {total}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            선택한 {total}개 상품을 확인하고 등록하세요
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-4 pb-4">
            {/* Product images */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground text-center">원본 이미지</p>
                <div className="rounded-lg overflow-hidden border border-border aspect-[3/4] bg-secondary/20">
                  <img src={current.product.img} alt="원본" className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground text-center">AI 모델 이미지</p>
                <div className="rounded-lg overflow-hidden border border-primary/30 aspect-[3/4] bg-secondary/20 ring-1 ring-primary/10">
                  <img src={aiImg} alt="AI 모델" className="w-full h-full object-cover" />
                </div>
              </div>
            </div>

            <Separator />

            {/* Product info */}
            <div className="space-y-3">
              <h3 className="font-bold text-base">{current.product.nameKor}</h3>
              <p className="text-sm text-muted-foreground">{current.product.name}</p>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">벤더</span>
                    <Badge className="text-[10px]" style={{ backgroundColor: VENDOR_DATA[vendorName.toLowerCase()]?.color || 'hsl(var(--primary))' }}>
                      {vendorName}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">원가</span>
                    <span>¥{current.product.yuan}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">판매가</span>
                    <span className="font-bold text-destructive">${usd}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">MSRP</span>
                    <span>${msrp}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">시즌</span>
                    <span>All Season</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Made In</span>
                    <span>China</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Min Qty</span>
                    <span>6</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Weight</span>
                    <span>0.5 lb</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Navigation + Confirm */}
        <div className="flex items-center justify-between pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => p - 1)}
            disabled={currentPage === 0}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> 이전
          </Button>

          <div className="flex gap-1.5">
            {selectedProducts.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentPage(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === currentPage ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              />
            ))}
          </div>

          {currentPage < total - 1 ? (
            <Button
              size="sm"
              onClick={() => setCurrentPage(p => p + 1)}
              className="gap-1"
            >
              다음 <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={onConfirmAll}
            >
              <Check className="w-4 h-4" /> {total}개 전체 등록
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// --- Main Page ---

const CACHE_KEY_PREFIX = 'fg_converted_img_';

const AIVendorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const vendorConfig = getVendorById(id || '');
  const persona = VENDOR_PERSONA[id || ''];

  // Merged vendor object: config (name/color/position/categories) + persona (concept/palette)
  const vendor = useMemo(() => {
    if (!vendorConfig) return null;
    return {
      ...vendorConfig,
      concept: persona?.concept || '',
      palette: persona?.palette || [],
    };
  }, [vendorConfig, persona]);

  const { data: vaProductsData } = useProducts({
    wholesalerId: vendorConfig?.wholesalerId ?? 0,
    active: true,
    size: 50,
  });

  // Sync registered product activation status (best-effort, staleTime=5min)
  useSyncRegisteredProductStatus(vendorConfig?.wholesalerId);

  const products: VendorProduct[] = useMemo(() => {
    if (!vaProductsData?.items?.length) return [];
    return vaProductsData.items.map((item) => ({
      name: item.itemName,
      styleNo: item.styleNo,
      price: item.unitPrice,
      img: item.imageUrl || '',
    }));
  }, [vaProductsData]);

  // Supabase: fetch factories by fg_category
  const { data: factoriesData = [] } = useQuery({
    queryKey: ['factories-by-category', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factories')
        .select('name, overall_score, city, country, moq, main_products')
        .ilike('fg_category', vendorConfig?.name || '')
        .is('deleted_at', null)
        .order('overall_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!vendorConfig?.name,
  });
  const vendorFactories = factoriesData.map((f) => ({
    name: f.name,
    score: f.overall_score ?? 0,
    city: f.city || '',
    country: f.country || '',
    moq: f.moq || '',
    products: f.main_products?.slice(0, 3).join(', ') || '',
  }));

  const loadCachedImages = useCallback(() => {
    const cached: Record<number, string> = {};
    products.forEach((p, idx) => {
      const key = `${CACHE_KEY_PREFIX}${id}_${p.name}`;
      const saved = localStorage.getItem(key);
      if (saved) cached[idx] = saved;
    });
    return cached;
  }, [id, products]);

  const [statuses, setStatuses] = useState<ProductStatus[]>([]);
  const [convertedImages, setConvertedImages] = useState<Record<number, string>>(() => loadCachedImages());

  // Sync statuses array when products load/change
  useEffect(() => {
    if (products.length === 0) return;
    setStatuses(prev => {
      if (prev.length === products.length) return prev;
      const cached = loadCachedImages();
      return products.map((_, idx) => prev[idx] || (cached[idx] ? 'converted' : 'idle'));
    });
  }, [products]);
  const [modalProduct, setModalProduct] = useState<number | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<number | null>(null);
  const [feedbackNotes, setFeedbackNotes] = useState<Record<number, string>>({});
  const [feedbackInput, setFeedbackInput] = useState('');
  const modelSettings = useMemo(() => getVendorModelSettings(id || ''), [id]);

  // Multi-select state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Image popup state
  const [popupImage, setPopupImage] = useState<{ src: string; title: string } | null>(null);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <Link to="/ai-vendors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> 돌아가기
        </Link>
        <p className="text-muted-foreground">존재하지 않는 벤더입니다.</p>
      </div>
    );
  }

  const toggleSelect = (idx: number) => {
    setSelectedIndices(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIndices.size === products.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(products.map((_, i) => i)));
    }
  };

  const handleConvert = async (idx: number, feedback?: string) => {
    setStatuses(prev => prev.map((s, i) => i === idx ? 'converting' : s));
    try {
      const product = products[idx];
      const { data, error } = await supabase.functions.invoke('convert-product-image', {
        body: {
          productImageUrl: product.img,
          gender: modelSettings.gender,
          ethnicity: modelSettings.ethnicity,
          bodyType: modelSettings.bodyType,
          pose: modelSettings.pose,
          productName: product.name,
          modelImageUrl: modelSettings.modelImageUrl,
          feedback: feedback || undefined,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (!data?.imageUrl) throw new Error('이미지 변환 실패');

      // Upload to storage for persistence
      const publicUrl = await uploadBase64Image(data.imageUrl, `converted/${id}`, product.name);

      const cacheKey = `${CACHE_KEY_PREFIX}${id}_${product.name}`;
      try { localStorage.setItem(cacheKey, publicUrl); } catch {}

      setConvertedImages(prev => ({ ...prev, [idx]: publicUrl }));
      setStatuses(prev => prev.map((s, i) => i === idx ? 'converted' : s));
      toast({ title: `${product.name} AI 모델 변환 완료` });
    } catch (err: any) {
      console.error('Product image conversion failed:', err);
      toast({ title: '이미지 변환 실패', description: err.message, variant: 'destructive' });
      setStatuses(prev => prev.map((s, i) => i === idx ? (convertedImages[idx] ? 'converted' : 'idle') : s));
    }
  };

  const handleRetry = (idx: number) => {
    const note = feedbackNotes[idx];
    handleConvert(idx, note);
  };

  const handleFeedbackSave = () => {
    if (feedbackDialog === null) return;
    setFeedbackNotes(prev => ({ ...prev, [feedbackDialog]: feedbackInput }));
    toast({ title: '피드백이 저장되었습니다. "다시 생성" 시 반영됩니다.' });
    setFeedbackDialog(null);
    setFeedbackInput('');
  };

  const handleRegisterConfirm = () => {
    if (modalProduct === null) return;
    setStatuses(prev => prev.map((s, i) => i === modalProduct ? 'registered' : s));
    toast({ title: 'FashionGo에 등록되었습니다' });
    setModalProduct(null);
  };

  const handleBulkConfirm = () => {
    const indices = Array.from(selectedIndices);
    setStatuses(prev => prev.map((s, i) => indices.includes(i) ? 'registered' : s));
    toast({ title: `${indices.length}개 상품이 FashionGo에 등록되었습니다` });
    setBulkDialogOpen(false);
    setSelectedIndices(new Set());
  };

  const handleImageClick = (idx: number, type: 'original' | 'ai') => {
    const p = products[idx];
    const src = type === 'ai' ? (convertedImages[idx] || p.img) : p.img;
    const label = type === 'ai' ? `${p.nameKor} — AI 모델` : `${p.nameKor} — 원본`;
    setPopupImage({ src: src.replace('w=200&h=240', 'w=800&h=960'), title: label });
  };

  const registeredCount = statuses.filter(s => s === 'registered').length;
  const registeredSum = products.reduce((sum, p, i) => statuses[i] === 'registered' ? sum + p.price : sum, 0);

  if (!vendor) {
    return (
      <div className="space-y-4">
        <Link to="/ai-vendors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> AI Vendor 피드
        </Link>
        <p className="text-muted-foreground">벤더를 찾을 수 없습니다.</p>
      </div>
    );
  }

  const selectedProducts = Array.from(selectedIndices).sort().map(idx => ({ product: products[idx], idx }));

  return (
    <div className="space-y-8 pb-20">
      <Link to="/ai-vendors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Angels' Vendor Feed
      </Link>

      {/* SECTION 1: Vendor Header */}
      <Card className="overflow-hidden">
        <div className="h-2" style={{ backgroundColor: vendor.color }} />
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-semibold tracking-widest uppercase text-amber-600">Angels' Vendor</span>
              </div>
              <h1 className="text-2xl font-black tracking-tight" style={{ color: vendor.color }}>{vendor.name}</h1>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
                {vendor.position}
              </Badge>
              <p className="text-sm text-muted-foreground leading-relaxed">{vendor.concept}</p>
              <div className="flex items-center gap-2 pt-1">
                {vendor.palette.map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: c }} />
                ))}
              </div>

              {/* Vendor Model Image */}
              {modelSettings.modelImageUrl && !modelSettings.modelImageUrl.includes('unsplash.com/photo-1515886657613') && (
                <div className="pt-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">🤖 벤더 AI 모델</p>
                  <div className="flex items-start gap-3">
                    <div
                      className="w-[80px] h-[110px] rounded-lg overflow-hidden border border-border cursor-pointer hover:ring-2 hover:ring-primary/40 transition-all shrink-0"
                      onClick={() => setPopupImage({ src: modelSettings.modelImageUrl, title: `${vendor.name} AI 모델` })}
                    >
                      <img src={modelSettings.modelImageUrl} alt={`${vendor.name} model`} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex flex-wrap gap-1 pt-1">
                      <Badge variant="secondary" className="text-[10px]">{modelSettings.gender}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{modelSettings.ethnicity}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{modelSettings.bodyType}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{modelSettings.pose}</Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col items-start md:items-end gap-3 shrink-0">
              <div className="flex flex-wrap gap-1.5">
                {vendor.categories.split(', ').map(cat => (
                  <Badge key={cat} variant="secondary" className="text-[10px]">{cat}</Badge>
                ))}
              </div>
              <div className="flex gap-3 text-sm text-muted-foreground">
                <span>총 상품 <span className="font-medium text-foreground">{products.length}</span>개</span>
                <span className="text-border">|</span>
                <span>연결 공장 <span className="font-medium text-foreground">{vendorFactories.length}</span>개</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2: Factories */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Factory className="w-4 h-4" /> AI가 매칭한 주요 공장
          </h2>
          <Link to="/factories" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            전체 공장 목록 <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {vendorFactories.map(f => (
            <Link key={f.name} to="/factories" className="block">
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-sm">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{f.city}, {f.country}</p>
                    </div>
                    <ScoreBadge score={f.score} size="sm" />
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span>MOQ: {f.moq}</span>
                    <span className="text-border">|</span>
                    <span>{f.products}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* SECTION 3: Products */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold">AI 선별 상품</h2>
            <p className="text-xs text-muted-foreground mt-0.5">AI가 FashionGo 트렌드 × 공장 스코어 기반으로 선별한 상품입니다</p>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/products/sourceable-agent" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
              소싱가능상품 <ChevronRight className="w-3 h-3" />
            </Link>
            <Button variant="outline" size="sm" className="text-xs gap-1" onClick={selectAll}>
              {selectedIndices.size === products.length ? '전체 해제' : '전체 선택'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p, idx) => (
            <ProductCard
              key={idx}
              product={p}
              status={statuses[idx]}
              convertedImg={convertedImages[idx]}
              selected={selectedIndices.has(idx)}
              onToggleSelect={() => toggleSelect(idx)}
              onConvert={() => handleConvert(idx)}
              onRetry={() => handleRetry(idx)}
              onRegisterClick={() => setModalProduct(idx)}
              onFeedback={() => {
                setFeedbackDialog(idx);
                setFeedbackInput(feedbackNotes[idx] || '');
              }}
              onImageClick={(type) => handleImageClick(idx, type)}
              feedbackNote={feedbackNotes[idx]}
            />
          ))}
        </div>
      </div>

      {/* Single Registration Sheet */}
      <FGRegistrationSheet
        open={modalProduct !== null}
        onOpenChange={(open) => { if (!open) setModalProduct(null); }}
        product={modalProduct !== null ? products[modalProduct] : null}
        vendorName={vendor.name}
        onConfirm={handleRegisterConfirm}
      />

      {/* Bulk Registration Dialog */}
      <BulkRegistrationDialog
        open={bulkDialogOpen}
        onClose={() => setBulkDialogOpen(false)}
        selectedProducts={selectedProducts}
        convertedImages={convertedImages}
        vendorName={vendor.name}
        onConfirmAll={handleBulkConfirm}
      />

      {/* Image Popup */}
      {popupImage && (
        <ImagePopup
          open={!!popupImage}
          onClose={() => setPopupImage(null)}
          imgSrc={popupImage.src}
          title={popupImage.title}
        />
      )}

      {/* Feedback Dialog */}
      <Dialog open={feedbackDialog !== null} onOpenChange={(open) => { if (!open) { setFeedbackDialog(null); setFeedbackInput(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI 이미지 피드백</DialogTitle>
            <DialogDescription>
              원하는 수정 사항을 입력하세요. "다시 생성" 시 AI에게 전달됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              value={feedbackInput}
              onChange={(e) => setFeedbackInput(e.target.value)}
              placeholder="예: 원본 이미지의 옷과 동일한 패턴/색상으로 만들어주세요, 전신 샷으로 변경해주세요..."
              rows={4}
              className="text-sm"
            />
            <div className="flex flex-wrap gap-1.5">
              {['옷 색상이 다름', '패턴이 다름', '옷 디자인이 다름', '추가 이미지 필요'].map(tag => (
                <Button
                  key={tag}
                  variant="outline"
                  size="sm"
                  className="text-[11px] h-7"
                  onClick={() => setFeedbackInput(prev => prev ? `${prev}, ${tag}` : tag)}
                >
                  {tag}
                </Button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setFeedbackDialog(null); setFeedbackInput(''); }}>취소</Button>
              <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleFeedbackSave}>저장</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            선택 <span className="font-medium text-foreground">{selectedIndices.size}</span>개
            {selectedIndices.size > 0 && (
              <> | 예상 등록가 합계 <span className="font-medium text-foreground">
                ${Array.from(selectedIndices).reduce((sum, i) => sum + parseFloat(getUsd(products[i].yuan)), 0).toFixed(2)}
              </span></>
            )}
            {registeredCount > 0 && (
              <> | 등록완료 <span className="font-medium text-foreground">{registeredCount}</span>개</>
            )}
          </span>
          <Button
            size="sm"
            disabled={selectedIndices.size === 0}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            onClick={() => setBulkDialogOpen(true)}
          >
            {selectedIndices.size}개 일괄 등록
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIVendorDetail;
