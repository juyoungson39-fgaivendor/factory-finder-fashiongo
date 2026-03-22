import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Upload, ImageIcon, Loader2, Search, Type, ArrowRight, Factory } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import ScoreBadge from "@/components/ScoreBadge";

// --- Vendor product catalog (same as AIVendorDetail) ---
const VENDOR_META: Record<string, { name: string; color: string; position: string }> = {
  basic: { name: 'BASIC', color: '#1A1A1A', position: '베이직 스테디' },
  curve: { name: 'CURVE', color: '#D60000', position: '플러스사이즈' },
  denim: { name: 'DENIM', color: '#1E3A5F', position: '데님 스테디' },
  vacation: { name: 'VACATION', color: '#F59E0B', position: '리조트/여름 시즌' },
  festival: { name: 'FESTIVAL', color: '#7C3AED', position: '미국 시즌 이벤트' },
  trend: { name: 'TREND', color: '#EC4899', position: 'SNS 트렌드' },
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

const VENDOR_FACTORIES: Record<string, { name: string; city: string }[]> = {
  basic: [{ name: 'Ruili Fashion', city: 'Guangzhou' }, { name: 'Mingyi Style', city: 'Hangzhou' }, { name: 'HK Baodeyou', city: 'Shenzhen' }],
  curve: [{ name: 'Ruili Fashion', city: 'Guangzhou' }, { name: 'Leqier Fashion', city: 'Hangzhou' }],
  denim: [{ name: 'Leqier Fashion', city: 'Hangzhou' }, { name: 'Ruili Fashion', city: 'Guangzhou' }, { name: 'Mingyi Style', city: 'Hangzhou' }],
  vacation: [{ name: 'Mingyi Style', city: 'Hangzhou' }, { name: 'Leqier Fashion', city: 'Hangzhou' }],
  festival: [{ name: 'HK Baodeyou', city: 'Shenzhen' }, { name: 'Ruili Fashion', city: 'Guangzhou' }],
  trend: [{ name: 'HK Baodeyou', city: 'Shenzhen' }, { name: 'Mingyi Style', city: 'Hangzhou' }, { name: 'Ruili Fashion', city: 'Guangzhou' }, { name: 'Leqier Fashion', city: 'Hangzhou' }],
};

interface ImageAnalysis {
  product_type: string;
  style_keywords: string[];
  material: string;
  color: string;
  category: string;
  description_ko: string;
}

interface ProductMatch {
  vendor_id: string;
  product_index: number;
  match_score: number;
  reason_ko: string;
}

type SearchMode = "image" | "text";

const getUsd = (yuan: number) => {
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  return (yuan / rate * multiplier).toFixed(2);
};

const AIFactorySearch = () => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("image");
  const [directQuery, setDirectQuery] = useState("");
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null);
  const [matches, setMatches] = useState<ProductMatch[]>([]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "이미지 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "10MB 이하의 이미지만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setPreviewUrl(URL.createObjectURL(file));
    setMatches([]);
    setImageAnalysis(null);
  };

  const handleSearch = async () => {
    if (searchMode === "image" && !fileInputRef.current?.files?.[0]) return;
    if (searchMode === "text" && !directQuery.trim()) {
      toast({ title: "검색어를 입력해주세요", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setMatches([]);
    setImageAnalysis(null);

    try {
      let base64 = "";
      if (searchMode === "image" && fileInputRef.current?.files?.[0]) {
        setSearchStep("이미지 분석 중...");
        const file = fileInputRef.current.files[0];
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      setSearchStep("벤더 상품 DB에서 매칭 중...");

      // Build catalog for AI
      const catalog: Record<string, { name: string; category: string }[]> = {};
      for (const [vid, products] of Object.entries(VENDOR_PRODUCTS)) {
        catalog[vid] = products.map(p => ({ name: p.name, category: VENDOR_META[vid]?.position || '' }));
      }

      const { data, error } = await supabase.functions.invoke("ai-product-search", {
        body: {
          image_base64: base64 || undefined,
          direct_query: searchMode === "text" ? directQuery.trim() : undefined,
          vendor_products: catalog,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "검색 실패");

      setImageAnalysis(data.image_analysis);
      setMatches(data.matches || []);

      toast({
        title: "검색 완료",
        description: `${data.matches?.length || 0}개 매칭 상품을 찾았습니다`,
      });
    } catch (err: any) {
      console.error("Search error:", err);
      toast({ title: "검색 실패", description: err.message || "다시 시도해주세요", variant: "destructive" });
    } finally {
      setIsSearching(false);
      setSearchStep("");
    }
  };

  // Group matches by vendor
  const matchesByVendor = matches.reduce<Record<string, ProductMatch[]>>((acc, m) => {
    if (!acc[m.vendor_id]) acc[m.vendor_id] = [];
    acc[m.vendor_id].push(m);
    return acc;
  }, {});

  return (
    <div className="space-y-6">

      {/* Search Mode Toggle */}
      <div className="flex gap-2">
        <Button variant={searchMode === "image" ? "default" : "outline"} size="sm" onClick={() => setSearchMode("image")}>
          <ImageIcon className="w-4 h-4 mr-1.5" />
          이미지 검색
        </Button>
        <Button variant={searchMode === "text" ? "default" : "outline"} size="sm" onClick={() => setSearchMode("text")}>
          <Type className="w-4 h-4 mr-1.5" />
          텍스트 검색
        </Button>
      </div>

      {/* Search Input */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {searchMode === "image" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full md:w-72 h-72 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0",
                  previewUrl ? "border-primary/30" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-secondary/50"
                )}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="Uploaded" className="w-full h-full object-contain rounded-lg" />
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">이미지 업로드</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">클릭하여 파일 선택</p>
                  </>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
              </div>
            ) : (
              <div className="w-full md:w-72 shrink-0">
                <Label className="text-xs font-medium">검색어 *</Label>
                <Textarea
                  value={directQuery}
                  onChange={(e) => setDirectQuery(e.target.value)}
                  placeholder="예: 여성용 니트 카디건, 캐주얼 면 티셔츠..."
                  className="mt-1 min-h-[120px] text-sm"
                />
              </div>
            )}

            <div className="flex-1 flex flex-col gap-4">
              {/* Analysis result */}
              {imageAnalysis && (
                <div className="space-y-2 border rounded-lg p-3 bg-secondary/30">
                  <h3 className="font-semibold text-xs">📊 이미지 분석 결과</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">제품:</span> {imageAnalysis.product_type}</div>
                    <div><span className="text-muted-foreground">소재:</span> {imageAnalysis.material}</div>
                    <div><span className="text-muted-foreground">색상:</span> {imageAnalysis.color}</div>
                    <div><span className="text-muted-foreground">카테고리:</span> {imageAnalysis.category}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {imageAnalysis.style_keywords?.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                    ))}
                  </div>
                  {imageAnalysis.description_ko && (
                    <p className="text-xs text-muted-foreground">{imageAnalysis.description_ko}</p>
                  )}
                </div>
              )}

              <Button
                onClick={handleSearch}
                disabled={(searchMode === "image" ? !previewUrl : !directQuery.trim()) || isSearching}
                className="w-full"
                size="lg"
              >
                {isSearching ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{searchStep}</>
                ) : (
                  <><Search className="w-4 h-4 mr-2" />AI 상품 탐색 시작</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isSearching && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="font-medium">{searchStep}</p>
            <p className="text-xs text-muted-foreground mt-1">잠시만 기다려주세요</p>
          </CardContent>
        </Card>
      )}

      {/* Results by Vendor */}
      {matches.length > 0 && (
        <div className="space-y-6">
          <h2 className="text-lg font-semibold">
            매칭 결과 ({matches.length}개 상품, {Object.keys(matchesByVendor).length}개 벤더)
          </h2>

          {Object.entries(matchesByVendor)
            .sort(([, a], [, b]) => Math.max(...b.map(m => m.match_score)) - Math.max(...a.map(m => m.match_score)))
            .map(([vendorId, vendorMatches]) => {
              const vendor = VENDOR_META[vendorId];
              const factories = VENDOR_FACTORIES[vendorId] || [];
              if (!vendor) return null;

              return (
                <Card key={vendorId} className="overflow-hidden">
                  {/* Vendor header */}
                  <div className="h-1.5" style={{ backgroundColor: vendor.color }} />
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold" style={{ color: vendor.color }}>{vendor.name}</h3>
                        <Badge variant="outline" className="text-[10px]">{vendor.position}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {vendorMatches.length}개 매칭
                        </span>
                      </div>
                      <Link to={`/ai-vendors/${vendorId}`}>
                        <Button variant="ghost" size="sm" className="text-xs">
                          벤더 상세 <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>

                    {/* Matched products */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {vendorMatches
                        .sort((a, b) => b.match_score - a.match_score)
                        .map((match) => {
                          const product = VENDOR_PRODUCTS[vendorId]?.[match.product_index];
                          if (!product) return null;

                          return (
                            <div key={`${vendorId}-${match.product_index}`} className="border rounded-lg overflow-hidden bg-background">
                              <div className="relative">
                                <img src={product.img} alt={product.name} className="w-full h-36 object-cover" loading="lazy" />
                                <div className="absolute top-1.5 right-1.5">
                                  <ScoreBadge score={match.match_score} size="sm" />
                                </div>
                              </div>
                              <div className="p-2.5 space-y-1">
                                <p className="text-xs font-bold truncate">{product.nameKor}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{product.name}</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[10px] text-muted-foreground">¥{product.yuan}</span>
                                  <span className="text-xs font-bold text-destructive">${getUsd(product.yuan)}</span>
                                </div>
                                {match.reason_ko && (
                                  <p className="text-[10px] text-muted-foreground line-clamp-2">{match.reason_ko}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Associated factories */}
                    {factories.length > 0 && (
                      <div className="border-t pt-3">
                        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                          <Factory className="w-3 h-3 inline mr-1" />
                          연관 공장
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {factories.map((f, i) => (
                            <Badge key={i} variant="outline" className="text-[10px]">
                              {f.name} · {f.city}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
        </div>
      )}

      {/* No results */}
      {!isSearching && matches.length === 0 && imageAnalysis && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">매칭되는 상품이 없습니다. 다른 이미지나 검색어를 시도해주세요.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIFactorySearch;
