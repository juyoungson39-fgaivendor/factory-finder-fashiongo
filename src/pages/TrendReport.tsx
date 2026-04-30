import { useNavigate } from 'react-router-dom';
import TrendReportTab from '@/components/trend/TrendReportTab';

const TrendReport = () => {
  const navigate = useNavigate();

  // 키워드 클릭 → 트렌드 탐색 페이지로 이동 + 검색어 URL 파라미터 전달
  const handleKeywordClick = (keyword: string) => {
    navigate(`/trend?search=${encodeURIComponent(keyword)}`);
  };

  return (
    <div className="pb-16">
      <TrendReportTab onKeywordClick={handleKeywordClick} />
    </div>
  );
};

export default TrendReport;
