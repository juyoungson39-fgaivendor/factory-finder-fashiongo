/**
 * TrendItemDetailSheet
 * ─────────────────────────────────────────────────────────────────────
 * 트렌드 아이템을 클릭했을 때 나타나는 우측 슬라이드 패널.
 * ImageTrendTab 과 TargetProducts 양쪽에서 동일하게 재사용한다.
 *
 * Props
 *   item          — 선택된 TrendFeedItem (null 이면 빈 패널)
 *   open          — Sheet 열림 여부
 *   onOpenChange  — Sheet 닫기 콜백
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip';
import { ExternalLink, Factory, Bot, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PlatformLogo } from './PlatformLogo';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';
import { useBuyerSignalTracker } from '@/hooks/useBuyerSignalTracker';
import type { TrendFeedItem } from '@/hooks/useSnsTrendFeed';

// ─── 내부 타입 ────────────────────────────────────────────────────────
interface TrendMatchProduct {
  id: string;
  product_name: string;
  item_name: string | null;
  item_name_en: string | null;
  factory_name: string;
  factory_id: string;
  image_url: string | null;
  price: number | null;
  unit_price_usd: number | null;
  stock_quantity: number | null;
  category: string | null;
  fg_category: string | null;
  source_url: string | null;
  purchase_link: string | null;
  similarity: number;
  combined_score: number;
  text_similarity: number;
  image_similarity: number | null;
  trend_decay: number;
  used_signals?: string[];
  factories: {
    id: string; name: string;
    country: string | null; city: string | null; moq: string | null;
  } | null;
}

interface TrendMatchResponse {
  trend: {
    id: string; title: string; image_url: string | null;
    ai_keywords: Array<{ keyword: string; type: string }>;
    trend_score: number;
  };
  products: TrendMatchProduct[];
  matches: TrendMatchProduct[];
  has_image_matching: boolean;
  total_matches: number;
  debug?: { applied_threshold?: number; query_attribute_keywords?: string[] };
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────
function cleanTitle(raw: string) { return raw.replace(/<[^>]+>/g, ''); }

function getColorHex(name: string): string {
  const MAP: Record<string, string> = {
    black: '#111111', white: '#F5F5F5', red: '#EF4444', blue: '#3B82F6',
    pink: '#EC4899', green: '#22C55E', beige: '#D4B896', brown: '#92400E',
    gray: '#6B7280', navy: '#1E3A5F', yellow: '#EAB308', orange: '#F97316',
    purple: '#A855F7', cream: '#FFFDD0', khaki: '#BDB76B',
  };
  return MAP[name.toLowerCase()] ?? '#6B7280';
}

function getLinkLabel(url: string): string {
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('1688'))    return '1688 상품 페이지 열기 ↗';
    if (hostname.includes('taobao'))  return 'Taobao 상품 페이지 열기 ↗';
    if (hostname.includes('alibaba')) return 'Alibaba 상품 페이지 열기 ↗';
    if (hostname.includes('tmall'))   return 'Tmall 상품 페이지 열기 ↗';
    return '새 탭으로 열기 ↗';
  } catch { return '새 탭으로 열기 ↗'; }
}

function getSimilarityStyle(score: number) {
  if (score >= 0.75) return { color: 'text-green-600', bg: 'bg-green-500', label: '높음' };
  if (score >= 0.60) return { color: 'text-amber-600', bg: 'bg-amber-400', label: '보통' };
  return { color: 'text-red-500', bg: 'bg-red-400', label: '낮음' };
}

const PLATFORM_BADGE_MAP: Record<string, { label: string; cls: string }> = {
  instagram:    { label: 'Instagram',    cls: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' },
  tiktok:       { label: 'TikTok',       cls: 'bg-black text-white' },
  vogue:        { label: 'Vogue',        cls: 'bg-black text-white' },
  elle:         { label: 'Elle',         cls: 'bg-red-600 text-white' },
  wwd:          { label: 'WWD',          cls: 'bg-gray-800 text-white' },
  hypebeast:    { label: 'Hypebeast',    cls: 'bg-green-700 text-white' },
  highsnobiety: { label: 'Highsnobiety', cls: 'bg-purple-700 text-white' },
  footwearnews: { label: 'Footwear News',cls: 'bg-amber-700 text-white' },
  google:       { label: 'Google',       cls: 'bg-blue-500 text-white' },
  pinterest:    { label: 'Pinterest',    cls: 'bg-red-500 text-white' },
  amazon:       { label: 'Amazon',       cls: 'bg-orange-500 text-white' },
  fashiongo:    { label: 'FashionGo',    cls: 'bg-indigo-600 text-white' },
  shein:        { label: 'SHEIN',        cls: 'bg-rose-500 text-white' },
  zara:         { label: 'Zara',         cls: 'bg-neutral-900 text-white' },
};
function getPlatformBadge(p: string) {
  return PLATFORM_BADGE_MAP[p] ?? { label: p, cls: 'bg-gray-500 text-white' };
}

const LIFECYCLE_MAP: Record<string, { emoji: string; label: string; cls: string }> = {
  emerging:  { emoji: '🌱', label: 'Emerging',  cls: 'bg-green-100 text-green-700 border border-green-200' },
  rising:    { emoji: '🚀', label: 'Rising',    cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  peak:      { emoji: '⭐', label: 'Peak',       cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  declining: { emoji: '📉', label: 'Declining', cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
  classic:   { emoji: '💎', label: 'Classic',   cls: 'bg-purple-100 text-purple-700 border border-purple-200' },
};

// ─── MatchedProductSheetCard ──────────────────────────────────────────
const MatchedProductCard = ({
  product, trendId, feedbackState, onFeedback, onMatchClick,
}: {
  product: TrendMatchProduct;
  trendId: string;
  feedbackState: boolean | undefined;
  onFeedback: (productId: string, isRelevant: boolean) => void;
  onMatchClick?: () => void;
}) => {
  const [imgErr, setImgErr] = useState(false);
  const score = product.combined_score ?? product.similarity;
  const simPct = Math.round(score * 100);
  const sim = getSimilarityStyle(score);
  const productUrl = product.source_url || product.purchase_link || null;
  const displayName = product.item_name_en || product.item_name || product.product_name || product.category || 'No Name';
  const displayCategory = product.fg_category || product.category;
  const displayPrice = product.unit_price_usd ?? product.price;

  const inner = (
    <>
      <div className="shrink-0 w-20 h-24 rounded-md overflow-hidden bg-muted">
        {product.image_url && !imgErr
          ? <img src={product.image_url} alt={displayName} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
          : <NoImagePlaceholder size="md" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-1">
          <p className="text-sm font-medium text-foreground truncate flex-1">{displayName}</p>
          {productUrl && (
            <Tooltip>
              <TooltipTrigger asChild>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">{getLinkLabel(productUrl)}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {displayCategory && <span className="text-xs text-muted-foreground">{displayCategory}</span>}
        {displayPrice != null && <p className="text-sm font-semibold mt-0.5">${displayPrice.toFixed(2)}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-xs font-semibold ${sim.color}`}>{simPct}%</span>
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className={`h-full ${sim.bg} rounded-full transition-all`} style={{ width: `${simPct}%` }} />
          </div>
          <span className={`text-xs ${sim.color}`}>{sim.label}</span>
        </div>
        {product.factories && (
          <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground flex-wrap">
            <Factory className="w-3 h-3 shrink-0" />
            <a href={`/factories/${product.factories.id}`} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="inline-flex items-center gap-0.5 font-medium text-foreground hover:text-primary hover:underline transition-colors group">
              {product.factories.name}
              <ExternalLink className="h-2.5 w-2.5 opacity-40 group-hover:opacity-100 shrink-0" />
            </a>
            {product.factories.country && (
              <span>· {product.factories.country}{product.factories.city ? `, ${product.factories.city}` : ''}</span>
            )}
            {product.factories.moq && <span>· MOQ {product.factories.moq}</span>}
          </div>
        )}
        {feedbackState !== undefined ? (
          <div className="flex items-center gap-1 mt-1.5">
            <span className={`text-xs ${feedbackState ? 'text-green-600' : 'text-red-500'}`}>
              {feedbackState ? '✓ 정확' : '✗ 부정확'} 피드백 완료
            </span>
          </div>
        ) : (
          <div className="flex gap-1.5 mt-1.5">
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onFeedback(product.id, true); }}
              className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 hover:bg-green-100 transition-colors">
              👍 정확
            </button>
            <button onClick={e => { e.preventDefault(); e.stopPropagation(); onFeedback(product.id, false); }}
              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
              👎 부정확
            </button>
          </div>
        )}
      </div>
    </>
  );

  const baseCls = 'flex gap-3 p-3 rounded-lg border border-border bg-card transition-all';
  if (productUrl) {
    return (
      <a href={productUrl} target="_blank" rel="noopener noreferrer"
        onClick={() => {
          try {
            const host = (() => { try { return new URL(productUrl).hostname; } catch { return null; } })();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any).from('fg_buyer_signals').insert({
              signal_type: 'click_external_link', trend_id: trendId,
              source_data: { page: 'trend', action: 'external_link_click', target: product.id, product_id: product.id, target_url_host: host, final_score: product.combined_score ?? product.similarity ?? null },
            }).then(() => {});
          } catch { /* ignore */ }
          onMatchClick?.();
        }}
        className={cn(baseCls, 'cursor-pointer hover:bg-accent hover:shadow-sm hover:border-border/80')}>
        {inner}
      </a>
    );
  }
  return <div className={cn(baseCls, 'cursor-default opacity-90')}>{inner}</div>;
};

// ─── Main component ────────────────────────────────────────────────────
interface Props {
  item: TrendFeedItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrendItemDetailSheet({ item, open, onOpenChange }: Props) {
  const { trackView, cancelView, trackMatchClick } = useBuyerSignalTracker();

  const [thumbErr,        setThumbErr]        = useState(false);
  const [matchLoading,    setMatchLoading]    = useState(false);
  const [matchData,       setMatchData]       = useState<TrendMatchResponse | null>(null);
  const [matchError,      setMatchError]      = useState<string | null>(null);
  const [needsAnalysis,   setNeedsAnalysis]   = useState(false);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [feedbackGiven,   setFeedbackGiven]   = useState<Record<string, boolean>>({});

  // 아이템 변경 시 이미지 에러 초기화
  useEffect(() => { setThumbErr(false); }, [item?.id]);

  // ─── trend_analyses row 결정 ──────────────────────────────────
  const resolveTrendAnalysisId = useCallback(async (it: TrendFeedItem): Promise<string> => {
    const { data: exactRow } = await supabase.from('trend_analyses').select('id').eq('id', it.id).maybeSingle();
    if (exactRow?.id) return exactRow.id;

    const permalinkCandidates = [it.permalink, it.source_data?.permalink].filter(Boolean) as string[];
    for (const permalink of permalinkCandidates) {
      const { data: byPermalink } = await supabase.from('trend_analyses').select('id')
        .eq('source_data->>permalink', permalink).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (byPermalink?.id) return byPermalink.id;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) throw new Error('로그인이 필요합니다.');

    const sourceData = {
      ...(it.source_data ?? {}), platform: it.platform, image_url: it.image_url,
      permalink: it.permalink, trend_name: it.trend_name, summary_ko: it.summary_ko,
      post_id: it.source_data?.post_id ?? it.id, collected_at: it.created_at,
    };
    const { data: inserted, error: insertErr } = await supabase
      .from('trend_analyses')
      .insert({ user_id: userId, trend_keywords: it.trend_keywords ?? [], trend_categories: it.trend_categories ?? [], status: 'pending', source_data: sourceData })
      .select('id').single();
    if (insertErr || !inserted) throw new Error(insertErr?.message || 'trend_analyses row 생성 실패');
    return inserted.id;
  }, []);

  // ─── 매칭 fetch ───────────────────────────────────────────────
  const fetchMatches = useCallback(async (it: TrendFeedItem) => {
    setMatchLoading(true);
    setMatchData(null);
    setMatchError(null);
    setNeedsAnalysis(false);
    try {
      const analysisId = await resolveTrendAnalysisId(it);
      const { data, error } = await supabase.functions.invoke('match-trend-to-products', {
        body: { trend_id: analysisId, max_results: 10 },
      });
      if (error) {
        let bodyText = '';
        try {
          if (error.context && typeof error.context.json === 'function') bodyText = JSON.stringify(await error.context.json());
          else if (error.context && typeof error.context.text === 'function') bodyText = await error.context.text();
        } catch { /* ignore */ }
        const errMsg = bodyText || error.message || String(error);
        if (errMsg.includes('embedding') || errMsg.includes('422') || errMsg.includes('analyze-trend') || errMsg.includes('404')) {
          setNeedsAnalysis(true); return;
        }
        throw new Error(errMsg);
      }
      if (data?.error) {
        const errStr = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
        if (errStr.includes('embedding') || errStr.includes('analyze-trend') || errStr.includes('trend_item_id를 찾을 수 없습니다') || errStr.includes('trend_id가 필요합니다')) {
          setNeedsAnalysis(true); return;
        }
        throw new Error(errStr);
      }
      setMatchData(data as TrendMatchResponse);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '매칭 실패';
      setMatchError(msg);
      toast.error(msg);
    } finally {
      setMatchLoading(false);
    }
  }, [resolveTrendAnalysisId]);

  // ─── Sheet 열릴 때 fetch ──────────────────────────────────────
  useEffect(() => {
    if (open && item) {
      setFeedbackGiven({});
      trackView(item.id);
      fetchMatches(item);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  // ─── AI 분석 실행 ─────────────────────────────────────────────
  const handleRunAnalysis = useCallback(async () => {
    if (!item) return;
    setAnalysisRunning(true);
    try {
      const baseId = await resolveTrendAnalysisId(item);
      const { data: aData, error: aErr } = await supabase.functions.invoke('analyze-trend', { body: { trend_item_id: baseId } });
      if (aErr) throw aErr;
      if (aData?.error) throw new Error(aData.error);

      const analysisId: string = aData?.id || baseId;
      const sd = item.source_data ?? {};
      const textForEmbed = [item.trend_keywords?.join(' '), item.trend_name || sd.trend_name, item.summary_ko || sd.summary_ko]
        .filter(Boolean).join(' ') || item.trend_name || '';

      const embedBody: Record<string, unknown> = { table: 'trend_analyses', id: analysisId, text: textForEmbed };
      if (item.image_url) embedBody.image_url = item.image_url;

      const { data: eData, error: eErr } = await supabase.functions.invoke('generate-embedding', { body: embedBody });
      if (eErr) throw eErr;
      if (eData?.error) throw new Error(eData.error);

      setNeedsAnalysis(false);
      await fetchMatches(item);
      toast.success('AI 분석 + 임베딩 완료, 매칭 결과를 불러왔습니다.');
    } catch (e: unknown) {
      toast.error(`분석 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    } finally {
      setAnalysisRunning(false);
    }
  }, [item, resolveTrendAnalysisId, fetchMatches]);

  // ─── 피드백 ───────────────────────────────────────────────────
  const submitFeedback = useCallback(async (productId: string, isRelevant: boolean) => {
    if (!item) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('match_feedback')
        .upsert({ trend_id: item.id, product_id: productId, is_relevant: isRelevant }, { onConflict: 'trend_id,product_id' });
      if (!error) setFeedbackGiven(prev => ({ ...prev, [productId]: isRelevant }));
    } catch { /* non-critical */ }
  }, [item]);

  const matchedProducts = useMemo(
    () => (matchData?.products ?? matchData?.matches ?? []) as TrendMatchProduct[],
    [matchData]
  );

  // ─── Render ───────────────────────────────────────────────────
  return (
    <Sheet open={open} onOpenChange={(o) => {
      onOpenChange(o);
      if (!o && item) cancelView(item.id);
    }}>
      <SheetContent side="right" className="w-[640px] sm:max-w-[640px] p-0 flex flex-col">
        {item && (
          <>
            <SheetHeader className="px-5 py-4 border-b border-border">
              <SheetDescription className="sr-only">유사상품 패널</SheetDescription>
              <div className="flex gap-4">
                {/* 썸네일 */}
                <div className="w-32 h-40 shrink-0 rounded-lg overflow-hidden bg-muted">
                  {item.image_url && !thumbErr
                    ? <img src={item.image_url} alt={cleanTitle(item.trend_name)} className="w-full h-full object-cover" onError={() => setThumbErr(true)} />
                    : <NoImagePlaceholder size="lg" />}
                </div>
                {/* 피드 정보 */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <PlatformLogo platform={item.platform} size="md" />
                    <span className="text-xs text-muted-foreground font-medium">
                      {getPlatformBadge(item.platform).label}
                    </span>
                    {item.lifecycle_stage && LIFECYCLE_MAP[item.lifecycle_stage] && (() => {
                      const lc = LIFECYCLE_MAP[item.lifecycle_stage!];
                      return (
                        <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full', lc.cls)}>
                          {lc.emoji} {lc.label}
                        </span>
                      );
                    })()}
                  </div>
                  <SheetTitle className="text-base leading-snug line-clamp-3">
                    {cleanTitle(item.trend_name)}
                  </SheetTitle>
                  {item.permalink && (
                    <a href={item.permalink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline transition-colors">
                      <ExternalLink className="w-3 h-3" />원본 보기
                    </a>
                  )}
                  {item.ai_analyzed && item.trend_score > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">AI 분석</span>
                      <span className="text-[10px] text-muted-foreground">{item.trend_score}점</span>
                    </div>
                  )}
                  {/* 키워드 */}
                  {item.trend_keywords?.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">키워드</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {(item.ai_keywords?.length
                          ? item.ai_keywords.map((k: { keyword: string }) => k.keyword)
                          : item.trend_keywords
                        ).slice(0, 10).map((kw: string) => (
                          <span key={kw} className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{kw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* 성별 / 색상 */}
                  {(item.source_data?.gender || item.source_data?.body_type) && (
                    <div className="flex gap-3">
                      {item.source_data?.gender && (
                        <div>
                          <span className="text-xs text-muted-foreground">성별</span>
                          <p className="font-medium text-xs">
                            {item.source_data.gender === 'women' ? '여성' : item.source_data.gender === 'men' ? '남성' : '유니섹스'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {Array.isArray(item.source_data?.colors) && item.source_data.colors.length > 0 && (
                    <div>
                      <span className="text-xs text-muted-foreground">색상</span>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.source_data.colors.map((color: string, idx: number) => (
                          <span key={idx} className="text-xs flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: getColorHex(color) }} />
                            {color}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* 유사상품 헤더 */}
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <h4 className="text-sm font-semibold text-foreground">유사상품</h4>
                  {matchData && <span className="text-xs text-muted-foreground">{matchedProducts.length}건</span>}
                </div>
                {matchData && (() => {
                  const SIGNAL_LABELS: Record<string, string> = { text: '텍스트', image: '이미지', attr: '속성' };
                  const usedSignalsSet = new Set<string>();
                  matchedProducts.forEach(p => (p.used_signals ?? []).forEach(s => usedSignalsSet.add(s)));
                  const usedSignalsLabel = [...usedSignalsSet].map(s => SIGNAL_LABELS[s] ?? s).join('+');
                  const threshold = matchData.debug?.applied_threshold ?? 0.3;
                  const keywords: string[] = matchData.debug?.query_attribute_keywords ?? matchData.trend.ai_keywords.map(k => k.keyword);
                  if (!usedSignalsLabel && keywords.length === 0) return null;
                  return (
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {usedSignalsLabel ? `${usedSignalsLabel} 매칭` : '매칭 신호 없음'}
                      {' · '}임계값 {threshold} 이상
                      {keywords.length > 0 && (
                        <> · 키워드 {keywords.slice(0, 5).join(', ')}{keywords.length > 5 && ` 외 ${keywords.length - 5}개`}</>
                      )}
                    </p>
                  );
                })()}
              </div>

              {/* 로딩 */}
              {matchLoading && (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex gap-3 p-3 rounded-lg border border-border">
                      <Skeleton className="w-20 h-20 rounded-md" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" />
                        <Skeleton className="h-2 w-full" /><Skeleton className="h-3 w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* AI 분석 필요 */}
              {!matchLoading && needsAnalysis && (
                <div className="text-center py-8 space-y-3 border border-dashed border-border rounded-lg">
                  <Bot className="w-8 h-8 mx-auto text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground font-medium">이 트렌드 아이템은 아직 AI 분석이 되지 않았습니다.</p>
                  <p className="text-xs text-muted-foreground">분석 → 임베딩 → 매칭을 순차적으로 실행합니다.</p>
                  <Button size="sm" onClick={handleRunAnalysis} disabled={analysisRunning} className="gap-1.5">
                    {analysisRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                    {analysisRunning ? 'AI 분석 실행 중...' : 'AI 분석 실행'}
                  </Button>
                </div>
              )}

              {/* 에러 */}
              {!matchLoading && !needsAnalysis && matchError && (
                <div className="text-center py-8 space-y-2">
                  <p className="text-sm text-destructive font-medium">⚠️ {matchError}</p>
                </div>
              )}

              {/* 0건 */}
              {!matchLoading && !matchError && matchData && matchedProducts.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground">유사한 소싱 상품을 찾지 못했습니다</p>
                  <p className="text-xs text-muted-foreground mt-1">상품 데이터가 보강되면 매칭 정확도가 향상됩니다</p>
                </div>
              )}

              {/* 매칭 상품 목록 */}
              {!matchLoading && matchData && matchedProducts.length > 0 && (
                <div className="space-y-2">
                  {matchedProducts.map(p => (
                    <MatchedProductCard
                      key={p.id}
                      product={p}
                      trendId={item.id}
                      feedbackState={feedbackGiven[p.id]}
                      onFeedback={submitFeedback}
                      onMatchClick={() => trackMatchClick(item.id, p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
