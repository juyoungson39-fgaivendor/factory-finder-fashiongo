import { useSearchParams } from 'react-router-dom';
import { TrendProvider } from '@/contexts/TrendContext';
import ImageTrendTab from '@/components/trend/ImageTrendTab';
import RegistrationBar from '@/components/trend/RegistrationBar';

const TrendRecommendation = () => {
  const [searchParams] = useSearchParams();
  // 트렌드 리포트 페이지에서 키워드 클릭 시 전달되는 검색어
  const initialKeyword = searchParams.get('search') ?? undefined;

  return (
    <TrendProvider>
      <div className="pb-16">
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground">트렌드 상품 탐색</h1>
          <p className="text-xs text-muted-foreground">
            SNS·커머스 트렌드를 AI로 분석하고 매칭 공장 상품을 탐색합니다
          </p>
        </div>
        <ImageTrendTab initialKeyword={initialKeyword} />
        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
