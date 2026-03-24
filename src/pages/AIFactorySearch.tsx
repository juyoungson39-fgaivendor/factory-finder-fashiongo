import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Upload, ImageIcon, Loader2, Search, Type, ArrowRight, Factory,
  Sparkles, Send, X, Tag, TrendingUp, Plus, CheckCircle2, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import ScoreBadge from "@/components/ScoreBadge";

// ─── Vendor product catalog ───
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

// ─── Types ───
type TrendData = {
  trend_keywords: string[];
  trend_categories: string[];
  trending_styles: { name: string; description: string; keywords: string[]; estimated_demand: string }[];
  season_info: string;
  analysis_summary: string;
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

const demandColor = (d: string) => {
  if (d === 'high') return 'bg-success/10 text-success border-success/20';
  if (d === 'medium') return 'bg-warning/10 text-warning border-warning/20';
  return 'bg-muted text-muted-foreground border-border';
};

// ═══════════════════════════════════════════
// Main Page Component
// ═══════════════════════════════════════════
const AIFactorySearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Search state ───
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("image");
  const [directQuery, setDirectQuery] = useState("");
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null);
  const [searchMatches, setSearchMatches] = useState<ProductMatch[]>([]);
  const [addedToTarget, setAddedToTarget] = useState<Set<string>>(new Set());

  // ─── Trend state (inline below search) ───
  const [trendPrompt, setTrendPrompt] = useState('');
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  // ─── Queries ───
  const { data: factories = [] } = useQuery({
    queryKey: ['factories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').is('deleted_at', null).order('overall_score', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ─── Search handlers ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "이미지 파일만 업로드 가능합니다", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "10MB 이하의 이미지만 업로드 가능합니다", variant: "destructive" }); return; }
    setPreviewUrl(URL.createObjectURL(file));
    setSearchMatches([]);
    setImageAnalysis(null);
    // Store base64 for later use when adding to target
    const reader = new FileReader();
    reader.onload = () => setPreviewBase64(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSearch = async () => {
    if (searchMode === "image" && !fileInputRef.current?.files?.[0]) return;
    if (searchMode === "text" && !directQuery.trim()) { toast({ title: "검색어를 입력해주세요", variant: "destructive" }); return; }
    setIsSearching(true);
    setSearchMatches([]);
    setImageAnalysis(null);
    setAddedToTarget(new Set());
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
      const catalog: Record<string, { name: string; category: string }[]> = {};
      for (const [vid, products] of Object.entries(VENDOR_PRODUCTS)) {
        catalog[vid] = products.map(p => ({ name: p.name, category: VENDOR_META[vid]?.position || '' }));
      }
      const { data, error } = await supabase.functions.invoke("ai-product-search", {
        body: { image_base64: base64 || undefined, direct_query: searchMode === "text" ? directQuery.trim() : undefined, vendor_products: catalog },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "검색 실패");
      setImageAnalysis(data.image_analysis);
      setSearchMatches(data.matches || []);
      toast({ title: "검색 완료", description: `${data.matches?.length || 0}개 매칭 상품을 찾았습니다` });
    } catch (err: any) {
      console.error("Search error:", err);
      toast({ title: "검색 실패", description: err.message || "다시 시도해주세요", variant: "destructive" });
    } finally { setIsSearching(false); setSearchStep(""); }
  };

  // ─── Add to target products ───
  const addToTarget = async (vendorId: string, productIndex: number, matchScore: number) => {
    if (!user) { toast({ title: '로그인이 필요합니다', variant: 'destructive' }); return; }
    const product = VENDOR_PRODUCTS[vendorId]?.[productIndex];
    if (!product) return;

    const key = `${vendorId}-${productIndex}`;
    const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
    const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
    const usdPrice = product.yuan / rate * multiplier;

    const searchSource = searchMode === 'image'
      ? `🖼️ 이미지 검색`
      : `🔤 "${directQuery.trim()}"`;

    try {
      const { error } = await supabase.from('products').insert({
        user_id: user.id,
        name: product.name,
        brand: VENDOR_META[vendorId]?.name || vendorId,
        price: parseFloat(usdPrice.toFixed(2)),
        image_url: product.img,
        source_product_name: product.nameKor,
        source_price: product.yuan,
        source_price_currency: 'CNY',
        search_source_type: searchMode,
        search_source_query: searchMode === 'text' ? directQuery.trim() : imageAnalysis?.description_ko || '',
        search_source_image_url: searchMode === 'image' ? previewBase64?.substring(0, 500) : null,
      } as any);
      if (error) throw error;

      setAddedToTarget(prev => new Set(prev).add(key));
      queryClient.invalidateQueries({ queryKey: ['products-fg'] });
      toast({ title: '타겟 상품에 추가됨', description: `${product.nameKor}이 타겟 상품 리스트에 추가되었습니다` });
    } catch (err: any) {
      toast({ title: '추가 실패', description: err.message, variant: 'destructive' });
    }
  };

  // ─── Trend analysis ───
  const handleTrendAnalysis = async () => {
    if (!trendPrompt.trim()) { toast({ title: '트렌드 프롬프트를 입력해주세요', variant: 'destructive' }); return; }
    setIsTrendLoading(true);
    setTrendData(null);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-fashiongo-trends', { body: { prompt: trendPrompt.trim() } });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to scrape trends');
      setTrendData(data.data as TrendData);
      toast({ title: '트렌드 분석 완료', description: `${(data.data as TrendData).trend_keywords.length}개 트렌드 키워드를 발견했습니다` });

      // Save to DB
      if (user) {
        await supabase.from('trend_analyses').insert({
          user_id: user.id,
          trend_keywords: (data.data as TrendData).trend_keywords,
          trend_categories: (data.data as TrendData).trend_categories,
          source_data: data.data as any,
          status: 'analyzed',
        });
        queryClient.invalidateQueries({ queryKey: ['trend-analyses'] });
      }
    } catch (err: any) {
      toast({ title: '트렌드 분석 실패', description: err.message, variant: 'destructive' });
    } finally { setIsTrendLoading(false); }
  };

  const matchesByVendor = searchMatches.reduce<Record<string, ProductMatch[]>>((acc, m) => {
    if (!acc[m.vendor_id]) acc[m.vendor_id] = [];
    acc[m.vendor_id].push(m);
    return acc;
  }, {});

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <div className="space-y-8">
      {/* ═══ SECTION 1: AI Product Search ═══ */}
      <div className="space-y-6">
        {/* Search Mode Toggle */}
        <div className="flex gap-2">
          <Button variant={searchMode === "image" ? "default" : "outline"} size="sm" onClick={() => setSearchMode("image")}>
            <ImageIcon className="w-4 h-4 mr-1.5" />이미지 검색
          </Button>
          <Button variant={searchMode === "text" ? "default" : "outline"} size="sm" onClick={() => setSearchMode("text")}>
            <Type className="w-4 h-4 mr-1.5" />텍스트 검색
          </Button>
        </div>

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
                  <Textarea value={directQuery} onChange={(e) => setDirectQuery(e.target.value)} placeholder="예: 여성용 니트 카디건, 캐주얼 면 티셔츠..." className="mt-1 min-h-[120px] text-sm" />
                </div>
              )}
              <div className="flex-1 flex flex-col gap-4">
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
                    {imageAnalysis.description_ko && <p className="text-xs text-muted-foreground">{imageAnalysis.description_ko}</p>}
                  </div>
                )}
                <Button onClick={handleSearch} disabled={(searchMode === "image" ? !previewUrl : !directQuery.trim()) || isSearching} className="w-full" size="lg">
                  {isSearching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{searchStep}</> : <><Search className="w-4 h-4 mr-2" />AI 상품 탐색 시작</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isSearching && (
          <Card><CardContent className="py-8 flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin text-primary mb-4" /><p className="font-medium">{searchStep}</p><p className="text-xs text-muted-foreground mt-1">잠시만 기다려주세요</p></CardContent></Card>
        )}

        {/* Search Results */}
        {searchMatches.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">매칭 결과 ({searchMatches.length}개 상품, {Object.keys(matchesByVendor).length}개 벤더)</h2>
              <Link to="/products/target-fg">
                <Button variant="outline" size="sm" className="text-xs gap-1">
                  타겟 상품 보기 <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
            {Object.entries(matchesByVendor)
              .sort(([, a], [, b]) => Math.max(...b.map(m => m.match_score)) - Math.max(...a.map(m => m.match_score)))
              .map(([vendorId, vendorMatches]) => {
                const vendor = VENDOR_META[vendorId];
                const vFactories = VENDOR_FACTORIES[vendorId] || [];
                if (!vendor) return null;
                return (
                  <Card key={vendorId} className="overflow-hidden">
                    <div className="h-1.5" style={{ backgroundColor: vendor.color }} />
                    <CardContent className="pt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-bold" style={{ color: vendor.color }}>{vendor.name}</h3>
                          <Badge variant="outline" className="text-[10px]">{vendor.position}</Badge>
                          <span className="text-xs text-muted-foreground">{vendorMatches.length}개 매칭</span>
                        </div>
                        <Link to={`/ai-vendors/${vendorId}`}><Button variant="ghost" size="sm" className="text-xs">벤더 상세 <ArrowRight className="w-3 h-3 ml-1" /></Button></Link>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {vendorMatches.sort((a, b) => b.match_score - a.match_score).map((match) => {
                          const product = VENDOR_PRODUCTS[vendorId]?.[match.product_index];
                          if (!product) return null;
                          const key = `${vendorId}-${match.product_index}`;
                          const isAdded = addedToTarget.has(key);
                          return (
                            <div key={key} className="border rounded-lg overflow-hidden bg-background">
                              <div className="relative">
                                <img src={product.img} alt={product.name} className="w-full h-36 object-cover" loading="lazy" />
                                <div className="absolute top-1.5 right-1.5"><ScoreBadge score={match.match_score} size="sm" /></div>
                              </div>
                              <div className="p-2.5 space-y-1.5">
                                <p className="text-xs font-bold truncate">{product.nameKor}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{product.name}</p>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-[10px] text-muted-foreground">¥{product.yuan}</span>
                                  <span className="text-xs font-bold text-destructive">${getUsd(product.yuan)}</span>
                                </div>
                                {match.reason_ko && <p className="text-[10px] text-muted-foreground line-clamp-2">{match.reason_ko}</p>}
                                <Button
                                  size="sm"
                                  variant={isAdded ? "secondary" : "default"}
                                  className="w-full text-xs h-7 mt-1"
                                  disabled={isAdded}
                                  onClick={() => addToTarget(vendorId, match.product_index, match.match_score)}
                                >
                                  {isAdded ? <><CheckCircle2 className="w-3 h-3 mr-1" />추가됨</> : <><Plus className="w-3 h-3 mr-1" />타겟 상품에 추가</>}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {vFactories.length > 0 && (
                        <div className="border-t pt-3">
                          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2"><Factory className="w-3 h-3 inline mr-1" />연관 공장</p>
                          <div className="flex flex-wrap gap-2">{vFactories.map((f, i) => <Badge key={i} variant="outline" className="text-[10px]">{f.name} · {f.city}</Badge>)}</div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

        {!isSearching && searchMatches.length === 0 && imageAnalysis && (
          <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground">매칭되는 상품이 없습니다. 다른 이미지나 검색어를 시도해주세요.</p></CardContent></Card>
        )}
      </div>

      {/* ═══ SECTION 2: Trend Analysis (below search) ═══ */}
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />트렌드 기반 타겟 상품 찾기</CardTitle>
            <CardDescription className="text-xs">원하는 트렌드, 스타일, 타겟 고객 등을 자유롭게 입력하면 AI가 FashionGo에서 맞춤 분석합니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder={`예시:\n• 2026 여름 Y2K 감성의 크롭탑과 로우라이즈 데님\n• 25-35세 타겟, 미니멀 리넨 원피스, 뉴트럴 컬러\n• Festival 시즌 시퀸 드레스 & 보헤미안 세트\n• Plus size 캐주얼 액티브웨어, 가격대 $15-30`}
              value={trendPrompt}
              onChange={(e) => setTrendPrompt(e.target.value)}
              className="min-h-[100px] text-sm"
            />
            <p className="text-[11px] text-muted-foreground">스타일, 카테고리, 타겟 연령, 가격대, 시즌, 소재 등 구체적으로 입력할수록 정확한 트렌드 분석이 가능합니다</p>
            <div className="flex items-center gap-2">
              <Button onClick={handleTrendAnalysis} disabled={isTrendLoading || !trendPrompt.trim()} className="flex-1 sm:flex-none">
                {isTrendLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />트렌드 분석 중...</> : <><Send className="w-4 h-4 mr-2" />AI 트렌드 분석 시작</>}
              </Button>
              {trendPrompt && <Button variant="ghost" size="sm" onClick={() => setTrendPrompt('')} className="text-xs text-muted-foreground"><X className="w-3.5 h-3.5 mr-1" />초기화</Button>}
            </div>
          </CardContent>
        </Card>

        {/* Trend Results */}
        {trendData && (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">📊 트렌드 분석 결과</CardTitle>
                <CardDescription className="text-xs">{trendData.season_info}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-foreground/80">{trendData.analysis_summary}</p>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">트렌드 키워드</p>
                  <div className="flex flex-wrap gap-1.5">{trendData.trend_keywords.map((kw, i) => <Badge key={i} variant="secondary" className="text-[11px]"><Tag className="w-3 h-3 mr-1" />{kw}</Badge>)}</div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">카테고리</p>
                  <div className="flex flex-wrap gap-1.5">{trendData.trend_categories.map((cat, i) => <Badge key={i} variant="outline" className="text-[11px]">{cat}</Badge>)}</div>
                </div>
              </CardContent>
            </Card>

            {trendData.trending_styles?.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">🔥 트렌딩 스타일 ({trendData.trending_styles.length})</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trendData.trending_styles.map((style, idx) => (
                    <Card key={idx}>
                      <CardContent className="pt-4 pb-3 px-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{style.name}</p>
                          <Badge variant="outline" className={cn("text-[10px]", demandColor(style.estimated_demand))}>
                            {style.estimated_demand === 'high' ? '🔥 High' : style.estimated_demand === 'medium' ? '📈 Medium' : '📊 Low'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{style.description}</p>
                        <div className="flex flex-wrap gap-1">{style.keywords?.map((kw, j) => <Badge key={j} variant="secondary" className="text-[10px]">{kw}</Badge>)}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Top Factories from DB */}
        {(() => {
          const topFactories = factories.filter(f => (f.overall_score ?? 0) >= 60);
          return topFactories.length > 0 ? (
            <div>
              <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">🏭 스코어 60+ 우수 공장 ({topFactories.length})</h3>
              <Card>
                {topFactories.map((f, idx) => (
                  <Link key={f.id} to={`/factories/${f.id}`}>
                    <div className={`flex items-center gap-4 px-5 py-3 hover:bg-secondary/50 transition-colors ${idx < topFactories.length - 1 ? 'border-b border-border' : ''}`}>
                      <ScoreBadge score={f.overall_score ?? 0} size="sm" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{f.name}</p>
                        <p className="text-[11px] text-muted-foreground">{f.main_products?.slice(0, 4).join(', ')}</p>
                        {f.country && <p className="text-[10px] text-muted-foreground/60">{f.city ? `${f.city}, ` : ''}{f.country}</p>}
                      </div>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                  </Link>
                ))}
              </Card>
            </div>
          ) : null;
        })()}
      </div>
    </div>
  );
};

export default AIFactorySearch;
