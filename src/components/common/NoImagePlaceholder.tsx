import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// NoImagePlaceholder — 이미지 없음 / 로드 실패 공통 placeholder
// ─────────────────────────────────────────────────────────────
interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZE_MAP = {
  // xs: 소형 인라인 썸네일
  xs: { wrapper: 'w-10 h-10',         icon: 'h-3 w-3', text: 'text-[8px]'  },
  // sm: 소싱가능상품 테이블 셀 (60×80)
  sm: { wrapper: 'w-[60px] h-[80px]', icon: 'h-4 w-4', text: 'text-[9px]'  },
  // md: 매칭 패널 카드 (80×96)
  md: { wrapper: 'w-20 h-24',         icon: 'h-5 w-5', text: 'text-[10px]' },
  // lg: 컨테이너 크기에 맞춤 (트렌드 피드 카드 등)
  lg: { wrapper: 'w-full h-full',     icon: 'h-8 w-8', text: 'text-xs'     },
} as const;

const NoImagePlaceholder = ({ size = 'md', className, label = '이미지 없음' }: Props) => {
  const s = SIZE_MAP[size];
  return (
    <div
      className={cn(
        'rounded bg-muted flex flex-col items-center justify-center text-muted-foreground gap-0.5',
        s.wrapper,
        className,
      )}
    >
      <ImageOff className={s.icon} />
      <span className={s.text}>{label}</span>
    </div>
  );
};

export default NoImagePlaceholder;
