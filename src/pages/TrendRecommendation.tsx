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
        <ImageTrendTab initialKeyword={initialKeyword} />
        <RegistrationBar />
      </div>
    </TrendProvider>
  );
};

export default TrendRecommendation;
