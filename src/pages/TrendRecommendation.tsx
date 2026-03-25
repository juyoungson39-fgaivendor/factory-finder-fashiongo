import { TrendProvider } from '@/contexts/TrendContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProductRecommendations from '@/components/trend/ProductRecommendations';
import SourcingReport from '@/components/trend/SourcingReport';
import RegistrationBar from '@/components/trend/RegistrationBar';
import { Flame, Tag, BarChart3 } from 'lucide-react';
import ImageTrendTab from '@/components/trend/ImageTrendTab';

const TrendRecommendation = () => {
  return (
    <TrendProvider>
      <div className="pb-16">
        <div>
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
            <TabsContent value="products"><ProductRecommendations /></TabsContent>
            <TabsContent value="report"><SourcingReport /></TabsContent>
          </Tabs>
        </div>

        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
