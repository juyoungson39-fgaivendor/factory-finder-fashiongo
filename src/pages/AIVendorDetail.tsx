import React, { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Factory, Loader2, Check } from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import FGRegistrationSheet from '@/components/vendor/FGRegistrationSheet';
import { getVendorModelSettings } from '@/components/vendor/VendorModelSettingsDialog';

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

const FACTORIES: Record<string, { name: string; score: number; city: string; country: string; moq: string; products: string }[]> = {
  basic: [
    { name: 'Ruili Fashion', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Tops & Dresses' },
    { name: 'Mingyi Style', score: 82, city: 'Hangzhou', country: 'China', moq: '80pcs', products: 'Basics & Knits' },
    { name: 'HK Baodeyou', score: 79, city: 'Shenzhen', country: 'China', moq: '150pcs', products: 'Sweaters & Blouses' },
  ],
  curve: [
    { name: 'Ruili Fashion', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Plus Size Dresses' },
    { name: 'Leqier Fashion', score: 79, city: 'Hangzhou', country: 'China', moq: '50pcs', products: 'Plus Size Bottoms' },
  ],
  denim: [
    { name: 'Leqier Fashion', score: 85, city: 'Hangzhou', country: 'China', moq: '100pcs', products: 'Jeans & Denim' },
    { name: 'Ruili Fashion', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Denim Jackets' },
    { name: 'Mingyi Style', score: 82, city: 'Hangzhou', country: 'China', moq: '80pcs', products: 'Denim Overalls' },
  ],
  vacation: [
    { name: 'Mingyi Style', score: 82, city: 'Hangzhou', country: 'China', moq: '80pcs', products: 'Resort & Linen' },
    { name: 'Leqier Fashion', score: 79, city: 'Hangzhou', country: 'China', moq: '50pcs', products: 'Swimwear & Cover-ups' },
  ],
  festival: [
    { name: 'HK Baodeyou', score: 76, city: 'Shenzhen', country: 'China', moq: '150pcs', products: 'Evening & Formal' },
    { name: 'Ruili Fashion', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Party Dresses' },
  ],
  trend: [
    { name: 'HK Baodeyou', score: 79, city: 'Shenzhen', country: 'China', moq: '150pcs', products: 'Graphic Tees & Sweatshirts' },
    { name: 'Mingyi Style', score: 82, city: 'Hangzhou', country: 'China', moq: '80pcs', products: 'Activewear Sets' },
    { name: 'Ruili Fashion', score: 88, city: 'Guangzhou', country: 'China', moq: '100pcs', products: 'Mesh & Lace Tops' },
    { name: 'Leqier Fashion', score: 79, city: 'Hangzhou', country: 'China', moq: '50pcs', products: 'Viral Fashion' },
  ],
};

const VENDOR_PRODUCTS: Record<string, { name: string; nameKor: string; yuan: number; img: string }[]> = {
  basic: [
    { name: 'Smocked Halter Maxi Dress', nameKor: '스모크 홀터 맥시 드레스', yuan: 126, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
    { name: 'Reversible Ribbed Tank Top', nameKor: '리버서블 리브드 탱크탑', yuan: 84, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Mineral Wash Relaxed Cotton Tee', nameKor: '미네랄워시 릴렉스핏 티셔츠', yuan: 77, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Classic Satin Camisole', nameKor: '클래식 새틴 캐미솔', yuan: 91, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Gingham Ruffle Blouse', nameKor: '깅엄 러플 블라우스', yuan: 105, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
    { name: 'Round Neck Extended Sweater Top', nameKor: '라운드넥 오버사이즈 스웨터탑', yuan: 126, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
  ],
  curve: [
    { name: 'Plus Size Floral Tiered Midi Dress', nameKor: '플러스 플로럴 티어드 미디 드레스', yuan: 154, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
    { name: 'Plus Size Wide Leg Linen Pants', nameKor: '플러스 와이드 레그 린넨 팬츠', yuan: 140, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Plus Size Smocked Maxi Dress', nameKor: '플러스 스모크 맥시 드레스', yuan: 168, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Curve Ribbed Tank Top', nameKor: '커브 리브드 탱크탑', yuan: 84, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Plus Size Jogger Drawstring Pants', nameKor: '플러스 조거 드로스트링 팬츠', yuan: 119, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
    { name: 'Curve Square Neck Bodycon Dress', nameKor: '커브 스퀘어넥 바디콘 드레스', yuan: 133, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
  ],
  denim: [
    { name: 'Easy Flow Wide Leg Denim Pants', nameKor: '와이드 레그 데님 팬츠', yuan: 154, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
    { name: '90s Vintage High Rise Flare Jeans', nameKor: '90년대 빈티지 하이라이즈 플레어 진', yuan: 168, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Raw Hem Crop Slim Wide Leg Jeans', nameKor: '로우헴 크롭 슬림 와이드 진', yuan: 154, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
    { name: 'Denim Camo Contrast Jacket', nameKor: '데님 카모 콘트라스트 자켓', yuan: 182, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Lace Edge Wide Leg Denim Overall', nameKor: '레이스 엣지 와이드 데님 오버롤', yuan: 196, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Barrel Leg Distressed Jeans', nameKor: '배럴 레그 디스트레스드 진', yuan: 161, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
  ],
  vacation: [
    { name: 'Sunny Days Bikini Set', nameKor: '써니 데이즈 비키니 세트', yuan: 98, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Coco Kalo Pareo Cover-Up', nameKor: '코코 칼로 파레오 커버업', yuan: 112, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Linen Trousers 100% Linen', nameKor: '100% 린넨 트라우저', yuan: 154, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
    { name: 'Coastal Stripe Smocked Jumpsuit', nameKor: '코스탈 스트라이프 점프수트', yuan: 168, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
    { name: "Women's Solid Color Button-Up Shirt", nameKor: '솔리드 컬러 버튼업 셔츠', yuan: 98, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Crochet Front Button Down Shorts Set', nameKor: '크로셰 버튼 다운 반바지 세트', yuan: 196, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
  ],
  festival: [
    { name: 'Back Lace Up Mermaid Evening Dress', nameKor: '백 레이스업 머메이드 이브닝 드레스', yuan: 224, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Sequin Formal Gown', nameKor: '시퀸 포멀 가운', yuan: 280, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
    { name: 'Floral Tiered Ribbon Strap Maxi Dress', nameKor: '플로럴 티어드 리본 맥시 드레스', yuan: 196, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
    { name: 'Eyelet Lace Tube Dress', nameKor: '아일렛 레이스 튜브 드레스', yuan: 168, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Mixed-Media T-Shirt Dress with Sheer Lace Skirt', nameKor: '믹스미디어 티셔츠 시어 레이스 드레스', yuan: 182, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Applique Zip Up Hooded Jacket', nameKor: '아플리케 집업 후드 자켓', yuan: 154, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
  ],
  trend: [
    { name: 'Expensive & Difficult Puff Sweatshirt', nameKor: '익스펜시브 그래픽 스웨트셔츠', yuan: 119, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop' },
    { name: 'Easy Tiger Retro Ringer Shirt', nameKor: '이지 타이거 레트로 링거 셔츠', yuan: 112, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop' },
    { name: 'Salty Graphic Sweatshirt', nameKor: '살티 그래픽 스웨트셔츠', yuan: 140, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop' },
    { name: 'Activewear Crop Top & Shorts Set', nameKor: '액티브웨어 크롭탑 세트', yuan: 154, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop' },
    { name: 'Mesh Lace High Neck Fitted Top', nameKor: '메쉬 레이스 하이넥 피티드 탑', yuan: 98, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop' },
    { name: 'Kindness Is Golden Graphic Tee', nameKor: '킨드니스 이즈 골든 그래픽 티', yuan: 91, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop' },
  ],
};

const getUsd = (yuan: number) => {
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  return (yuan / rate * multiplier).toFixed(2);
};

// --- Components ---

type VendorProduct = { name: string; nameKor: string; yuan: number; img: string };
type ProductStatus = 'idle' | 'converting' | 'converted' | 'registering' | 'registered';

const ProductCard = ({
  product,
  status,
  onConvert,
  onRegisterClick,
}: {
  product: VendorProduct;
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
          <p className="text-sm font-bold truncate">{product.nameKor}</p>
          <p className="text-[11px] text-muted-foreground truncate">{product.name}</p>
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

  const products = VENDOR_PRODUCTS[id || ''] || VENDOR_PRODUCTS['basic'];
  const vendorFactories = FACTORIES[id || ''] || FACTORIES['basic'];

  const [statuses, setStatuses] = useState<ProductStatus[]>(products.map(() => 'idle'));
  const [modalProduct, setModalProduct] = useState<number | null>(null);
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
  const registeredSum = products.reduce((sum, p, i) => statuses[i] === 'registered' ? sum + parseFloat(getUsd(p.yuan)) : sum, 0);

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
