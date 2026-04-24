import { TrendProvider } from '@/contexts/TrendContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KeywordRecommendationTab from '@/components/trend/KeywordRecommendationTab';
import SourcingReport from '@/components/trend/SourcingReport';
import RegistrationBar from '@/components/trend/RegistrationBar';
import { Flame, Tag, BarChart3, TrendingUp } from 'lucide-react';
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
            <TabsList className="w-full justify-start bg-white border border-border rounded-xl h-11 p-1 mb-5">
              <TabsTrigger value="image" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <Flame className="w-3.5 h-3.5" /> 이미지 트렌드 <span className="ml-1 text-[10px] font-bold bg-red-500 text-white rounded px-1">NEW</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <Tag className="w-3.5 h-3.5" /> 키워드 추천
              </TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <BarChart3 className="w-3.5 h-3.5" /> 소싱 리포트
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
