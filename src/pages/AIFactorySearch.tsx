import { useState, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from '@/contexts/AuthContext';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import AIModelImageDialog from '@/components/AIModelImageDialog';
import {
  Upload, ImageIcon, Loader2, Search, Type, ArrowRight, Factory,
  ShoppingBag, Zap, AlertCircle, CheckCircle2, ArrowUpRight,
  TrendingUp, Sparkles, ThumbsUp, ThumbsDown, Send, RefreshCw, Tag,
  Clock, Play, Pause, Calendar, Plus, X, DollarSign, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import ScoreBadge from "@/components/ScoreBadge";
import { AI_VENDORS, ACTIVE_AI_VENDORS } from "@/integrations/va-api/vendor-config";
import { useProducts } from "@/integrations/va-api/hooks/use-products";
import type { FGProductListItem } from "@/integrations/va-api/types";

// ─── Vendor metadata derived from AI_VENDORS config (활성 벤더만 노출) ───
const VENDOR_META: Record<string, { name: string; color: string; position: string }> = Object.fromEntries(
  ACTIVE_AI_VENDORS.map((v) => [v.id, { name: v.name, color: v.color, position: v.position }])
);

type VendorProduct = { name: string; styleNo: string; price: number; img: string; productId: number };

// ─── Types ───
type TrendData = {
  trend_keywords: string[];
  trend_categories: string[];
  trending_styles: { name: string; description: string; keywords: string[]; estimated_demand: string }[];
  season_info: string;
  analysis_summary: string;
};

type MatchResult = {
  factory_id: string;
  factory_name: string;
  matched_keywords: string[];
  match_score: number;
  reasoning: string;
};

type ProductEntry = {
  name: string;
  category: string;
  wholesalePrice: string;
  retailPrice: string;
  sizes: string;
  colors: string;
};

type ApproveDetails = {
  products: ProductEntry[];
  notes: string;
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


const emptyProduct = (): ProductEntry => ({
  name: '', category: '', wholesalePrice: '', retailPrice: '', sizes: '', colors: '',
});

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
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("image");
  const [directQuery, setDirectQuery] = useState("");
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null);
  const [searchMatches, setSearchMatches] = useState<ProductMatch[]>([]);

  // ─── FashionGo state ───
  const [threshold, setThreshold] = useState(70);
  const [trendData, setTrendData] = useState<TrendData | null>(null);
  const [trendMatches, setTrendMatches] = useState<MatchResult[]>([]);
  const [extraCategories, setExtraCategories] = useState('');
  const [approveModalMatch, setApproveModalMatch] = useState<MatchResult | null>(null);
  const [detailQueueItem, setDetailQueueItem] = useState<any | null>(null);
  const [aiImageItem, setAiImageItem] = useState<any | null>(null);

  const CRON_PRESETS = [
    { label: '매시간', value: '0 * * * *', desc: '매시간 정각' },
    { label: '매일 오전 9시', value: '0 9 * * *', desc: '매일 오전 9시 (UTC)' },
    { label: '매주 월요일', value: '0 9 * * 1', desc: '매주 월요일 오전 9시' },
    { label: '매주 월/목', value: '0 9 * * 1,4', desc: '월, 목요일 오전 9시' },
    { label: '매일 2회', value: '0 9,18 * * *', desc: '매일 오전 9시, 오후 6시' },
  ];

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

  const { data: queue = [] } = useQuery({
    queryKey: ['fashiongo-queue', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('fashiongo_queue').select('*, factories(name, overall_score)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: analyses = [] } = useQuery({
    queryKey: ['trend-analyses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('trend_analyses').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ─── VA API: Fetch products per unique wholesalerId (활성 벤더만) ───
  const uniqueWholesalerIds = [...new Set(ACTIVE_AI_VENDORS.map((v) => v.wholesalerId))];
  const vaProductQueries = uniqueWholesalerIds.map((wid) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useProducts({ wholesalerId: wid, active: true, size: 100 })
  );
  const allVaProducts: FGProductListItem[] = vaProductQueries.flatMap((q) => q.data?.items ?? []);
  const vaProductsLoaded = vaProductQueries.some((q) => (q.data?.items?.length ?? 0) > 0);

  // Build vendorProducts map: vendorId → VendorProduct[] (활성 벤더만)
  const vendorProducts = useMemo(() => {
    const map: Record<string, VendorProduct[]> = {};
    const mapped = allVaProducts.map((p) => ({
      name: p.itemName,
      styleNo: p.styleNo,
      price: p.unitPrice,
      img: p.imageUrl || '',
      productId: p.productId,
    }));
    for (const v of ACTIVE_AI_VENDORS) {
      map[v.id] = mapped;
    }
    return map;
  }, [allVaProducts]);

  // Build vendorFactories map from Supabase factories with fg_category (활성 벤더만)
  const vendorFactories = useMemo(() => {
    const map: Record<string, { name: string; city: string }[]> = {};
    for (const v of ACTIVE_AI_VENDORS) {
      map[v.id] = factories
        .filter((f) => f.fg_category?.toUpperCase() === v.name.toUpperCase())
        .map((f) => ({ name: f.name, city: f.city || '' }));
    }
    return map;
  }, [factories]);

  const { data: schedule, refetch: refetchSchedule } = useQuery({
    queryKey: ['trend-schedule', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('trend_schedules').select('*').eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // ─── Mutations (FashionGo) ───
  const saveSchedule = useMutation({
    mutationFn: async ({ cronExpression, isActive, categories }: { cronExpression: string; isActive: boolean; categories: string[] }) => {
      if (schedule) {
        const { error } = await supabase.from('trend_schedules').update({ cron_expression: cronExpression, is_active: isActive, extra_categories: categories }).eq('id', schedule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('trend_schedules').insert({ user_id: user!.id, cron_expression: cronExpression, is_active: isActive, extra_categories: categories });
        if (error) throw error;
      }
    },
    onSuccess: () => { refetchSchedule(); toast({ title: '스케줄 저장 완료', description: '트렌드 분석 스케줄이 업데이트되었습니다' }); },
    onError: (err: Error) => { toast({ title: '저장 실패', description: err.message, variant: 'destructive' }); },
  });

  const scrapeTrends = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('scrape-fashiongo-trends', { body: { prompt: extraCategories || undefined } });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to scrape trends');
      return data.data as TrendData;
    },
    onSuccess: async (data) => {
      setTrendData(data);
      toast({ title: '트렌드 분석 완료', description: `${data.trend_keywords.length}개 트렌드 키워드를 발견했습니다` });
      const { data: analysis, error } = await supabase.from('trend_analyses').insert({
        user_id: user!.id, trend_keywords: data.trend_keywords, trend_categories: data.trend_categories, source_data: data as any, status: 'analyzed',
      }).select().single();
      if (!error && analysis) {
        queryClient.invalidateQueries({ queryKey: ['trend-analyses'] });
        matchFactories.mutate({ trendData: data, analysisId: analysis.id });
      }
    },
    onError: (err: Error) => { toast({ title: '트렌드 스크래핑 실패', description: err.message, variant: 'destructive' }); },
  });

  const matchFactories = useMutation({
    mutationFn: async ({ trendData: td, analysisId }: { trendData: TrendData; analysisId: string }) => {
      const { data, error } = await supabase.functions.invoke('match-trend-factories', {
        body: { trend_keywords: td.trend_keywords, trend_categories: td.trend_categories, trend_analysis_id: analysisId },
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to match');
      return data.matches as MatchResult[];
    },
    onSuccess: (data) => { setTrendMatches(data); toast({ title: '매칭 완료', description: `${data.length}개 공장이 트렌드와 매칭되었습니다` }); },
    onError: (err: Error) => { toast({ title: '매칭 실패', description: err.message, variant: 'destructive' }); },
  });

  const approveMatch = useMutation({
    mutationFn: async ({ match, details }: { match: MatchResult; details: ApproveDetails }) => {
      const { error } = await supabase.from('fashiongo_queue').insert({
        factory_id: match.factory_id, user_id: user!.id, status: 'pending', min_score_threshold: threshold,
        product_data: { matched_keywords: match.matched_keywords, match_score: match.match_score, reasoning: match.reasoning, products: details.products, notes: details.notes },
      });
      if (error) throw error;
    },
    onSuccess: (_, { match }) => {
      setTrendMatches(prev => prev.filter(m => m.factory_id !== match.factory_id));
      setApproveModalMatch(null);
      queryClient.invalidateQueries({ queryKey: ['fashiongo-queue'] });
      toast({ title: '등록 대기열에 추가', description: `${match.factory_name}이 등록 대기열에 추가되었습니다` });
    },
    onError: (err: Error) => { toast({ title: '등록 실패', description: err.message, variant: 'destructive' }); },
  });

  const dismissMatch = (factoryId: string) => { setTrendMatches(prev => prev.filter(m => m.factory_id !== factoryId)); };
  const qualifiedFactories = factories.filter((f) => (f.overall_score ?? 0) >= threshold && f.status === 'approved');
  const isTrendLoading = scrapeTrends.isPending || matchFactories.isPending;

  const demandColor = (d: string) => {
    if (d === 'high') return 'bg-success/10 text-success border-success/20';
    if (d === 'medium') return 'bg-warning/10 text-warning border-warning/20';
    return 'bg-muted text-muted-foreground border-border';
  };

  // ─── Search handlers ───
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast({ title: "이미지 파일만 업로드 가능합니다", variant: "destructive" }); return; }
    if (file.size > 10 * 1024 * 1024) { toast({ title: "10MB 이하의 이미지만 업로드 가능합니다", variant: "destructive" }); return; }
    setPreviewUrl(URL.createObjectURL(file));
    setSearchMatches([]);
    setImageAnalysis(null);
  };

  const handleSearch = async () => {
    if (searchMode === "image" && !fileInputRef.current?.files?.[0]) return;
    if (searchMode === "text" && !directQuery.trim()) { toast({ title: "검색어를 입력해주세요", variant: "destructive" }); return; }
    setIsSearching(true);
    setSearchMatches([]);
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
      const catalog: Record<string, { name: string; category: string }[]> = {};
      for (const [vid, products] of Object.entries(vendorProducts)) {
        if (products.length > 0) {
          catalog[vid] = products.map(p => ({ name: p.name, category: VENDOR_META[vid]?.position || '' }));
        }
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

  const matchesByVendor = searchMatches.reduce<Record<string, ProductMatch[]>>((acc, m) => {
    if (!acc[m.vendor_id]) acc[m.vendor_id] = [];
    acc[m.vendor_id].push(m);
    return acc;
  }, {});

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <div>
      {/* ═══ SEARCH + TRENDS (single page, no tabs) ═══ */}
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Image upload only (no text search toggle) */}
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
                <Button onClick={handleSearch} disabled={!previewUrl || isSearching || !vaProductsLoaded} className="w-full" size="lg">
                  {isSearching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{searchStep}</>
                    : !vaProductsLoaded ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />상품 카탈로그 로딩 중...</>
                    : <><Search className="w-4 h-4 mr-2" />AI 상품 탐색 시작 ({allVaProducts.length}개 상품)</>}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isSearching && (
          <Card><CardContent className="py-8 flex flex-col items-center"><Loader2 className="w-8 h-8 animate-spin text-primary mb-4" /><p className="font-medium">{searchStep}</p><p className="text-xs text-muted-foreground mt-1">잠시만 기다려주세요</p></CardContent></Card>
        )}

        {searchMatches.length > 0 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">매칭 결과 ({searchMatches.length}개 상품, {Object.keys(matchesByVendor).length}개 벤더)</h2>
            {Object.entries(matchesByVendor)
              .sort(([, a], [, b]) => Math.max(...b.map(m => m.match_score)) - Math.max(...a.map(m => m.match_score)))
              .map(([vendorId, vendorMatches]) => {
                const vendor = VENDOR_META[vendorId];
                const vFactories = vendorFactories[vendorId] || [];
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
                          const product = vendorProducts[vendorId]?.[match.product_index];
                          if (!product) return null;
                          return (
                            <div key={`${vendorId}-${match.product_index}`} className="border rounded-lg overflow-hidden bg-background">
                              <div className="relative">
                                {product.img ? (
                                  <img src={product.img} alt={product.name} className="w-full h-36 object-cover" loading="lazy" />
                                ) : (
                                  <div className="w-full h-36 bg-secondary flex items-center justify-center"><ImageIcon className="w-8 h-8 text-muted-foreground/30" /></div>
                                )}
                                <div className="absolute top-1.5 right-1.5"><ScoreBadge score={match.match_score} size="sm" /></div>
                              </div>
                              <div className="p-2.5 space-y-1">
                                <p className="text-xs font-bold truncate">{product.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{product.styleNo}</p>
                                <span className="text-xs font-bold text-destructive">${product.price.toFixed(2)}</span>
                                {match.reason_ko && <p className="text-[10px] text-muted-foreground line-clamp-2">{match.reason_ko}</p>}
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
          <Card><CardContent className="py-8 text-center"><p className="text-muted-foreground">매칭되는 상품이 없습니다. 다른 이미지를 시도해주세요.</p></CardContent></Card>
        )}

        {/* ═══ TREND ANALYSIS (inline below search) ═══ */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />트렌드 프롬프트</CardTitle>
            <CardDescription className="text-xs">원하는 트렌드, 스타일, 타겟 고객 등을 자유롭게 입력하면 AI가 FashionGo에서 맞춤 분석합니다</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Textarea
                placeholder={`예시:\n• 2026 여름 Y2K 감성의 크롭탑과 로우라이즈 데님\n• 25-35세 타겟, 미니멀 리넨 원피스, 뉴트럴 컬러\n• Festival 시즌 시퀸 드레스 & 보헤미안 세트\n• Plus size 캐주얼 액티브웨어, 가격대 $15-30`}
                value={extraCategories} onChange={(e) => setExtraCategories(e.target.value)} className="mt-1 min-h-[100px] text-sm"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">스타일, 카테고리, 타겟 연령, 가격대, 시즌, 소재 등 구체적으로 입력할수록 정확한 트렌드 분석이 가능합니다</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => scrapeTrends.mutate()} disabled={isTrendLoading} className="flex-1 sm:flex-none">
                {scrapeTrends.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />트렌드 분석 중...</>
                  : matchFactories.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />공장 매칭 중...</>
                  : <><Send className="w-4 h-4 mr-2" />AI 트렌드 분석 시작</>}
              </Button>
              {extraCategories && <Button variant="ghost" size="sm" onClick={() => setExtraCategories('')} className="text-xs text-muted-foreground"><X className="w-3.5 h-3.5 mr-1" />초기화</Button>}
            </div>
          </CardContent>
        </Card>

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
                <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">트렌딩 스타일</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {trendData.trending_styles.map((style, i) => (
                    <Card key={i} className="border-border">
                      <CardContent className="pt-4 pb-3 px-4">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-sm font-medium">{style.name}</p>
                          <Badge variant="outline" className={`text-[10px] ${demandColor(style.estimated_demand)}`}>
                            {style.estimated_demand === 'high' ? '높음' : style.estimated_demand === 'medium' ? '보통' : '낮음'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{style.description}</p>
                        <div className="flex flex-wrap gap-1">{style.keywords.slice(0, 4).map((kw, j) => <span key={j} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded">{kw}</span>)}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Top Factories */}
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
                      <Badge variant="outline" className="text-[10px] bg-score-excellent/10 text-score-excellent border-score-excellent/20">Top Vendor</Badge>
                      <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/40" />
                    </div>
                  </Link>
                ))}
              </Card>
            </div>
          ) : null;
        })()}

        {/* Match Results */}
        {trendMatches.length > 0 && (
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">🏭 매칭된 공장 ({trendMatches.length})</h3>
            <Card>
              {trendMatches.map((match, idx) => (
                <div key={match.factory_id} className={`p-4 ${idx < trendMatches.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-sm font-bold flex-shrink-0">{match.match_score}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Link to={`/factories/${match.factory_id}`} className="text-sm font-medium hover:underline">{match.factory_name}</Link>
                        <ArrowUpRight className="w-3 h-3 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{match.reasoning}</p>
                      <div className="flex flex-wrap gap-1">{match.matched_keywords.map((kw, j) => <Badge key={j} variant="secondary" className="text-[10px]">{kw}</Badge>)}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => dismissMatch(match.factory_id)} title="거절"><ThumbsDown className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" className="h-8 gap-1 text-xs" onClick={() => setApproveModalMatch(match)}><ThumbsUp className="w-3.5 h-3.5" />승인</Button>
                    </div>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Recent Analyses */}
        {!trendData && (
          <div>
            <h3 className="text-xs uppercase tracking-widest text-muted-foreground font-medium mb-3">최근 분석 기록</h3>
            <Card>
              {analyses.map((a: any, idx: number) => (
                <div key={a.id} className={`flex items-center gap-3 px-4 py-3 ${idx < analyses.length - 1 ? 'border-b border-border' : ''}`}>
                  <div className="flex-1">
                    <p className="text-sm">{(a.trend_keywords as string[])?.slice(0, 5).join(', ')}{(a.trend_keywords as string[])?.length > 5 && ` 외 ${(a.trend_keywords as string[]).length - 5}개`}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleString('ko-KR')}</p>
                  </div>
                  <Badge variant={a.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">{a.status === 'completed' ? '완료' : a.status === 'analyzed' ? '분석됨' : '진행중'}</Badge>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { if (a.source_data) setTrendData(a.source_data as unknown as TrendData); }} title="결과 보기"><RefreshCw className="w-3 h-3" /></Button>
                </div>
              ))}
              {analyses.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <Clock className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">분석 이력이 없습니다</p>
                  <p className="text-[11px] mt-1">위의 버튼으로 트렌드 분석을 시작해 보세요</p>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ═══ MODALS ═══ */}
      {approveModalMatch && (
        <ApproveModal match={approveModalMatch} factory={factories.find(f => f.id === approveModalMatch.factory_id)} onClose={() => setApproveModalMatch(null)} onApprove={(details) => approveMatch.mutate({ match: approveModalMatch, details })} isPending={approveMatch.isPending} />
      )}
      {detailQueueItem && <QueueDetailModal item={detailQueueItem} onClose={() => setDetailQueueItem(null)} />}
      <AIModelImageDialog
        open={!!aiImageItem}
        onClose={() => setAiImageItem(null)}
        productName={aiImageItem ? ((aiImageItem.factories as any)?.name ?? 'Unknown') : ''}
        onUseImage={(imageUrl) => {
          if (aiImageItem) {
            const updatedProductData = { ...(aiImageItem.product_data as any), ai_model_image: imageUrl };
            supabase.from('fashiongo_queue').update({ product_data: updatedProductData }).eq('id', aiImageItem.id).then(() => {
              queryClient.invalidateQueries({ queryKey: ['fashiongo-queue'] });
            });
          }
        }}
      />
    </div>
  );
};

// ═══════════════════════════════════════════
// Sub-components (from FashionGoPage)
// ═══════════════════════════════════════════

const QueueDetailModal = ({ item, onClose }: { item: any; onClose: () => void }) => {
  const pd = item.product_data as any;
  const products = (pd?.products as ProductEntry[]) || [];
  const factoryName = (item.factories as any)?.name ?? 'Unknown';
  const factoryScore = (item.factories as any)?.overall_score;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" />등록 대기 상세 정보</DialogTitle>
          <DialogDescription><span className="font-medium text-foreground">{factoryName}</span> — {new Date(item.created_at).toLocaleString('ko-KR')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30">
          {factoryScore != null && <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">{factoryScore}</div>}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium">{factoryName}</p>
              <Badge variant={item.status === 'listed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'} className="text-[10px] uppercase tracking-wider">
                {item.status === 'listed' ? '등록완료' : item.status === 'failed' ? '실패' : '대기중'}
              </Badge>
            </div>
            {pd?.match_score && <p className="text-[11px] text-muted-foreground">매칭 스코어: {pd.match_score}</p>}
          </div>
        </div>
        {pd?.matched_keywords && (pd.matched_keywords as string[]).length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">매칭 키워드</p>
            <div className="flex flex-wrap gap-1">{(pd.matched_keywords as string[]).map((kw: string, i: number) => <Badge key={i} variant="secondary" className="text-[10px]"><Tag className="w-3 h-3 mr-1" />{kw}</Badge>)}</div>
          </div>
        )}
        {pd?.reasoning && <div><p className="text-xs font-medium text-muted-foreground mb-1">AI 분석</p><p className="text-xs text-foreground/80 p-2 rounded bg-secondary/20">{pd.reasoning}</p></div>}
        {products.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground">등록 상품 ({products.length}개)</p>
            {products.map((product, idx) => (
              <Card key={idx}>
                <CardContent className="pt-3 pb-3 px-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">{product.name || `상품 ${idx + 1}`}</p>
                    {product.category && <Badge variant="outline" className="text-[10px]">{product.category}</Badge>}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div><span className="text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />도매가</span><p className="font-medium mt-0.5">{product.wholesalePrice ? `$${product.wholesalePrice}` : '-'}</p></div>
                    <div><span className="text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />소매가</span><p className="font-medium mt-0.5">{product.retailPrice ? `$${product.retailPrice}` : '-'}</p></div>
                    <div><span className="text-muted-foreground">사이즈</span><p className="font-medium mt-0.5">{product.sizes || '-'}</p></div>
                    <div><span className="text-muted-foreground">컬러</span><p className="font-medium mt-0.5">{product.colors || '-'}</p></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : <p className="text-xs text-muted-foreground">등록된 상품 정보가 없습니다</p>}
        {pd?.notes && <div><p className="text-xs font-medium text-muted-foreground mb-1">메모</p><p className="text-xs text-foreground/80 p-2 rounded bg-secondary/20">{pd.notes}</p></div>}
        {item.error_message && <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><p className="text-xs">{item.error_message}</p></div>}
        <DialogFooter><Button variant="outline" onClick={onClose}>닫기</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const ApproveModal = ({ match, factory, onClose, onApprove, isPending }: {
  match: MatchResult; factory?: any; onClose: () => void; onApprove: (details: ApproveDetails) => void; isPending: boolean;
}) => {
  const [products, setProducts] = useState<ProductEntry[]>([]);
  const [notes, setNotes] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [vendorSummary, setVendorSummary] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    const fetchProducts = async () => {
      setIsFetching(true);
      try {
        const { data, error } = await supabase.functions.invoke('scrape-vendor-products', {
          body: { factory_id: match.factory_id, factory_name: match.factory_name, source_url: factory?.source_url || null, main_products: factory?.main_products || [], matched_keywords: match.matched_keywords },
        });
        if (error) throw error;
        if (data?.success && data.data?.products) {
          setProducts(data.data.products.map((p: any) => ({ name: p.name || '', category: p.category || '', wholesalePrice: p.wholesalePrice || '', retailPrice: p.retailPrice || '', sizes: p.sizes || '', colors: p.colors || '' })));
          if (data.data.vendor_summary) setVendorSummary(data.data.vendor_summary);
          toast({ title: '베스트 상품 로드 완료', description: `${data.data.products.length}개 상품을 가져왔습니다` });
        } else { setProducts([emptyProduct()]); }
      } catch (err: any) {
        console.error('Failed to fetch vendor products:', err);
        setProducts([emptyProduct()]);
        toast({ title: '상품 자동 로드 실패', description: '수동으로 입력해주세요', variant: 'destructive' });
      } finally { setIsFetching(false); }
    };
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProduct = (idx: number, field: keyof ProductEntry, value: string) => {
    setProducts(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const addProduct = () => setProducts(prev => [...prev, emptyProduct()]);
  const removeProduct = (idx: number) => setProducts(prev => prev.filter((_, i) => i !== idx));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="w-5 h-5 text-primary" />상품 등록 상세 설정</DialogTitle>
          <DialogDescription><span className="font-medium text-foreground">{match.factory_name}</span>에서 등록할 상품 정보를 입력하세요</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 mb-2">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center text-primary text-sm font-bold">{match.match_score}</div>
          <div className="flex-1">
            <p className="text-xs text-muted-foreground">{match.reasoning}</p>
            <div className="flex flex-wrap gap-1 mt-1">{match.matched_keywords.map((kw, i) => <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>)}</div>
          </div>
        </div>
        {vendorSummary && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-xs text-foreground/80 flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5 text-primary" />{vendorSummary}</p>
          </div>
        )}
        {isFetching ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">벤더 베스트 상품을 가져오는 중...</p>
            <p className="text-[11px] text-muted-foreground/60">FashionGo에서 데이터를 분석하고 있습니다</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">상품 목록 {products.length > 0 && <span className="text-muted-foreground font-normal">({products.length}개)</span>}</Label>
              <Button size="sm" variant="outline" onClick={addProduct} className="h-7 gap-1 text-xs"><Plus className="w-3 h-3" />상품 추가</Button>
            </div>
            {products.map((product, idx) => (
              <Card key={idx} className="relative">
                <CardContent className="pt-4 pb-3 px-4 space-y-3">
                  {products.length > 1 && <Button size="sm" variant="ghost" className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeProduct(idx)}><X className="w-3.5 h-3.5" /></Button>}
                  <div className="text-[11px] text-muted-foreground font-medium">상품 {idx + 1}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><Label className="text-xs text-muted-foreground">상품명</Label><Input placeholder="예: Women's Casual Blouse" value={product.name} onChange={(e) => updateProduct(idx, 'name', e.target.value)} className="mt-1 h-9" /></div>
                    <div>
                      <Label className="text-xs text-muted-foreground">카테고리</Label>
                      <Select value={product.category} onValueChange={(v) => updateProduct(idx, 'category', v)}>
                        <SelectTrigger className="mt-1 h-9"><SelectValue placeholder="카테고리 선택" /></SelectTrigger>
                        <SelectContent>{['Tops', 'Dresses', 'Bottoms', 'Outerwear', 'Activewear', 'Accessories', 'Shoes', 'Plus Size', 'Swimwear', 'Sets'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div><Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />도매가</Label><Input type="number" placeholder="0.00" value={product.wholesalePrice} onChange={(e) => updateProduct(idx, 'wholesalePrice', e.target.value)} className="mt-1 h-9" /></div>
                    <div><Label className="text-xs text-muted-foreground flex items-center gap-1"><DollarSign className="w-3 h-3" />소매가</Label><Input type="number" placeholder="0.00" value={product.retailPrice} onChange={(e) => updateProduct(idx, 'retailPrice', e.target.value)} className="mt-1 h-9" /></div>
                    <div><Label className="text-xs text-muted-foreground">사이즈</Label><Input placeholder="S, M, L, XL" value={product.sizes} onChange={(e) => updateProduct(idx, 'sizes', e.target.value)} className="mt-1 h-9" /></div>
                    <div><Label className="text-xs text-muted-foreground">컬러</Label><Input placeholder="Black, White" value={product.colors} onChange={(e) => updateProduct(idx, 'colors', e.target.value)} className="mt-1 h-9" /></div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <div><Label className="text-xs text-muted-foreground">추가 메모</Label><Textarea placeholder="등록 시 참고할 사항을 입력하세요..." value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 min-h-[60px]" /></div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onApprove({ products, notes })} disabled={isPending || products.every(p => !p.name.trim())}>
            {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}등록 대기열에 추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const SchedulePanel = ({ schedule, cronPresets, onSave, isSaving }: {
  schedule: any; cronPresets: { label: string; value: string; desc: string }[]; onSave: (cron: string, active: boolean, cats: string[]) => void; isSaving: boolean;
}) => {
  const [selectedCron, setSelectedCron] = useState(schedule?.cron_expression || '0 9 * * 1');
  const [isActive, setIsActive] = useState(schedule?.is_active ?? false);
  const [scheduleCats, setScheduleCats] = useState((schedule?.extra_categories || []).join(', '));
  const currentPreset = cronPresets.find(p => p.value === selectedCron);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />자동 트렌드 분석 스케줄</CardTitle>
          <CardDescription className="text-xs">설정한 주기에 따라 FashionGo 트렌드를 자동으로 분석하고 공장을 매칭합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
            <div><p className="text-sm font-medium">자동 분석 활성화</p><p className="text-xs text-muted-foreground">활성화하면 설정된 주기에 따라 자동으로 실행됩니다</p></div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">분석 주기</Label>
            <Select value={selectedCron} onValueChange={setSelectedCron}>
              <SelectTrigger className="w-full"><SelectValue placeholder="주기 선택" /></SelectTrigger>
              <SelectContent>{cronPresets.map(p => <SelectItem key={p.value} value={p.value}><span className="font-medium">{p.label}</span><span className="text-muted-foreground ml-2 text-xs">— {p.desc}</span></SelectItem>)}</SelectContent>
            </Select>
            {currentPreset && <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="w-3 h-3" />{currentPreset.desc}</p>}
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">추가 카테고리 (선택사항, 쉼표 구분)</Label>
            <Input placeholder="예: dresses, tops, denim" value={scheduleCats} onChange={(e) => setScheduleCats(e.target.value)} />
          </div>
          {schedule?.last_run_at && <div className="text-xs text-muted-foreground p-2 rounded bg-secondary/30">마지막 실행: {new Date(schedule.last_run_at).toLocaleString('ko-KR')}</div>}
          <Button onClick={() => { const cats = scheduleCats.split(',').map((s: string) => s.trim()).filter(Boolean); onSave(selectedCron, isActive, cats); }} disabled={isSaving} className="w-full sm:w-auto">
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}스케줄 저장
          </Button>
        </CardContent>
      </Card>
      <Card className="border-border">
        <CardContent className="flex items-center gap-4 py-4">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isActive ? 'bg-success/10' : 'bg-secondary'}`}>
            {isActive ? <Play className="w-4 h-4 text-success" /> : <Pause className="w-4 h-4 text-muted-foreground" />}
          </div>
          <div>
            <p className="text-sm font-medium">{isActive ? '자동 분석 활성' : '자동 분석 비활성'}</p>
            <p className="text-xs text-muted-foreground">{isActive ? `${currentPreset?.label || selectedCron} 주기로 자동 실행됩니다` : '수동으로만 트렌드를 분석합니다'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AIFactorySearch;
