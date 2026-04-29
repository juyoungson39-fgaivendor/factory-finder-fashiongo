import { useState, useCallback } from 'react';
import { TrendProvider } from '@/contexts/TrendContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KeywordRecommendationTab from '@/components/trend/KeywordRecommendationTab';
import TrendReportTab from '@/components/trend/TrendReportTab';
import RegistrationBar from '@/components/trend/RegistrationBar';
import ImageTrendTab from '@/components/trend/ImageTrendTab';

const TAB_TRIGGER_CLS =
  'relative px-4 py-2.5 text-sm rounded-none bg-transparent shadow-none border-0 border-b-2 border-transparent transition-colors ' +
  'data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:border-primary ' +
  'data-[state=inactive]:text-muted-foreground hover:text-foreground';

const TrendRecommendation = () => {
  const [activeTab, setActiveTab] = useState('image');
  // 리포트 탭 키워드 클릭 시 이미지 탭에 전달할 검색어
  const [pendingKeyword, setPendingKeyword] = useState<string | undefined>(undefined);

  // 트렌드 리포트 탭에서 키워드 클릭 → 이미지 트렌드 탭 전환 + 검색어 세팅
  const handleKeywordClick = useCallback((keyword: string) => {
    setPendingKeyword(keyword);
    setActiveTab('image');
  }, []);

  return (
    <TrendProvider>
      <div className="pb-16">
        <div>
          {/* 페이지 타이틀 — 탭 위에 배치 */}
          <div className="mb-4">
            <h1 className="text-xl font-bold text-foreground">트렌드 상품 탐색</h1>
            <p className="text-xs text-muted-foreground">
              SNS·커머스 트렌드를 AI로 분석하고 매칭 공장 상품을 탐색합니다
            </p>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 w-full justify-start mb-5">
              <TabsTrigger value="image"    className={TAB_TRIGGER_CLS}>이미지 트렌드</TabsTrigger>
              <TabsTrigger value="products" className={TAB_TRIGGER_CLS}>키워드 추천</TabsTrigger>
              <TabsTrigger value="report"   className={TAB_TRIGGER_CLS}>트렌드 리포트</TabsTrigger>
            </TabsList>

            <TabsContent value="image">
              <ImageTrendTab initialKeyword={pendingKeyword} />
            </TabsContent>
            <TabsContent value="products">
              <KeywordRecommendationTab />
            </TabsContent>
            <TabsContent value="report">
              <TrendReportTab onKeywordClick={handleKeywordClick} />
            </TabsContent>
          </Tabs>
        </div>

        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
