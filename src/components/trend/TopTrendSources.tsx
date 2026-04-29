import { cn } from '@/lib/utils';
import { useTopTrendSources } from '@/hooks/useTopTrendSources';
import { Skeleton } from '@/components/ui/skeleton';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const PLATFORM_DOMAINS: Record<string, string> = {
  instagram:    'instagram.com',
  tiktok:       'tiktok.com',
  vogue:        'vogue.com',
  elle:         'elle.com',
  wwd:          'wwd.com',
  hypebeast:    'hypebeast.com',
  highsnobiety: 'highsnobiety.com',
  footwearnews: 'footwearnews.com',
  google:       'google.com',
  amazon:       'amazon.com',
  pinterest:    'pinterest.com',
  fashiongo:    'fashiongo.net',
  shein:        'shein.com',
};

const getFavicon = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

// ─────────────────────────────────────────────────────────────
// TopTrendSources
// ─────────────────────────────────────────────────────────────
interface TopTrendSourcesProps {
  className?: string;
}

export const TopTrendSources = ({ className }: TopTrendSourcesProps) => {
  const { sources, loading } = useTopTrendSources(5);

  if (!loading && sources.length === 0) return null;

  return (
    <div className={cn('rounded-xl border border-border bg-card p-3', className)}>
      {/* 헤더 */}
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-sm leading-none">📱</span>
        <h3 className="text-xs font-semibold text-foreground leading-none">
          Top Trend Sources
        </h3>
        <span className="text-[10px] text-muted-foreground leading-none">This Week</span>
      </div>

      {/* 소스 목록 */}
      <ul className="space-y-2">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-2">
                <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-2 w-14" />
                </div>
              </li>
            ))
          : sources.map((src, idx) => {
              const domain = PLATFORM_DOMAINS[src.platform] ?? src.platform;
              const profileUrl =
                src.account_url ||
                (src.platform === 'instagram'
                  ? `https://www.instagram.com/${src.account_name}/`
                  : src.platform === 'tiktok'
                    ? `https://www.tiktok.com/@${src.account_name}`
                    : undefined);

              return (
                <li key={src.id} className="flex items-center gap-2">
                  {/* 순위 */}
                  <span className="text-[10px] font-bold text-muted-foreground/60 w-3 shrink-0 text-right">
                    {idx + 1}
                  </span>
                  {/* 플랫폼 아이콘 */}
                  <img
                    src={getFavicon(domain)}
                    alt={src.platform}
                    className="w-4 h-4 object-contain shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                  {/* 계정 정보 */}
                  <div className="flex-1 min-w-0">
                    {profileUrl ? (
                      <a
                        href={profileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-medium text-foreground hover:text-primary transition-colors truncate block leading-tight"
                        onClick={(e) => e.stopPropagation()}
                      >
                        @{src.account_name}
                      </a>
                    ) : (
                      <span className="text-[11px] font-medium text-foreground truncate block leading-tight">
                        @{src.account_name}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {src.followers != null && (
                        <span className="text-[10px] text-muted-foreground">
                          👥 {formatFollowers(src.followers)}
                        </span>
                      )}
                      {src.total_trends_found != null && (
                        <span className="text-[10px] font-semibold text-primary">
                          {src.total_trends_found}건
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
      </ul>
    </div>
  );
};
