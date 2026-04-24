import { useState, useCallback } from 'react';
import { Sparkles, TrendingUp, Minus, RefreshCw, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type Period = '7d' | '14d' | '30d';
type Category = 'all' | 'Dresses' | 'Tops' | 'Bottoms' | 'Outerwear' | 'Accessories' | 'Shoes' | 'Activewear';
type TrendDirection = 'rising' | 'stable' | 'emerging';

interface RecommendedKeyword {
  rank: number;
  keyword: string;
  category: string;
  type: string;
  confidence: number;
  reason: string;
  trend_direction: TrendDirection;
  matching_products_count: number;
  suggested_search_terms: string[];
}

interface RecommendResult {
  period: string;
  generated_at: string;
  keywords: RecommendedKeyword[];
  total_trends_analyzed: number;
  total_products_checked: number;
  message?: string;
}

interface SourceableProduct {
  id: string;
  product_no: string | null;
  image_url: string | null;
  category: string | null;
  price: number | null;
  vendor_name: string | null;
  material: string | null;
  similarity?: number;
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'all', label: '전체 카테고리' },
  { value: 'Dresses', label: 'Dresses' },
  { value: 'Tops', label: 'Tops' },
  { value: 'Bottoms', label: 'Bottoms' },
  { value: 'Outerwear', label: 'Outerwear' },
  { value: 'Accessories', label: 'Accessories' },
  { value: 'Shoes', label: 'Shoes' },
  { value: 'Activewear', label: 'Activewear' },
];

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const KeywordRowSkeleton = () => (
  <div className="grid grid-cols-[32px_1fr_80px_52px_90px_20px] gap-x-3 items-center px-4 py-3">
    <Skeleton className="h-4 w-5 mx-auto" />
    <Skeleton className="h-4 w-32" />
    <Skeleton className="h-5 w-16 rounded-full mx-auto" />
    <Skeleton className="h-4 w-8 ml-auto" />
    <Skeleton className="h-4 w-16 ml-auto" />
    <Skeleton className="h-4 w-4" />
  </div>
);

// ─────────────────────────────────────────────────────────────
// Keyword Row
// ─────────────────────────────────────────────────────────────
const KeywordRow = ({
  kw,
  selected,
  onClick,
}: {
  kw: RecommendedKeyword;
  selected: boolean;
  onClick: () => void;
}) => {
  const globalIdx = kw.rank - 1;
  const rankColor =
    globalIdx === 0 ? 'text-amber-500 font-bold' :
    globalIdx === 1 ? 'text-slate-400 font-bold' :
    globalIdx === 2 ? 'text-amber-700 font-bold' :
    'text-muted-foreground';

  const trendEl =
    kw.trend_direction === 'rising' ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
        <TrendingUp className="w-3 h-3" /> rising
      </span>
    ) : kw.trend_direction === 'emerging' ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-500">
        <Sparkles className="w-3 h-3" /> emerging
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600">
        <Minus className="w-3 h-3" /> stable
      </span>
    );

  const confidenceColor =
    kw.confidence >= 80 ? 'text-emerald-600' :
    kw.confidence >= 60 ? 'text-amber-600' :
    'text-destructive';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full grid grid-cols-[32px_1fr_80px_52px_90px_20px] gap-x-3 items-center px-4 py-3 text-left transition-colors',
        selected
          ? 'bg-primary/5 border-l-2 border-l-primary'
          : 'hover:bg-muted/40 border-l-2 border-l-transparent'
      )}
    >
      <span className={cn('text-xs text-center tabular-nums', rankColor)}>
        {kw.rank}
      </span>
      <span className="text-sm font-medium text-foreground truncate">
        {kw.keyword}
      </span>
      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground text-center truncate">
        {kw.category}
      </span>
      <span className={cn('text-xs font-semibold text-right tabular-nums', confidenceColor)}>
        {kw.confidence}
      </span>
      <div className="flex justify-end">
        {trendEl}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// Side Panel — matching sourceable_products
// ─────────────────────────────────────────────────────────────
const SidePanel = ({
  keyword,
  onClose,
}: {
  keyword: RecommendedKeyword;
  onClose: () => void;
}) => {
  const [products, setProducts] = useState<SourceableProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('match-keyword-to-products', {
        body: { keyword: keyword.keyword },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const mapped = (data?.matches ?? []).map((m: any) => ({
        id: m.id,
        product_no: m.product_name,
        image_url: m.image_url,
        category: m.category,
        price: m.price,
        vendor_name: m.vendor_name,
        material: null,
        similarity: m.similarity,
      }));
      setProducts(mapped);
    } catch (err) {
      toast.error('상품 조회에 실패했습니다');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [keyword.keyword]);

  // Auto-fetch on mount
  useState(() => {
    fetchProducts();
  });

  // Trigger once using useEffect-like pattern
  if (!loaded && !loading) fetchProducts();

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-1.5">
        <p className="text-sm font-semibold text-foreground">"{keyword.keyword}" 매칭 상품</p>
        <p className="text-xs text-muted-foreground">
          {keyword.category} · {keyword.type} · {keyword.confidence}점
        </p>
        {keyword.reason && (
          <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-2">
            {keyword.reason}
          </p>
        )}
        {keyword.suggested_search_terms.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {keyword.suggested_search_terms.map((term) => (
              <span
                key={term}
                className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground"
              >
                {term}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-2.5 p-2 rounded-lg border border-border">
              <Skeleton className="w-14 h-14 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5 py-1">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))
        ) : products.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            <p>매칭되는 소싱 상품이 없습니다.</p>
            <p className="text-xs mt-1 text-muted-foreground/60">
              소싱 상품을 먼저 추가해주세요.
            </p>
          </div>
        ) : (
          products.map((p) => (
            <div
              key={p.id}
              className="flex gap-2.5 p-2 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
            >
              {p.image_url ? (
                <img
                  src={p.image_url}
                  alt={p.product_no ?? ''}
                  className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted"
                />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground">No img</span>
                </div>
              )}
              <div className="flex-1 min-w-0 py-0.5">
                <p className="text-xs font-medium text-foreground truncate">
                  {p.product_no ?? '(번호 없음)'}
                </p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {p.vendor_name ?? '-'}
                </p>
                {p.category && (
                  <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground mt-1">
                    {p.category}
                  </span>
                )}
              </div>
              <div className="shrink-0 text-right py-0.5">
                {p.price != null && (
                  <p className="text-xs font-semibold text-foreground">
                    ${p.price.toLocaleString()}
                  </p>
                )}
                {p.similarity != null && (
                  <p className="text-[10px] text-muted-foreground">
                    유사도 {(p.similarity * 100).toFixed(0)}%
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const KeywordRecommendationTab = () => {
  const [period, setPeriod] = useState<Period>('7d');
  const [category, setCategory] = useState<Category>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [selectedKw, setSelectedKw] = useState<RecommendedKeyword | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleRecommend = async () => {
    setLoading(true);
    setSelectedKw(null);
    try {
      const { data, error } = await supabase.functions.invoke('recommend-keywords', {
        body: { period, limit: 20, category },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setResult(data as RecommendResult);

      if (!data?.keywords?.length) {
        toast.error(data?.message ?? '추천 결과가 없습니다. 트렌드 데이터를 먼저 수집해주세요.');
      } else {
        toast.success(`키워드 ${data.keywords.length}개 추천 완료`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '키워드 추천에 실패했습니다';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const formattedTime = result?.generated_at
    ? new Date(result.generated_at).toLocaleString('ko-KR', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        AI가 수집된 트렌드와 공급 가능 상품을 분석하여 이번 주 FashionGo에서 잘 팔릴 키워드를 추천합니다.
      </p>
        {/* Control bar */}
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-32">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">기간</label>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">최근 7일</SelectItem>
                <SelectItem value="14d">최근 14일</SelectItem>
                <SelectItem value="30d">최근 30일</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">카테고리</label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleRecommend}
            disabled={loading}
            className="gap-1.5"
            size="sm"
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {loading ? '분석 중...' : '키워드 추천 받기'}
          </Button>

          {formattedTime && (
            <span className="text-xs text-muted-foreground self-end pb-2">
              마지막 생성: {formattedTime}
            </span>
          )}
        </div>

        {/* Loading skeleton list */}
        {loading && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="grid grid-cols-[32px_1fr_80px_52px_90px_20px] gap-x-3 px-4 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
              <span className="text-center">#</span>
              <span>키워드</span>
              <span className="text-center">카테고리</span>
              <span className="text-right">신뢰도</span>
              <span className="text-right">트렌드</span>
              <span />
            </div>
            <div className="divide-y divide-border/50">
              {Array.from({ length: 8 }).map((_, i) => (
                <KeywordRowSkeleton key={i} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !result && (
          <div className="text-center py-20 space-y-3">
            <Sparkles className="w-12 h-12 mx-auto text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              AI 키워드 추천을 시작해보세요
            </p>
            <p className="text-xs text-muted-foreground/70">
              수집된 SNS 트렌드 데이터를 분석해 이번 주 잘 팔릴 키워드를 추천합니다.
            </p>
          </div>
        )}

        {/* No keywords state */}
        {!loading && result && result.keywords.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              추천 결과가 없습니다
            </p>
            <p className="text-xs text-muted-foreground/70">
              이미지 트렌드 탭에서 SNS 트렌드를 먼저 수집해주세요.
            </p>
          </div>
        )}

        {/* Keyword ranking list */}
        {!loading && result && result.keywords.length > 0 && (
          <>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {/* 테이블 헤더 */}
              <div className="grid grid-cols-[32px_1fr_80px_52px_90px_20px] gap-x-3 px-4 py-2 text-[11px] font-medium text-muted-foreground border-b border-border">
                <span className="text-center">#</span>
                <span>키워드</span>
                <span className="text-center">카테고리</span>
                <span className="text-right">신뢰도</span>
                <span className="text-right">트렌드</span>
                <span />
              </div>
              {/* 행 리스트 */}
              <div className="divide-y divide-border/50">
                {result.keywords.map((kw) => (
                  <KeywordRow
                    key={kw.keyword}
                    kw={kw}
                    selected={selectedKw?.keyword === kw.keyword}
                    onClick={() => {
                      setSelectedKw(kw);
                      setSheetOpen(true);
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Summary footer */}
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-primary">
              총{' '}
              <span className="font-semibold">{result.total_trends_analyzed}</span>건의 트렌드
              데이터와{' '}
              <span className="font-semibold">{result.total_products_checked}</span>건의 공장 상품을
              분석했습니다.
            </div>
          </>
        )}
      {/* Side panel — Sheet overlay */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>{selectedKw?.keyword ?? ''} 매칭 상품</SheetTitle>
            <SheetDescription>키워드에 매칭되는 소싱 가능 상품 목록</SheetDescription>
          </SheetHeader>
          {selectedKw && (
            <SidePanel keyword={selectedKw} onClose={() => setSheetOpen(false)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default KeywordRecommendationTab;
