import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Factory, Loader2, Check, RefreshCw, MessageSquare } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import FGRegistrationSheet from '@/components/vendor/FGRegistrationSheet';
import { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { useSyncRegisteredProductStatus } from '@/integrations/supabase/hooks/use-fg-registered-products';
import { getVendorById } from '@/integrations/va-api/vendor-config';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

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

type VendorProduct = { name: string; styleNo: string; price: number; img: string };
type ProductStatus = 'idle' | 'converting' | 'converted' | 'registering' | 'registered' | 'feedback';

const ProductCard = ({
  product,
  status,
  convertedImg,
  onConvert,
  onRetry,
  onRegisterClick,
  onFeedback,
  feedbackNote,
}: {
  product: VendorProduct;
  status: ProductStatus;
  convertedImg?: string;
  onConvert: () => void;
  onRetry: () => void;
  onRegisterClick: () => void;
  onFeedback: () => void;
  feedbackNote?: string;
}) => {
  const converted = status === 'converted' || status === 'registering' || status === 'registered' || status === 'feedback';
  const aiImgSrc = convertedImg || product.img;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Image pair */}
        <div className="grid grid-cols-2 gap-0">
          <div className="relative">
            {product.img ? (
              <img src={product.img} alt={product.name} className="w-full h-40 object-cover" loading="lazy"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.querySelector('.img-fallback')?.classList.remove('hidden'); }}
              />
            ) : null}
            <div className={`img-fallback w-full h-40 flex items-center justify-center bg-muted text-muted-foreground text-xs ${product.img ? 'hidden' : ''}`}>No Image</div>
            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">원본</Badge>
          </div>
          <div className="relative">
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

  // VA API: fetch real products for this vendor
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

  // Load cached images from localStorage
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

      // Cache to localStorage
      const cacheKey = `${CACHE_KEY_PREFIX}${id}_${product.name}`;
      try { localStorage.setItem(cacheKey, data.imageUrl); } catch {}

      setConvertedImages(prev => ({ ...prev, [idx]: data.imageUrl }));
      setStatuses(prev => prev.map((s, i) => i === idx ? 'converted' : s));
      toast({ title: `${product.name} AI 모델 변환 완료` });
    } catch (err: any) {
      console.error('Product image conversion failed:', err);
      toast({ title: '이미지 변환 실패', description: err.message, variant: 'destructive' });
      // Restore to converted if we have a cached image, otherwise idle
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

  return (
    <div className="space-y-8 pb-20">
      {/* Back link */}
      <Link to="/ai-vendors" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> AI Vendor 피드
      </Link>

      {/* SECTION 1: Vendor Header */}
      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left */}
            <div className="flex-1 space-y-3">
              <h1 className="text-2xl font-bold" style={{ color: vendor.color }}>{vendor.name}</h1>
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider font-medium">
                {vendor.position}
              </Badge>
              <p className="text-sm text-muted-foreground leading-relaxed">{vendor.concept}</p>
              <div className="flex items-center gap-2 pt-1">
                {vendor.palette.map((c, i) => (
                  <div key={i} className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>

            {/* Right */}
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
        <h2 className="text-base font-bold flex items-center gap-2">
          <Factory className="w-4 h-4" /> AI가 매칭한 주요 공장
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {vendorFactories.map(f => (
            <Card key={f.name}>
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
          ))}
        </div>
      </div>

      {/* SECTION 3: Products */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-bold">AI 선별 상품</h2>
          <p className="text-xs text-muted-foreground mt-0.5">AI가 FashionGo 트렌드 × 공장 스코어 기반으로 선별한 상품입니다</p>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p, idx) => (
            <ProductCard
              key={idx}
              product={p}
              status={statuses[idx]}
              convertedImg={convertedImages[idx]}
              onConvert={() => handleConvert(idx)}
              onRetry={() => handleRetry(idx)}
              onRegisterClick={() => setModalProduct(idx)}
              onFeedback={() => {
                setFeedbackDialog(idx);
                setFeedbackInput(feedbackNotes[idx] || '');
              }}
              feedbackNote={feedbackNotes[idx]}
            />
          ))}
        </div>
      </div>

      {/* Registration Sheet */}
      <FGRegistrationSheet
        open={modalProduct !== null}
        onOpenChange={(open) => { if (!open) setModalProduct(null); }}
        product={modalProduct !== null ? products[modalProduct] : null}
        vendorName={vendor.name}
        onConfirm={handleRegisterConfirm}
      />

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
            선택된 상품 <span className="font-medium text-foreground">{registeredCount}</span>개
            {registeredCount > 0 && (
              <> | 예상 등록가 합계 <span className="font-medium text-foreground">${registeredSum.toFixed(2)}</span></>
            )}
          </span>
          <Button
            size="sm"
            disabled={registeredCount === 0}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            전체 등록
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AIVendorDetail;
