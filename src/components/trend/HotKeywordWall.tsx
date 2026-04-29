import { cn } from '@/lib/utils';
import { useHotKeywords, type HotKeyword } from '@/hooks/useHotKeywords';
import { Skeleton } from '@/components/ui/skeleton';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const FALLBACK_BG =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=320&h=200&fit=crop';

// ─────────────────────────────────────────────────────────────
// KeywordCard
// ─────────────────────────────────────────────────────────────
const KeywordCard = ({
  item,
  onClick,
}: {
  item: HotKeyword;
  onClick: () => void;
}) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative shrink-0 w-40 h-[100px] rounded-xl overflow-hidden group cursor-pointer
                 hover:scale-[1.04] active:scale-[0.97] transition-transform duration-200 shadow-sm"
    >
      {/* 배경 이미지 — 기본 블러, hover 시 선명하게 */}
      <img
        src={item.image_url || FALLBACK_BG}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover scale-110
                   blur-[3px] group-hover:blur-0 transition-[filter] duration-300"
        onError={(e) => {
          e.currentTarget.src = FALLBACK_BG;
        }}
      />

      {/* 다크 오버레이 */}
      <div className="absolute inset-0 bg-black/50 group-hover:bg-black/35 transition-colors duration-200" />

      {/* 키워드 텍스트 */}
      <div className="absolute inset-0 flex items-center justify-center px-2">
        <span
          className="text-white font-bold text-sm text-center leading-tight capitalize"
          style={{ textShadow: '0 1px 6px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.5)' }}
        >
          {item.keyword}
        </span>
      </div>

      {/* 발견 건수 배지 — 우하단 */}
      <span
        className={cn(
          'absolute bottom-1.5 right-1.5',
          'text-[10px] font-semibold text-white/90 bg-black/55',
          'px-1.5 py-0.5 rounded-full leading-none',
        )}
      >
        ×{item.count}
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────
// HotKeywordWall
// ─────────────────────────────────────────────────────────────
interface HotKeywordWallProps {
  onKeywordClick: (keyword: string) => void;
  className?: string;
}

export const HotKeywordWall = ({
  onKeywordClick,
  className,
}: HotKeywordWallProps) => {
  const { keywords, loading } = useHotKeywords(12, 7);

  // 로딩 완료 후 키워드가 없으면 섹션 자체를 숨김
  if (!loading && keywords.length === 0) return null;

  return (
    <div className={cn('mb-5', className)}>
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base leading-none">🔥</span>
        <h3 className="text-sm font-semibold text-foreground leading-none">
          This Week's Hot Keywords
        </h3>
        <span className="text-[11px] text-muted-foreground leading-none">최근 7일</span>
      </div>

      {/* 가로 스크롤 카드 행 */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 no-scrollbar">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton
                key={i}
                className="shrink-0 w-40 h-[100px] rounded-xl"
              />
            ))
          : keywords.map((item) => (
              <KeywordCard
                key={item.keyword}
                item={item}
                onClick={() => onKeywordClick(item.keyword)}
              />
            ))}
      </div>
    </div>
  );
};
