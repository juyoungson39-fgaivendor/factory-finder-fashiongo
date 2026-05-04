import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Star, RotateCcw, Truck, ThumbsUp, RefreshCw, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

type Signals = {
  mixed_batch?: boolean;
  dropshipping?: boolean;
  custom_accepted?: boolean;
};

type PriceStats = {
  min?: number;
  max?: number;
  avg?: number;
  median?: number;
  sample_count?: number;
};

type RawCrawlData = {
  ontime_rate?: number;
  positive_review_rate?: number;
  fan_count?: string | number;
  established_year?: number;
  established_month?: number;
  main_category?: string;
  subcategory_count?: number;
  price_stats?: PriceStats;
  signals?: Signals;
  top_sales?: string[];
};

interface Props {
  factoryId: string;
  scoreStatus: string | null;
  aiScoredAt: string | null;
  p1CrawledAt: string | null;
  rawServiceScore: number | null;
  rawReturnRate: number | null;
  rawProductCount: number | null;
  rawYearsInBusiness: number | null;
  rawCrawlData: RawCrawlData | null;
}

const formatKoreanTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
};

const SignalBadge = ({ active, label }: { active: boolean; label: string }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium border ${
      active
        ? label.startsWith('混批')
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
          : label.startsWith('一件')
          ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800'
          : 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800'
        : 'bg-muted text-muted-foreground border-border'
    }`}
  >
    {active ? '✅' : '❌'} {label}
  </span>
);

const Row = ({ icon, label, value }: { icon: string; label: string; value: React.ReactNode }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-border/40 last:border-0">
    <span className="text-xs text-muted-foreground flex items-center gap-1.5">
      <span>{icon}</span>
      {label}
    </span>
    <span className="text-xs font-semibold tabular-nums">{value ?? '—'}</span>
  </div>
);

export default function RawCrawlDataCard({
  factoryId,
  scoreStatus,
  aiScoredAt,
  p1CrawledAt,
  rawServiceScore,
  rawReturnRate,
  rawProductCount,
  rawYearsInBusiness,
  rawCrawlData,
}: Props) {
  const [recrawling, setRecrawling] = useState(false);
  const queryClient = useQueryClient();

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const { error } = await supabase
        .from('factories')
        .update({ score_status: 'p1_crawling' })
        .eq('id', factoryId);
      if (error) throw error;
      sonnerToast.success('크롤링 요청됨', { description: '크롤러가 곧 처리합니다.' });
      queryClient.invalidateQueries({ queryKey: ['factory', factoryId] });
    } catch (err: any) {
      sonnerToast.error('요청 실패: ' + err.message);
    } finally {
      setRecrawling(false);
    }
  };

  // 빈 상태: 아직 크롤링되지 않았을 때
  if (!aiScoredAt) {
    return (
      <Card className="mb-4 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
            📊 1688 원본 데이터
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-8">
          <p className="text-xs text-muted-foreground">크롤링 대기 중</p>
          <Button size="sm" variant="outline" disabled={recrawling} onClick={handleRecrawl}>
            {recrawling ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
            지금 크롤링
          </Button>
        </CardContent>
      </Card>
    );
  }

  const d = rawCrawlData ?? {};
  const ps = d.price_stats ?? {};
  const sig = d.signals ?? {};
  const topSales = (d.top_sales ?? []).slice(0, 3);

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const { error } = await supabase
        .from('factories')
        .update({ score_status: 'p1_crawling' })
        .eq('id', factoryId);
      if (error) throw error;
      sonnerToast.success('재크롤링 요청됨', { description: '크롤러가 곧 처리합니다.' });
      queryClient.invalidateQueries({ queryKey: ['factory', factoryId] });
    } catch (err: any) {
      sonnerToast.error('요청 실패: ' + err.message);
    } finally {
      setRecrawling(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          📊 1688 원본 데이터
          {scoreStatus === 'scored' && (
            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
              검증완료
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          {/* 좌측: 1688 평가지표 */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              1688 평가지표
            </p>
            <Row
              icon="⭐"
              label="서비스 점수"
              value={rawServiceScore != null ? `${Number(rawServiceScore).toFixed(1)} / 5.0` : '—'}
            />
            <Row
              icon="🔁"
              label="재구매율"
              value={rawReturnRate != null ? `${Number(rawReturnRate).toFixed(0)}%` : '—'}
            />
            <Row
              icon="🚚"
              label="정시발송률"
              value={d.ontime_rate != null ? `${Number(d.ontime_rate).toFixed(0)}%` : '—'}
            />
            <Row
              icon="👍"
              label="긍정평가율"
              value={d.positive_review_rate != null ? `${Number(d.positive_review_rate).toFixed(1)}%` : '—'}
            />
          </div>

          {/* 우측: 운영 정보 */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              운영 정보
            </p>
            <Row icon="🏢" label="입주년수" value={rawYearsInBusiness != null ? `${rawYearsInBusiness}년` : '—'} />
            <Row
              icon="📅"
              label="설립"
              value={
                d.established_year
                  ? `${d.established_year}.${String(d.established_month ?? 1).padStart(2, '0')}`
                  : '—'
              }
            />
            <Row
              icon="📦"
              label="등록상품"
              value={rawProductCount != null ? `${rawProductCount.toLocaleString()}건` : '—'}
            />
            <Row icon="👥" label="팬 수" value={d.fan_count ?? '—'} />
            <Row icon="🏷️" label="메인카테고리" value={d.main_category ?? '—'} />
            <Row
              icon="🗂️"
              label="카테고리 수"
              value={d.subcategory_count != null ? `${d.subcategory_count}개` : '—'}
            />
          </div>
        </div>

        {/* 가격 정보 */}
        {(ps.min != null || ps.max != null) && (
          <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
              💰 가격 정보
            </p>
            <p className="text-xs">
              가격대{' '}
              <span className="font-semibold tabular-nums">
                ¥{ps.min} ~ ¥{ps.max}
              </span>{' '}
              <span className="text-muted-foreground">
                (평균 ¥{ps.avg} · 중앙값 ¥{ps.median})
              </span>
            </p>
            {ps.sample_count != null && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                샘플 수량 {ps.sample_count}건 기반
              </p>
            )}
          </div>
        )}

        {/* 소량주문 시그널 */}
        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
            소량주문 가능 시그널
          </p>
          <div className="flex flex-wrap gap-2">
            <SignalBadge active={!!sig.mixed_batch} label="混批 가능" />
            <SignalBadge active={!!sig.dropshipping} label="一件代发" />
            <SignalBadge active={!!sig.custom_accepted} label="OEM/ODM" />
          </div>
        </div>

        {/* 판매 실적 */}
        {topSales.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">
              🔥 판매 실적
            </p>
            <p className="text-xs">
              인기 상품:{' '}
              <span className="font-semibold tabular-nums">
                {topSales.join(' · ')}
              </span>
            </p>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex items-center justify-between pt-2 border-t border-border/50">
          <p className="text-[11px] text-muted-foreground">
            최근 크롤: <span className="tabular-nums">{formatKoreanTime(p1CrawledAt)}</span>
          </p>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            disabled={recrawling}
            onClick={handleRecrawl}
          >
            {recrawling ? (
              <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1.5" />
            )}
            재크롤링 요청
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
