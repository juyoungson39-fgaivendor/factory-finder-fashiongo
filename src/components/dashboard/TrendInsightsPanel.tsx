import { Link } from 'react-router-dom';
import { useHotKeywords } from '@/hooks/useHotKeywords';
import { useSnsTrendFeed, type PlatformFilter } from '@/hooks/useSnsTrendFeed';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=400&fit=crop';

const PLATFORMS: { key: PlatformFilter; label: string; emoji: string; color: string }[] = [
  { key: 'tiktok',    label: 'TikTok',    emoji: '🎵', color: '#000000' },
  { key: 'instagram', label: 'Instagram', emoji: '📸', color: '#E4405F' },
  { key: 'pinterest', label: 'Pinterest', emoji: '📌', color: '#BD081C' },
  { key: 'shein',     label: 'SHEIN',     emoji: '🛍️', color: '#000000' },
  { key: 'zara',      label: 'ZARA',      emoji: '🧥', color: '#222222' },
];

// ─────────────────────────────────────────────────────────────
// Top Keywords (10)
// ─────────────────────────────────────────────────────────────
const TopKeywords = () => {
  const { keywords, loading } = useHotKeywords(10, 14);

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e1e3e5',
        borderRadius: 6,
        boxShadow: '0 1px 0 rgba(26,26,26,0.07)',
        marginBottom: 16,
        overflow: 'hidden',
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5' }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 14 }}>🔥</span>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>
            트렌드 리포트 — TOP 10 키워드
          </span>
          <span style={{ fontSize: 11, color: '#6d7175' }}>최근 14일</span>
        </div>
        <Link
          to="/trend-report"
          style={{ fontSize: 11, color: '#008060', fontWeight: 500 }}
          className="hover:underline"
        >
          리포트 전체 보기 →
        </Link>
      </div>
      <div style={{ padding: '12px 16px' }}>
        {loading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        ) : keywords.length === 0 ? (
          <p style={{ fontSize: 12, color: '#6d7175', padding: '8px 0' }}>
            아직 집계된 키워드가 없습니다.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {keywords.map((kw, idx) => (
              <Link
                key={kw.keyword}
                to={`/trend-recommendation?keyword=${encodeURIComponent(kw.keyword)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border hover:border-primary hover:bg-primary/5 transition-colors group"
                style={{ fontSize: 12 }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: idx < 3 ? '#e0387a' : '#6d7175',
                    minWidth: 14,
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontWeight: 500, color: '#202223' }} className="capitalize">
                  {kw.keyword}
                </span>
                <span
                  style={{ fontSize: 10, color: '#6d7175', fontWeight: 600 }}
                  className="group-hover:text-primary"
                >
                  {kw.count}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Platform Feed Column (5 items per platform)
// ─────────────────────────────────────────────────────────────
const PlatformColumn = ({
  platform,
}: {
  platform: typeof PLATFORMS[number];
}) => {
  const { items, loading } = useSnsTrendFeed(platform.key);
  const top5 = items.slice(0, 5);

  return (
    <div
      className="flex flex-col"
      style={{
        background: '#ffffff',
        border: '1px solid #e1e3e5',
        borderRadius: 6,
        boxShadow: '0 1px 0 rgba(26,26,26,0.07)',
        overflow: 'hidden',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '10px 12px',
          borderBottom: '1px solid #e1e3e5',
          background: '#fafbfb',
        }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <span style={{ fontSize: 13 }}>{platform.emoji}</span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: platform.color,
              letterSpacing: 0.2,
            }}
            className="truncate"
          >
            {platform.label}
          </span>
        </div>
        <span style={{ fontSize: 10, color: '#6d7175' }}>
          {loading ? '…' : `${top5.length}/5`}
        </span>
      </div>

      {/* Feed list */}
      <div className="flex-1" style={{ padding: '8px' }}>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-2">
                <Skeleton className="w-12 h-16 rounded shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-2.5 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : top5.length === 0 ? (
          <div
            style={{
              padding: '24px 8px',
              fontSize: 11,
              color: '#8c9196',
              textAlign: 'center',
            }}
          >
            수집된 피드가 없습니다.
          </div>
        ) : (
          <ul className="space-y-1.5">
            {top5.map((item, idx) => {
              const title =
                item.trend_name ||
                item.article_title ||
                item.trend_keywords?.[0] ||
                item.summary_ko ||
                '제목 없음';
              const href = item.permalink || '#';
              return (
                <li key={item.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-2 p-1.5 rounded hover:bg-muted/60 transition-colors group"
                  >
                    <div
                      className="relative shrink-0 rounded overflow-hidden bg-muted"
                      style={{ width: 44, height: 56 }}
                    >
                      <img
                        src={item.image_url || FALLBACK_IMG}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = FALLBACK_IMG;
                        }}
                      />
                      <span
                        className="absolute top-0 left-0 text-white font-bold"
                        style={{
                          fontSize: 9,
                          padding: '1px 4px',
                          background: 'rgba(0,0,0,0.65)',
                          borderBottomRightRadius: 4,
                        }}
                      >
                        {idx + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <p
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: '#202223',
                          lineHeight: 1.3,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                        className="group-hover:text-primary"
                      >
                        {title}
                      </p>
                      <div
                        className="flex items-center gap-1.5"
                        style={{ fontSize: 9, color: '#6d7175', marginTop: 2 }}
                      >
                        {item.author && (
                          <span className="truncate" style={{ maxWidth: 80 }}>
                            @{item.author}
                          </span>
                        )}
                        {item.like_count > 0 && <span>❤ {formatCount(item.like_count)}</span>}
                        {item.view_count > 0 && <span>👁 {formatCount(item.view_count)}</span>}
                      </div>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─────────────────────────────────────────────────────────────
// Main Panel
// ─────────────────────────────────────────────────────────────
const TrendInsightsPanel = ({ className }: { className?: string }) => {
  return (
    <div className={cn(className)}>
      {/* Top 10 Keywords */}
      <TopKeywords />

      {/* Platform feeds — 5 columns × 5 items */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e1e3e5',
          borderRadius: 6,
          boxShadow: '0 1px 0 rgba(26,26,26,0.07)',
          marginBottom: 16,
          overflow: 'hidden',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{ padding: '14px 20px', borderBottom: '1px solid #e1e3e5' }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14 }}>📡</span>
            <span style={{ fontSize: 13, fontWeight: 500, color: '#202223' }}>
              주요 플랫폼 TOP 피드
            </span>
            <span style={{ fontSize: 11, color: '#6d7175' }}>
              플랫폼별 5건 — 패션 트렌드
            </span>
          </div>
          <Link
            to="/trend-recommendation"
            style={{ fontSize: 11, color: '#008060', fontWeight: 500 }}
            className="hover:underline"
          >
            전체 피드 보기 →
          </Link>
        </div>
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
            padding: 12,
          }}
        >
          {PLATFORMS.map((p) => (
            <PlatformColumn key={p.key} platform={p} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrendInsightsPanel;
