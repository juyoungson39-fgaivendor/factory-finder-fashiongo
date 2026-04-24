import { TrendProvider } from '@/contexts/TrendContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KeywordRecommendationTab from '@/components/trend/KeywordRecommendationTab';
import SourcingReport from '@/components/trend/SourcingReport';
import RegistrationBar from '@/components/trend/RegistrationBar';
import { TrendingUp } from 'lucide-react';
import ImageTrendTab from '@/components/trend/ImageTrendTab';

const TrendRecommendation = () => {
  return (
    <TrendProvider>
      <div className="pb-16">
        <div>
          {/* 페이지 타이틀 — 탭 위에 배치 */}
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">트렌드 상품 탐색</h1>
              <p className="text-xs text-muted-foreground">SNS·커머스 트렌드를 AI로 분석하고 매칭 공장 상품을 탐색합니다</p>
            </div>
          </div>

          <Tabs defaultValue="image">
            <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 gap-0 w-full justify-start mb-5">
              <TabsTrigger
                value="image"
                className="relative px-4 py-2.5 text-sm rounded-none bg-transparent shadow-none border-0 border-b-2 border-transparent transition-colors
                  data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:border-primary
                  data-[state=inactive]:text-muted-foreground hover:text-foreground"
              >
                이미지 트렌드
              </TabsTrigger>
              <TabsTrigger
                value="products"
                className="relative px-4 py-2.5 text-sm rounded-none bg-transparent shadow-none border-0 border-b-2 border-transparent transition-colors
                  data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:border-primary
                  data-[state=inactive]:text-muted-foreground hover:text-foreground"
              >
                키워드 추천
              </TabsTrigger>
              <TabsTrigger
                value="report"
                className="relative px-4 py-2.5 text-sm rounded-none bg-transparent shadow-none border-0 border-b-2 border-transparent transition-colors
                  data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:font-semibold data-[state=active]:shadow-none data-[state=active]:border-primary
                  data-[state=inactive]:text-muted-foreground hover:text-foreground"
              >
                소싱 리포트
              </TabsTrigger>
            </TabsList>

            <TabsContent value="image"><ImageTrendTab /></TabsContent>
            <TabsContent value="products"><KeywordRecommendationTab /></TabsContent>
            <TabsContent value="report"><SourcingReport /></TabsContent>
          </Tabs>
        </div>

        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
