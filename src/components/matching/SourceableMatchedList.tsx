/**
 * SourceableMatchedList
 * ───────────────────────────────────────────────────────────────────
 * trend_sourceable_matches 결과를 테이블 형태로 렌더링.
 * 상태 배지 + 상태별 액션 버튼을 포함한다.
 *
 * Props
 *   items         — 매칭 목록
 *   loading       — 로딩 여부 (skeleton 표시)
 *   currentStatus — 현재 탭 상태
 *   onStatusChange — 상태 변경 콜백 (id, newStatus) → Promise<void>
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import NoImagePlaceholder from '@/components/common/NoImagePlaceholder';
import { Skeleton } from '@/components/ui/skeleton';

// ─── 타입 ─────────────────────────────────────────────────────────────
export interface MatchedItem {
  id: string;
  match_score: number;
  status: string;
  created_at: string;
  trend_analysis_id: string;
  sourceable_product: {
    id: string;
    item_name: string | null;
    item_name_en: string | null;
    image_url: string | null;
    images: string[] | null;
    unit_price_usd: number | null;
    category: string | null;
    fg_category: string | null;
    vendor_name: string | null;
    factory_id: string | null;
    factory: {
      id: string;
      name: string;
      country: string | null;
      city: string | null;
    } | null;
  } | null;
  trend: {
    id: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    source_data: Record<string, any> | null;
    trend_keywords: string[] | null;
    primary_category: string | null;
    lifecycle_stage: string | null;
  } | null;
}

export interface SourceableMatchedListProps {
  items: MatchedItem[];
  loading?: boolean;
  currentStatus: string;
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
}

// ─── 상태 맵 ──────────────────────────────────────────────────────────
export const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending_confirm: { label: '컨펌대기', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  approved:        { label: '승인',     cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  rejected:        { label: '거절',     cls: 'bg-red-100 text-red-600 border border-red-200' },
  active:          { label: '활성',     cls: 'bg-green-100 text-green-700 border border-green-200' },
};

// ─── 점수 컬러 ────────────────────────────────────────────────────────
function scoreStyle(s: number) {
  if (s >= 0.75) return { bar: 'bg-green-500',  text: 'text-green-600' };
  if (s >= 0.55) return { bar: 'bg-amber-400',  text: 'text-amber-600' };
  return              { bar: 'bg-red-400',    text: 'text-red-500'   };
}

// ─── 이미지 셀 ────────────────────────────────────────────────────────
const ImgCell = ({ src, alt }: { src?: string | null; alt?: string }) => {
  const [err, setErr] = useState(false);
  if (!src || err) return <NoImagePlaceholder size="sm" />;
  return (
    <img
      src={src}
      alt={alt ?? ''}
      className="w-[52px] h-[68px] object-cover rounded border border-border"
      onError={() => setErr(true)}
    />
  );
};

// ─── 상태 배지 ────────────────────────────────────────────────────────
export const StatusBadge = ({ status }: { status: string }) => {
  const cfg = STATUS_MAP[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600 border border-gray-200' };
  return (
    <span className={cn(
      'inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap',
      cfg.cls,
    )}>
      {cfg.label}
    </span>
  );
};

// ─── 액션 셀 ─────────────────────────────────────────────────────────
const ActionCell = ({
  item,
  onStatusChange,
}: {
  item: MatchedItem;
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
}) => {
  const [busy, setBusy] = useState(false);

  const update = (newStatus: string) => {
    setBusy(true);
    onStatusChange(item.id, newStatus).finally(() => setBusy(false));
  };

  // pending_confirm → [✓ 승인] [✕ 거절]
  if (item.status === 'pending_confirm') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          size="sm" variant="default" disabled={busy}
          className="text-xs h-7 whitespace-nowrap"
          onClick={() => update('approved')}
        >
          ✓ 승인
        </Button>
        <Button
          size="sm" variant="outline" disabled={busy}
          className="text-xs h-7 whitespace-nowrap"
          onClick={() => update('rejected')}
        >
          ✕ 거절
        </Button>
      </div>
    );
  }

  // approved → [✓ 활성화] [✕ 거절로]
  if (item.status === 'approved') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Button
          size="sm" variant="default" disabled={busy}
          className="text-xs h-7 whitespace-nowrap"
          onClick={() => update('active')}
        >
          ✓ 활성화
        </Button>
        <Button
          size="sm" variant="outline" disabled={busy}
          className="text-xs h-7 whitespace-nowrap"
          onClick={() => update('rejected')}
        >
          ✕ 거절로
        </Button>
      </div>
    );
  }

  // rejected → [↺ 재컨펌대기]
  if (item.status === 'rejected') {
    return (
      <Button
        size="sm" variant="outline" disabled={busy}
        className="text-xs h-7 whitespace-nowrap"
        onClick={() => update('pending_confirm')}
      >
        ↺ 재컨펌대기
      </Button>
    );
  }

  // active → [✕ 거절로]
  if (item.status === 'active') {
    return (
      <Button
        size="sm" variant="ghost" disabled={busy}
        className="text-xs h-7 text-muted-foreground hover:text-foreground whitespace-nowrap"
        onClick={() => update('rejected')}
      >
        ✕ 거절로
      </Button>
    );
  }

  return null;
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────
export function SourceableMatchedList({
  items,
  loading,
  currentStatus,
  onStatusChange,
}: SourceableMatchedListProps) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border cursor-default">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 860 }}>
        <thead>
          <tr className="bg-muted/50">
            {['트렌드', '소싱상품', '점수', '상태', '등록일', '액션'].map((h) => (
              <th
                key={h}
                className="text-left text-[11px] font-medium text-muted-foreground tracking-wide px-3 py-2.5 border-b border-border whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <Skeleton className="w-12 h-16 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <Skeleton className="w-12 h-16 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3"><Skeleton className="h-3 w-14" /></td>
                <td className="px-3 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="px-3 py-3"><Skeleton className="h-3 w-20" /></td>
                <td className="px-3 py-3"><Skeleton className="h-7 w-24 rounded" /></td>
              </tr>
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                {STATUS_MAP[currentStatus]?.label ?? currentStatus} 상태의 매칭 데이터가 없습니다.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const sd      = item.trend?.source_data ?? {};
              const tName   = (sd.trend_name ?? sd.article_title ?? '') as string;
              const tImg    = ((sd.image_url ?? '') as string).trim();
              const tUrl    = (sd.permalink ?? '') as string;
              const tPlatform = (sd.platform ?? '') as string;

              const sp      = item.sourceable_product;
              const spName  = sp?.item_name_en ?? sp?.item_name ?? '—';
              const spImg   = sp?.image_url ?? (Array.isArray(sp?.images) ? sp!.images![0] : null);
              const spPrice = sp?.unit_price_usd;

              const pct   = Math.round(item.match_score * 100);
              const sty   = scoreStyle(item.match_score);

              return (
                <tr
                  key={item.id}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  {/* 트렌드 */}
                  <td className="px-3 py-3 align-top min-w-[200px] max-w-[260px]">
                    <div className="flex gap-2">
                      <ImgCell src={tImg || undefined} alt={tName} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                          {tName || '—'}
                        </p>
                        {tPlatform && (
                          <span className="text-[10px] text-muted-foreground capitalize">{tPlatform}</span>
                        )}
                        {item.trend?.trend_keywords && item.trend.trend_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {item.trend.trend_keywords.slice(0, 4).map((k, i) => (
                              <span
                                key={i}
                                className="text-[9px] px-1.5 py-0 rounded-full bg-secondary text-secondary-foreground leading-4"
                              >
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                        {tUrl && (
                          <a
                            href={tUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700"
                          >
                            <ExternalLink className="w-2.5 h-2.5" />원본
                          </a>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 소싱상품 */}
                  <td className="px-3 py-3 align-top min-w-[200px] max-w-[240px]">
                    <div className="flex gap-2">
                      <ImgCell src={spImg} alt={spName} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">
                          {spName}
                        </p>
                        {spPrice != null && (
                          <p className="text-xs font-semibold">${spPrice.toFixed(2)}</p>
                        )}
                        {sp?.factory && (
                          <div className="text-[10px] text-muted-foreground">
                            {sp.factory.name}
                            {sp.factory.country ? ` · ${sp.factory.country}` : ''}
                          </div>
                        )}
                        {(sp?.category || sp?.fg_category) && (
                          <span className="text-[10px] text-muted-foreground">
                            {sp!.fg_category ?? sp!.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 점수 */}
                  <td className="px-3 py-3 align-top w-[100px]">
                    <div className="space-y-1">
                      <span className={cn('text-xs font-bold', sty.text)}>{pct}%</span>
                      <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={cn('h-full rounded-full transition-all', sty.bar)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </td>

                  {/* 상태 배지 */}
                  <td className="px-3 py-3 align-top w-[90px]">
                    <StatusBadge status={item.status} />
                  </td>

                  {/* 등록일 */}
                  <td className="px-3 py-3 align-top w-[90px]">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(item.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </td>

                  {/* 액션 */}
                  <td className="px-3 py-3 align-top w-[160px]">
                    <ActionCell item={item} onStatusChange={onStatusChange} />
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
