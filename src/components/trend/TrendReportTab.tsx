import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReportSummaryCards, type ReportData } from './report/ReportSummaryCards';
import { KeywordTrendPanel } from './report/KeywordTrendPanel';
import { ColorTrendPanel } from './report/ColorTrendPanel';
import { PlatformComparePanel } from './report/PlatformComparePanel';
import { CategoryTrendPanel } from './report/CategoryTrendPanel';
import { ItemRankingPanel } from './report/ItemRankingPanel';

// ─── 기간 옵션 ───────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: '7',  label: '최근 7일' },
  { value: '15', label: '최근 15일' },
  { value: '30', label: '최근 30일' },
];

// ─── source_data JSONB → 편리한 top-level 필드로 변환 ────────
const mapAnalysisRow = (row: any) => {
  const sd: Record<string, any> = row.source_data || {};
  return {
    id:               row.id,
    created_at:       row.created_at,
    trend_keywords:   Array.isArray(row.trend_keywords)   ? row.trend_keywords   : [],
    trend_categories: Array.isArray(row.trend_categories) ? row.trend_categories : [],
    ai_keywords:      Array.isArray(row.ai_keywords)      ? row.ai_keywords      : [],
    trend_score:      row.trend_score || 0,
    // source_data 에서 추출
    platform:         (sd.platform   || 'unknown').toLowerCase(),
    view_count:       Number(sd.view_count)    || 0,
    like_count:       Number(sd.like_count)    || 0,
    comment_count:    Number(sd.comment_count) || 0,
    trend_name:       sd.trend_name || sd.article_title || '',
    source_data:      sd,
  };
};

// ─── 탭 스타일 클래스 ─────────────────────────────────────────
const TAB_TRIGGER_CLASS =
  'rounded-none border-b-2 border-transparent data-[state=active]:border-primary ' +
  'data-[state=active]:bg-transparent data-[state=active]:shadow-none ' +
  'data-[state=inactive]:text-muted-foreground hover:text-foreground px-4 py-2 text-sm';

// ─── TrendReportTab (메인) ────────────────────────────────────
export const TrendReportTab = () => {
  const [periodDays, setPeriodDays] = useState('7');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData(parseInt(periodDays));
  }, [periodDays]);

  const fetchReportData = async (days: number) => {
    setLoading(true);
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const prevCutoffDate = new Date();
      prevCutoffDate.setDate(prevCutoffDate.getDate() - days * 2);

      // 현재 기간 + 이전 기간을 병렬 조회
      // image_trends 테이블이 없으므로 trend_analyses 사용
      const [currentRes, prevRes] = await Promise.all([
        supabase
          .from('trend_analyses')
          .select('id, trend_keywords, trend_categories, source_data, ai_keywords, trend_score, created_at')
          .eq('status', 'analyzed')
          .gte('created_at', cutoffDate.toISOString()),
        supabase
          .from('trend_analyses')
          .select('id, trend_keywords, trend_categories, source_data, ai_keywords, trend_score, created_at')
          .eq('status', 'analyzed')
          .gte('created_at', prevCutoffDate.toISOString())
          .lt('created_at', cutoffDate.toISOString()),
      ]);

      if (currentRes.error) throw currentRes.error;

      setReportData({
        current:    (currentRes.data || []).map(mapAnalysisRow),
        previous:   (prevRes.data    || []).map(mapAnalysisRow),
        periodDays: days,
      });
    } catch (err) {
      console.error('트렌드 리포트 데이터 로딩 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 상단: 제목 + 기간 선택 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">트렌드 리포트</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            수집된 트렌드 데이터를 기간별로 분석합니다
          </p>
        </div>
        <Select value={periodDays} onValueChange={setPeriodDays}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIOD_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 요약 카드 */}
      <ReportSummaryCards data={reportData} loading={loading} />

      {/* 분석 탭 */}
      <Tabs defaultValue="keyword" className="w-full">
        <TabsList className="bg-transparent border-b border-border rounded-none w-full justify-start gap-0 h-auto p-0">
          <TabsTrigger value="keyword"  className={TAB_TRIGGER_CLASS}>키워드 트렌드</TabsTrigger>
          <TabsTrigger value="platform" className={TAB_TRIGGER_CLASS}>플랫폼 비교</TabsTrigger>
          <TabsTrigger value="category" className={TAB_TRIGGER_CLASS}>카테고리 트렌드</TabsTrigger>
          <TabsTrigger value="color"    className={TAB_TRIGGER_CLASS}>색상 트렌드</TabsTrigger>
          <TabsTrigger value="ranking"  className={TAB_TRIGGER_CLASS}>아이템 랭킹</TabsTrigger>
        </TabsList>

        <TabsContent value="keyword"  className="mt-4">
          <KeywordTrendPanel  data={reportData} loading={loading} />
        </TabsContent>
        <TabsContent value="platform" className="mt-4">
          <PlatformComparePanel data={reportData} loading={loading} />
        </TabsContent>
        <TabsContent value="category" className="mt-4">
          <CategoryTrendPanel data={reportData} loading={loading} />
        </TabsContent>
        <TabsContent value="color"    className="mt-4">
          <ColorTrendPanel    data={reportData} loading={loading} />
        </TabsContent>
        <TabsContent value="ranking"  className="mt-4">
          <ItemRankingPanel   data={reportData} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TrendReportTab;
