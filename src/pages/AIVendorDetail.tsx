import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Factory, Loader2, Check } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import FGRegistrationSheet from '@/components/vendor/FGRegistrationSheet';

// --- Data ---

const VENDOR_DATA: Record<string, {
  name: string; color: string; position: string; categories: string[];
  concept: string; palette: string[]; products: number; factories: number; score: number;
}> = {
  basic: { name: 'BASIC', color: '#1A1A1A', position: '베이직 스테디', categories: ['Tops', 'Basics', 'Everyday Wear'], concept: 'FashionGo 바이어에게 가장 많이 선택되는 뉴트럴 베이직 라인입니다. 데일리 착용에 최적화된 심플한 디자인으로 시즌 무관 꾸준히 판매됩니다.', palette: ['#1A1A1A', '#F5F5F0', '#A3A3A3'], products: 24, factories: 3, score: 88 },
  curve: { name: 'CURVE', color: '#D60000', position: '플러스사이즈', categories: ['Plus Size Tops', 'Dresses', 'Bottoms'], concept: '다양한 체형의 바이어를 위한 플러스사이즈 전문 라인입니다. 사이즈 인클루시브 트렌드에 맞춰 급성장 중인 카테고리입니다.', palette: ['#D60000', '#FFC0CB', '#8B0000'], products: 18, factories: 2, score: 82 },
  denim: { name: 'DENIM', color: '#1E3A5F', position: '데님 스테디', categories: ['Jeans', 'Denim Jackets', 'Shorts'], concept: '시즌 무관 스테디셀러인 데님 전문 라인입니다. 워시드부터 인디고까지 다양한 데님 아이템을 커버합니다.', palette: ['#1E3A5F', '#4A90D9', '#A0C4FF'], products: 21, factories: 3, score: 85 },
  vacation: { name: 'VACATION', color: '#F59E0B', position: '리조트/여름 시즌', categories: ['Swimwear', 'Resort', 'Linen'], concept: '여름 시즌과 리조트 라이프스타일을 담은 라인입니다. 코스탈 감성의 스윔웨어와 린넨 아이템을 중심으로 구성됩니다.', palette: ['#F59E0B', '#FDE68A', '#92400E'], products: 16, factories: 2, score: 79 },
  festival: { name: 'FESTIVAL', color: '#7C3AED', position: '미국 시즌 이벤트', categories: ['Holiday', 'Prom', 'Party', 'Formal'], concept: '미국 주요 시즌 이벤트에 최적화된 라인입니다. 4th of July, 프롬, 마르디그라, 홀리데이 등 이벤트별 특화 상품을 선별합니다.', palette: ['#7C3AED', '#C4B5FD', '#4C1D95'], products: 14, factories: 2, score: 76 },
  trend: { name: 'TREND', color: '#EC4899', position: 'SNS 트렌드', categories: ['TikTok Viral', 'Instagram Trend'], concept: 'TikTok과 Instagram에서 바이럴 중인 트렌드 아이템 라인입니다. 빠른 트렌드 사이클에 대응하여 SNS 급상승 상품을 선제 발굴합니다.', palette: ['#EC4899', '#FBCFE8', '#9D174D'], products: 31, factories: 4, score: 91 },
};

const FACTORIES = [
  { name: 'ZENANA', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Dresses & Tops' },
  { name: '&merci', score: 82, city: 'Shanghai', country: 'China', moq: '50pcs', products: 'Tops & Blouses' },
  { name: 'Care Uniform', score: 75, city: 'Shenzhen', country: 'China', moq: '200pcs', products: 'Basics' },
];

const PRODUCTS = [
  { name: '린넨 와이드 슬랙스', nameEn: 'Linen Wide Slacks', yuan: 126, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
  { name: '오버사이즈 크롭 자켓', nameEn: 'Oversized Crop Jacket', yuan: 168, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
  { name: '플리츠 미디 스커트', nameEn: 'Pleated Midi Skirt', yuan: 112, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
  { name: '리브 니트 탑', nameEn: 'Rib Knit Top', yuan: 84, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
  { name: '와이드 데님 팬츠', nameEn: 'Wide Denim Pants', yuan: 154, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
  { name: '스트라이프 셔츠 원피스', nameEn: 'Stripe Shirt Dress', yuan: 140, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
];

const getUsd = (yuan: number) => {
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  return (yuan / rate * multiplier).toFixed(2);
};

// --- Components ---

type ProductStatus = 'idle' | 'converting' | 'converted' | 'registering' | 'registered';

const ProductCard = ({
  product,
  status,
  onConvert,
  onRegisterClick,
}: {
  product: typeof PRODUCTS[0];
  status: ProductStatus;
  onConvert: () => void;
  onRegisterClick: () => void;
}) => {
  const usd = getUsd(product.yuan);
  const converted = status === 'converted' || status === 'registering' || status === 'registered';

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        {/* Image pair */}
        <div className="grid grid-cols-2 gap-0">
          <div className="relative">
            <img
              src={product.img}
              alt={product.name}
              className="w-full h-40 object-cover"
              loading="lazy"
            />
            <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">원본</Badge>
          </div>
          <div className="relative">
            <img
              src={product.img}
              alt={`${product.name} AI`}
              className="w-full h-40 object-cover"
              style={{
                filter: converted
                  ? 'brightness(1.1) contrast(1.15) saturate(1.25)'
                  : 'brightness(1.05) contrast(1.1) saturate(1.15)',
              }}
              loading="lazy"
            />
            <Badge className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0 bg-destructive text-destructive-foreground border-0">
              AI 모델
            </Badge>
            {converted && (
              <Badge className="absolute bottom-1.5 right-1.5 text-[10px] px-1.5 py-0 bg-success text-white border-0">
                ✓ 변환완료
              </Badge>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="p-3 space-y-2">
          <p className="text-sm font-bold truncate">{product.name}</p>
          <div className="flex items-baseline gap-2">
            <span className="text-xs text-muted-foreground line-through">원가 ¥{product.yuan}</span>
            <span className="text-sm font-bold text-destructive">${usd}</span>
          </div>

          {status === 'idle' && (
            <Button variant="outline" size="sm" className="w-full text-xs" onClick={onConvert}>
              모델 변환
            </Button>
          )}
          {status === 'converting' && (
            <Button variant="outline" size="sm" className="w-full text-xs" disabled>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> 변환 중...
            </Button>
          )}
          {(status === 'converted' || status === 'registering') && (
            <Button
              size="sm"
              className="w-full text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={onRegisterClick}
              disabled={status === 'registering'}
            >
              FashionGo 등록
            </Button>
          )}
          {status === 'registered' && (
            <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
              <Check className="w-3 h-3 mr-1" /> 등록완료
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// --- Main Page ---

const AIVendorDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const vendor = VENDOR_DATA[id || ''];

  const [statuses, setStatuses] = useState<ProductStatus[]>(PRODUCTS.map(() => 'idle'));
  const [modalProduct, setModalProduct] = useState<number | null>(null);

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

  const handleConvert = (idx: number) => {
    setStatuses(prev => prev.map((s, i) => i === idx ? 'converting' : s));
    setTimeout(() => {
      setStatuses(prev => prev.map((s, i) => i === idx ? 'converted' : s));
    }, 1500);
  };

  const handleRegisterConfirm = () => {
    if (modalProduct === null) return;
    setStatuses(prev => prev.map((s, i) => i === modalProduct ? 'registered' : s));
    toast({ title: 'FashionGo에 등록되었습니다' });
    setModalProduct(null);
  };

  const registeredCount = statuses.filter(s => s === 'registered').length;
  const registeredSum = PRODUCTS.reduce((sum, p, i) => statuses[i] === 'registered' ? sum + parseFloat(getUsd(p.yuan)) : sum, 0);

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
              <ScoreBadge score={vendor.score} size="lg" />
              <div className="flex flex-wrap gap-1.5">
                {vendor.categories.map(cat => (
                  <Badge key={cat} variant="secondary" className="text-[10px]">{cat}</Badge>
                ))}
              </div>
              <div className="flex gap-3 text-sm text-muted-foreground">
                <span>총 상품 <span className="font-medium text-foreground">{vendor.products}</span>개</span>
                <span className="text-border">|</span>
                <span>연결 공장 <span className="font-medium text-foreground">{vendor.factories}</span>개</span>
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
          {FACTORIES.map(f => (
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
          {PRODUCTS.map((p, idx) => (
            <ProductCard
              key={idx}
              product={p}
              status={statuses[idx]}
              onConvert={() => handleConvert(idx)}
              onRegisterClick={() => setModalProduct(idx)}
            />
          ))}
        </div>
      </div>

      {/* Registration Sheet */}
      <FGRegistrationSheet
        open={modalProduct !== null}
        onOpenChange={(open) => { if (!open) setModalProduct(null); }}
        product={modalProduct !== null ? PRODUCTS[modalProduct] : null}
        vendorName={vendor.name}
        onConfirm={handleRegisterConfirm}
      />

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
