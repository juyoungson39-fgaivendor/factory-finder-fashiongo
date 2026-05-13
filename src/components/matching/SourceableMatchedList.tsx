/**
 * SourceableMatchedList
 * ───────────────────────────────────────────────────────────────────
 * trend_sourceable_matches 결과를 테이블 형태로 렌더링.
 * 상태 배지 + 상태별 액션 버튼 + 일괄 승인/보류를 포함한다.
 *
 * Props
 *   items               — 매칭 목록
 *   loading             — 로딩 여부 (skeleton 표시)
 *   currentStatus       — 현재 탭 상태
 *   isAdmin             — 관리자 여부 (액션·체크박스 표시)
 *   onStatusChange      — 단건 상태 변경 콜백
 *   onBulkStatusChange  — 일괄 상태 변경 콜백 (admin only)
 */

import { useState, useEffect, useRef } from 'react';
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
  isAdmin?: boolean;
  onStatusChange: (id: string, newStatus: string) => Promise<void>;
  onBulkStatusChange?: (ids: string[], newStatus: string) => Promise<void>;
}

// ─── 상태 맵 ──────────────────────────────────────────────────────────
export const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending_confirm: { label: '컨펌대기', cls: 'bg-amber-100 text-amber-700 border border-amber-200' },
  approved:        { label: '승인',     cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  rejected:        { label: '보류',     cls: 'bg-slate-100 text-slate-600 border border-slate-200' },
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

// ─── 단건 액션 셀 ─────────────────────────────────────────────────────
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

  if (item.status === 'pending_confirm') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="default" disabled={busy} className="text-xs h-7 whitespace-nowrap" onClick={() => update('approved')}>✓ 승인</Button>
        <Button size="sm" variant="outline" disabled={busy} className="text-xs h-7 whitespace-nowrap" onClick={() => update('rejected')}>✕ 보류</Button>
      </div>
    );
  }
  if (item.status === 'approved') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="default" disabled={busy} className="text-xs h-7 whitespace-nowrap" onClick={() => update('active')}>✓ 활성화</Button>
        <Button size="sm" variant="outline" disabled={busy} className="text-xs h-7 whitespace-nowrap" onClick={() => update('rejected')}>✕ 보류로</Button>
      </div>
    );
  }
  if (item.status === 'rejected') {
    return (
      <Button size="sm" variant="outline" disabled={busy} className="text-xs h-7 whitespace-nowrap" onClick={() => update('pending_confirm')}>↺ 재컨펌대기</Button>
    );
  }
  if (item.status === 'active') {
    return (
      <Button size="sm" variant="ghost" disabled={busy} className="text-xs h-7 text-muted-foreground hover:text-foreground whitespace-nowrap" onClick={() => update('rejected')}>✕ 보류로</Button>
    );
  }
  return null;
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────
export function SourceableMatchedList({
  items,
  loading,
  currentStatus,
  isAdmin = false,
  onStatusChange,
  onBulkStatusChange,
}: SourceableMatchedListProps) {

  // ── 선택 상태 ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy,    setBulkBusy]    = useState(false);
  const allCheckRef = useRef<HTMLInputElement>(null);

  // items 변경(탭·페이지 이동) 시 선택 초기화
  useEffect(() => { setSelectedIds(new Set()); }, [items]);

  // 전체 선택 체크박스 indeterminate 상태
  useEffect(() => {
    if (!allCheckRef.current) return;
    const total    = items.length;
    const selected = selectedIds.size;
    allCheckRef.current.indeterminate = selected > 0 && selected < total;
    allCheckRef.current.checked       = total > 0 && selected === total;
  }, [selectedIds, items]);

  const toggleAll = () => {
    setSelectedIds(selectedIds.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBulk = async (newStatus: string) => {
    if (!onBulkStatusChange || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await onBulkStatusChange([...selectedIds], newStatus);
      setSelectedIds(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  // ── 컬럼 설정 ─────────────────────────────────────────────────────
  // admin: 체크박스 | 트렌드 | 소싱상품 | 점수 | 상태 | 등록일 | 액션
  // general:            트렌드 | 소싱상품 | 점수 | 상태 | 등록일
  const colCount = isAdmin ? 7 : 5;

  // ── 일괄 액션 버튼 ────────────────────────────────────────────────
  const bulkButtons = () => {
    if (currentStatus === 'pending_confirm') return (
      <>
        <Button size="sm" variant="default" disabled={bulkBusy} className="text-xs h-7 whitespace-nowrap" onClick={() => handleBulk('approved')}>✓ 일괄 승인</Button>
        <Button size="sm" variant="outline" disabled={bulkBusy} className="text-xs h-7 whitespace-nowrap" onClick={() => handleBulk('rejected')}>✕ 일괄 보류</Button>
      </>
    );
    if (currentStatus === 'approved') return (
      <>
        <Button size="sm" variant="default" disabled={bulkBusy} className="text-xs h-7 whitespace-nowrap" onClick={() => handleBulk('active')}>✓ 일괄 활성화</Button>
        <Button size="sm" variant="outline" disabled={bulkBusy} className="text-xs h-7 whitespace-nowrap" onClick={() => handleBulk('rejected')}>✕ 일괄 보류로</Button>
      </>
    );
    if (currentStatus === 'rejected') return (
      <Button size="sm" variant="outline" disabled={bulkBusy} className="text-xs h-7 whitespace-nowrap" onClick={() => handleBulk('pending_confirm')}>↺ 일괄 재컨펌대기</Button>
    );
    if (currentStatus === 'active') return (
      <Button size="sm" variant="outline" disabled={bulkBusy} className="text-xs h-7 text-muted-foreground hover:text-foreground whitespace-nowrap" onClick={() => handleBulk('rejected')}>✕ 일괄 보류로</Button>
    );
    return null;
  };

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border cursor-default">

      {/* ── 일괄 액션 바 (선택된 항목이 있을 때만) ─────────────────── */}
      {isAdmin && onBulkStatusChange && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-border">
          <span className="text-xs font-semibold text-foreground tabular-nums">
            {selectedIds.size.toLocaleString()}건 선택됨
          </span>
          <div className="flex items-center gap-1.5">
            {bulkButtons()}
          </div>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: isAdmin ? 920 : 860 }}>
        <thead>
          <tr className="bg-muted/50">
            {/* 체크박스 헤더 — admin만 */}
            {isAdmin && (
              <th className="px-3 py-2.5 border-b border-border w-[40px]">
                <input
                  ref={allCheckRef}
                  type="checkbox"
                  disabled={loading || items.length === 0}
                  onChange={toggleAll}
                  className="w-3.5 h-3.5 rounded accent-primary cursor-pointer"
                  aria-label="전체 선택"
                />
              </th>
            )}
            {(['트렌드', '소싱상품', '점수', '상태', '등록일'] as const).map((h) => (
              <th
                key={h}
                className="text-left text-[11px] font-medium text-muted-foreground tracking-wide px-3 py-2.5 border-b border-border whitespace-nowrap"
              >
                {h}
              </th>
            ))}
            {isAdmin && (
              <th className="text-left text-[11px] font-medium text-muted-foreground tracking-wide px-3 py-2.5 border-b border-border whitespace-nowrap">
                액션
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border">
                {isAdmin && <td className="px-3 py-3"><Skeleton className="w-3.5 h-3.5 rounded" /></td>}
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <Skeleton className="w-12 h-16 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-20" /></div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-2">
                    <Skeleton className="w-12 h-16 flex-shrink-0" />
                    <div className="space-y-1.5 flex-1"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-16" /></div>
                  </div>
                </td>
                <td className="px-3 py-3"><Skeleton className="h-3 w-14" /></td>
                <td className="px-3 py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="px-3 py-3"><Skeleton className="h-3 w-20" /></td>
                {isAdmin && <td className="px-3 py-3"><Skeleton className="h-7 w-24 rounded" /></td>}
              </tr>
            ))
          ) : items.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="py-12 text-center text-sm text-muted-foreground">
                {STATUS_MAP[currentStatus]?.label ?? currentStatus} 상태의 매칭 데이터가 없습니다.
              </td>
            </tr>
          ) : (
            items.map((item) => {
              const sd        = item.trend?.source_data ?? {};
              const tName     = (sd.trend_name ?? sd.article_title ?? '') as string;
              const tImg      = ((sd.image_url ?? '') as string).trim();
              const tUrl      = (sd.permalink ?? '') as string;
              const tPlatform = (sd.platform ?? '') as string;

              const sp      = item.sourceable_product;
              const spName  = sp?.item_name_en ?? sp?.item_name ?? '—';
              const spImg   = sp?.image_url ?? (Array.isArray(sp?.images) ? sp!.images![0] : null);
              const spPrice = sp?.unit_price_usd;

              const pct = Math.round(item.match_score * 100);
              const sty = scoreStyle(item.match_score);
              const isSelected = selectedIds.has(item.id);

              return (
                <tr
                  key={item.id}
                  className={cn(
                    'border-b border-border last:border-b-0 transition-colors',
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                  )}
                >
                  {/* 체크박스 — admin만 */}
                  {isAdmin && (
                    <td className="px-3 py-3 align-top w-[40px]">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(item.id)}
                        className="w-3.5 h-3.5 rounded accent-primary cursor-pointer mt-1"
                        aria-label="행 선택"
                      />
                    </td>
                  )}

                  {/* 트렌드 */}
                  <td className="px-3 py-3 align-top min-w-[200px] max-w-[260px]">
                    <div className="flex gap-2">
                      <ImgCell src={tImg || undefined} alt={tName} />
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">{tName || '—'}</p>
                        {tPlatform && <span className="text-[10px] text-muted-foreground capitalize">{tPlatform}</span>}
                        {item.trend?.trend_keywords && item.trend.trend_keywords.length > 0 && (
                          <div className="flex flex-wrap gap-0.5">
                            {item.trend.trend_keywords.slice(0, 4).map((k, i) => (
                              <span key={i} className="text-[9px] px-1.5 py-0 rounded-full bg-secondary text-secondary-foreground leading-4">{k}</span>
                            ))}
                          </div>
                        )}
                        {tUrl && (
                          <a href={tUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700">
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
                        <p className="text-xs font-medium text-foreground line-clamp-2 leading-snug">{spName}</p>
                        {spPrice != null && <p className="text-xs font-semibold">${spPrice.toFixed(2)}</p>}
                        {sp?.factory && (
                          <div className="text-[10px] text-muted-foreground">
                            {sp.factory.name}{sp.factory.country ? ` · ${sp.factory.country}` : ''}
                          </div>
                        )}
                        {(sp?.category || sp?.fg_category) && (
                          <span className="text-[10px] text-muted-foreground">{sp!.fg_category ?? sp!.category}</span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 점수 */}
                  <td className="px-3 py-3 align-top w-[100px]">
                    <div className="space-y-1">
                      <span className={cn('text-xs font-bold', sty.text)}>{pct}%</span>
                      <div className="h-1.5 w-16 bg-gray-200 rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all', sty.bar)} style={{ width: `${pct}%` }} />
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

                  {/* 단건 액션 — admin만 */}
                  {isAdmin && (
                    <td className="px-3 py-3 align-top w-[160px]">
                      <ActionCell item={item} onStatusChange={onStatusChange} />
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
