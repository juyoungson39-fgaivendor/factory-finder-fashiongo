import { TrendProvider } from '@/contexts/TrendContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import TrendDashboard from '@/components/trend/TrendDashboard';
import ProductRecommendations from '@/components/trend/ProductRecommendations';
import ScoringSettingsTab from '@/components/trend/ScoringSettingsTab';
import SourcingReport from '@/components/trend/SourcingReport';
import RegistrationBar from '@/components/trend/RegistrationBar';
import { BarChart3, ShoppingBag, Settings, FileText } from 'lucide-react';

const TrendRecommendation = () => {
  return (
    <TrendProvider>
      <div className="pb-16">
        {/* Tabs */}
        <div>
          <Tabs defaultValue="dashboard">
            <TabsList className="w-full justify-start bg-white border border-border rounded-xl h-11 p-1 mb-5">
              <TabsTrigger value="dashboard" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <BarChart3 className="w-3.5 h-3.5" /> 트렌드 대시보드
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <ShoppingBag className="w-3.5 h-3.5" /> 상품 추천
              </TabsTrigger>
              <TabsTrigger value="scoring" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <Settings className="w-3.5 h-3.5" /> 스코어링 설정
              </TabsTrigger>
              <TabsTrigger value="report" className="gap-1.5 text-xs data-[state=active]:bg-[#4f46e5] data-[state=active]:text-white rounded-lg">
                <FileText className="w-3.5 h-3.5" /> 소싱 리포트
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard"><TrendDashboard /></TabsContent>
            <TabsContent value="products"><ProductRecommendations /></TabsContent>
            <TabsContent value="scoring"><ScoringSettingsTab /></TabsContent>
            <TabsContent value="report"><SourcingReport /></TabsContent>
          </Tabs>
        </div>

        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
