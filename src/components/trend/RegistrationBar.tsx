import { useTrend } from '@/contexts/TrendContext';
import { ShoppingCart } from 'lucide-react';

const RegistrationBar = () => {
  const { registrationList } = useTrend();
  if (registrationList.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#1a1a2e] text-white py-3 px-6 flex items-center justify-center gap-3 shadow-lg">
      <ShoppingCart className="w-5 h-5" />
      <span className="font-medium">등록 후보 <strong className="text-[#818cf8]">{registrationList.length}개</strong> 선택됨</span>
    </div>
  );
};

export default RegistrationBar;
