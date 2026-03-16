import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Upload, ImageIcon, Loader2, Search, CheckCircle, XCircle, Star, ArrowRight, Filter, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface ImageAnalysis {
  product_type: string;
  style_keywords: string[];
  material: string;
  color: string;
  category: string;
  description_ko: string;
}

interface ScoredFactory {
  name: string;
  country?: string;
  city?: string;
  description?: string;
  main_products?: string[];
  moq?: string;
  lead_time?: string;
  source_url?: string;
  price_range?: string;
  certifications?: string[];
  overall_score: number;
  reasoning_ko?: string;
  strengths?: string[];
  weaknesses?: string[];
  added_to_list?: boolean;
  factory_id?: string;
}

interface SearchResult {
  image_analysis: ImageAnalysis;
  factories: ScoredFactory[];
  auto_added_count: number;
}

type SearchMode = "image" | "text";

const AIFactorySearch = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchStep, setSearchStep] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchMode, setSearchMode] = useState<SearchMode>("image");

  // Additional search filters
  const [region, setRegion] = useState("");
  const [customKeywords, setCustomKeywords] = useState("");
  const [moqRange, setMoqRange] = useState("");
  const [category, setCategory] = useState("");
  const [directQuery, setDirectQuery] = useState("");

  const { data: scoringCriteria } = useQuery({
    queryKey: ["scoring_criteria"],
    queryFn: async () => {
      const { data } = await supabase
        .from("scoring_criteria")
        .select("*")
        .order("sort_order");
      return data || [];
    },
  });

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
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setResult(null);
  };

  const handleSearch = async () => {
    if (searchMode === "image" && (!previewUrl || !fileInputRef.current?.files?.[0])) return;
    if (searchMode === "text" && !directQuery.trim()) {
      toast({ title: "검색어를 입력해주세요", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setResult(null);

    try {
      let base64 = "";
      if (searchMode === "image" && fileInputRef.current?.files?.[0]) {
        const file = fileInputRef.current.files[0];
        setSearchStep("이미지 분석 중...");
        const reader = new FileReader();
        base64 = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      }

      setSearchStep("알리바바에서 유사 제품 검색 중...");
      const { data, error } = await supabase.functions.invoke("ai-image-search", {
        body: {
          image_base64: base64 || undefined,
          direct_query: searchMode === "text" ? directQuery.trim() : undefined,
          region: region || undefined,
          custom_keywords: customKeywords || undefined,
          moq_range: moqRange || undefined,
          category_filter: category || undefined,
          scoring_criteria: scoringCriteria,
          user_id: user?.id,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "검색 실패");

      setResult(data);
      setSearchStep("");

      if (data.auto_added_count > 0) {
        toast({
          title: `${data.auto_added_count}개 공장이 자동 추가되었습니다`,
          description: "60점 이상의 공장이 공장 목록에 추가되었습니다",
        });
      } else {
        toast({
          title: "검색 완료",
          description: `${data.factories?.length || 0}개 공장을 찾았습니다`,
        });
      }
    } catch (err: any) {
      console.error("Search error:", err);
      toast({
        title: "검색 실패",
        description: err.message || "다시 시도해주세요",
        variant: "destructive",
      });
      setSearchStep("");
    } finally {
      setIsSearching(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (score >= 60) return "text-amber-600 bg-amber-50 border-amber-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">AI 공장 탐색</h1>
        <p className="text-muted-foreground mt-1">
          이미지 또는 직접 검색어로 알리바바에서 공장을 찾아 스코어링합니다
        </p>
      </div>

      {/* Search Mode Toggle */}
      <div className="flex gap-2">
        <Button
          variant={searchMode === "image" ? "default" : "outline"}
          size="sm"
          onClick={() => setSearchMode("image")}
        >
          <ImageIcon className="w-4 h-4 mr-1.5" />
          이미지 검색
        </Button>
        <Button
          variant={searchMode === "text" ? "default" : "outline"}
          size="sm"
          onClick={() => setSearchMode("text")}
        >
          <Type className="w-4 h-4 mr-1.5" />
          직접 검색어 입력
        </Button>
      </div>

      {/* Search Input Area */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Left: Image Upload or Text Input */}
            {searchMode === "image" ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "w-full md:w-72 h-72 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0",
                  previewUrl
                    ? "border-primary/30"
                    : "border-muted-foreground/25 hover:border-primary/50 hover:bg-secondary/50"
                )}
              >
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Uploaded"
                    className="w-full h-full object-contain rounded-lg"
                  />
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-muted-foreground/50 mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">이미지 업로드</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">클릭하여 파일 선택</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            ) : (
              <div className="w-full md:w-72 shrink-0 space-y-3">
                <div>
                  <Label className="text-xs font-medium">검색어 *</Label>
                  <Textarea
                    value={directQuery}
                    onChange={(e) => setDirectQuery(e.target.value)}
                    placeholder="예: 여성용 니트 카디건, 캐주얼 면 티셔츠..."
                    className="mt-1 min-h-[120px] text-sm"
                  />
                </div>
              </div>
            )}

            {/* Right: Filters + Analysis */}
            <div className="flex-1 flex flex-col gap-4">
              {/* Additional Filters */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                  <Filter className="w-3.5 h-3.5" />
                  추가 검색 조건 (선택)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">지역</Label>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="전체 지역" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 지역</SelectItem>
                        <SelectItem value="guangdong">광동성 (Guangdong)</SelectItem>
                        <SelectItem value="zhejiang">절강성 (Zhejiang)</SelectItem>
                        <SelectItem value="jiangsu">강소성 (Jiangsu)</SelectItem>
                        <SelectItem value="fujian">복건성 (Fujian)</SelectItem>
                        <SelectItem value="shandong">산동성 (Shandong)</SelectItem>
                        <SelectItem value="shanghai">상해 (Shanghai)</SelectItem>
                        <SelectItem value="hebei">하북성 (Hebei)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">카테고리</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="전체 카테고리" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="womens-clothing">여성의류</SelectItem>
                        <SelectItem value="mens-clothing">남성의류</SelectItem>
                        <SelectItem value="kids-clothing">아동의류</SelectItem>
                        <SelectItem value="accessories">액세서리</SelectItem>
                        <SelectItem value="shoes">신발</SelectItem>
                        <SelectItem value="bags">가방</SelectItem>
                        <SelectItem value="activewear">스포츠웨어</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">MOQ 범위</Label>
                    <Select value={moqRange} onValueChange={setMoqRange}>
                      <SelectTrigger className="mt-1 h-9 text-sm">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="1-50">1~50개</SelectItem>
                        <SelectItem value="50-200">50~200개</SelectItem>
                        <SelectItem value="200-500">200~500개</SelectItem>
                        <SelectItem value="500+">500개 이상</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">추가 키워드</Label>
                    <Input
                      value={customKeywords}
                      onChange={(e) => setCustomKeywords(e.target.value)}
                      placeholder="예: organic, sustainable"
                      className="mt-1 h-9 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Analysis result (shown after search) */}
              {result?.image_analysis && (
                <div className="space-y-2 border-t pt-3">
                  <h3 className="font-semibold text-xs">📊 이미지 분석 결과</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><span className="text-muted-foreground">제품:</span> {result.image_analysis.product_type}</div>
                    <div><span className="text-muted-foreground">소재:</span> {result.image_analysis.material}</div>
                    <div><span className="text-muted-foreground">색상:</span> {result.image_analysis.color}</div>
                    <div><span className="text-muted-foreground">카테고리:</span> {result.image_analysis.category}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {result.image_analysis.style_keywords?.map((kw, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{kw}</Badge>
                    ))}
                  </div>
                </div>
              )}

              <Button
                onClick={handleSearch}
                disabled={(searchMode === "image" ? !previewUrl : !directQuery.trim()) || isSearching}
                className="w-full"
                size="lg"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {searchStep}
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    AI 공장 탐색 시작
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading Progress */}
      {isSearching && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="font-medium">{searchStep}</p>
            <p className="text-xs text-muted-foreground mt-1">최대 1~2분 소요될 수 있습니다</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              검색 결과 ({result.factories?.length || 0}개 공장)
            </h2>
            {result.auto_added_count > 0 && (
              <Badge className="bg-green-100 text-green-700 border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                {result.auto_added_count}개 자동 추가됨
              </Badge>
            )}
          </div>

          <div className="grid gap-4">
            {result.factories?.map((factory, idx) => (
              <Card
                key={idx}
                className={cn(
                  "transition-all",
                  factory.added_to_list && "ring-2 ring-green-300"
                )}
              >
                <CardContent className="pt-5">
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Score */}
                    <div className="flex flex-col items-center justify-center md:min-w-[100px]">
                      <div
                        className={cn(
                          "w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold border-2",
                          getScoreColor(factory.overall_score)
                        )}
                      >
                        {factory.overall_score}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1">종합 점수</span>
                      {factory.added_to_list && (
                        <Badge className="mt-2 text-[10px] bg-green-100 text-green-700 border-green-200">
                          <CheckCircle className="w-3 h-3 mr-0.5" />
                          추가됨
                        </Badge>
                      )}
                      {!factory.added_to_list && factory.overall_score < 60 && (
                        <Badge variant="outline" className="mt-2 text-[10px] text-muted-foreground">
                          <XCircle className="w-3 h-3 mr-0.5" />
                          미달
                        </Badge>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-base">{factory.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {[factory.city, factory.country].filter(Boolean).join(", ")}
                            {factory.price_range && ` · ${factory.price_range}`}
                          </p>
                        </div>
                        {factory.factory_id && (
                          <Link to={`/factories/${factory.factory_id}`}>
                            <Button variant="outline" size="sm" className="text-xs">
                              상세보기 <ArrowRight className="w-3 h-3 ml-1" />
                            </Button>
                          </Link>
                        )}
                      </div>

                      {factory.description && (
                        <p className="text-sm text-muted-foreground">{factory.description}</p>
                      )}

                      <div className="flex flex-wrap gap-1.5">
                        {factory.main_products?.slice(0, 5).map((p, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {p}
                          </Badge>
                        ))}
                      </div>

                      {factory.moq && (
                        <p className="text-xs text-muted-foreground">MOQ: {factory.moq}</p>
                      )}

                      {/* Strengths & Weaknesses */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                        {factory.strengths && factory.strengths.length > 0 && (
                          <div className="text-xs space-y-1">
                            <span className="font-medium text-green-700">강점</span>
                            <ul className="space-y-0.5">
                              {factory.strengths.map((s, i) => (
                                <li key={i} className="flex items-start gap-1 text-muted-foreground">
                                  <Star className="w-3 h-3 text-green-500 mt-0.5 shrink-0" />
                                  {s}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {factory.weaknesses && factory.weaknesses.length > 0 && (
                          <div className="text-xs space-y-1">
                            <span className="font-medium text-red-700">약점</span>
                            <ul className="space-y-0.5">
                              {factory.weaknesses.map((w, i) => (
                                <li key={i} className="flex items-start gap-1 text-muted-foreground">
                                  <XCircle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                                  {w}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {factory.reasoning_ko && (
                        <p className="text-xs text-muted-foreground bg-secondary/50 p-2 rounded mt-2">
                          💡 {factory.reasoning_ko}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {result.factories?.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  검색 결과가 없습니다. 다른 이미지로 시도해주세요.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIFactorySearch;
