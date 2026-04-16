import { Loader2, Clock } from 'lucide-react';

interface SyncStatusIndicatorProps {
  lastSyncedAt: string | null;
  isSyncing: boolean;
}

/**
 * Shows the last sync time as a relative string, or a loading spinner
 * while a sync is in progress.
 */
export const SyncStatusIndicator = ({
  lastSyncedAt,
  isSyncing,
}: SyncStatusIndicatorProps) => {
  if (isSyncing) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing...
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="h-3.5 w-3.5" />
      {lastSyncedAt ? formatRelativeTime(lastSyncedAt) : 'Never synced'}
    </span>
  );
};

/**
 * Format an ISO timestamp as a human-readable relative time string.
 * e.g. "3 minutes ago", "2 hours ago", "yesterday"
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? '' : 's'} ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay} days ago`;

  return date.toLocaleDateString();
}
