import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TrendItemDetailSheet } from '@/components/trend/TrendItemDetailSheet';
import type { TrendFeedItem } from '@/hooks/useSnsTrendFeed';

// ─── 타겟 플랫폼 (ImageTrendTab.tsx 와 동일) ───────────────────────────
const TARGET_PLATFORMS = ['zara', 'amazon', 'shein'] as const;
type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

const FALLBACK_IMG =
  'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=500&fit=crop';

// ─── 공통 CSS ────────────────────────────────────────────────────────
const rowCls   = 'flex items-center gap-3 py-2 border-b border-border/50';
const labelCls = 'text-xs font-medium text-muted-foreground min-w-[72px] shrink-0';

// ─── 정렬 옵션 ─────────────────────────────────────────────────────
type SortKey = 'latest' | 'platform';
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest',   label: '최근 수집순' },
  { key: 'platform', label: '플랫폼순'   },
];

// ─── 이미지 셀 (에러 시 fallback) ────────────────────────────────────
const ImgCell = ({ src }: { src: string }) => {
  const [errored, setErrored] = useState(false);
  return (
    <img
      src={errored ? FALLBACK_IMG : src}
      alt=""
      className="w-[60px] h-[80px] object-cover rounded border border-border"
      onError={() => setErrored(true)}
    />
  );
};

// ─── 수집기간 프리셋 ─────────────────────────────────────────────────
const DATE_PRESETS = [
  { key: '',   label: '전체' },
  { key: '1',  label: '1일' },
  { key: '7',  label: '7일'  },
  { key: '15', label: '15일' },
  { key: '30', label: '30일' },
] as const;

// ─── 데이터 타입 ─────────────────────────────────────────────────────
type TrendItem = {
  id: string;
  platform: string;
  image_url: string;
  permalink: string;
  trend_name: string;
  summary_ko: string;
  trend_keywords: string[];
  primary_category: string | null;
  created_at: string;
  price: number | null;
  currency: string | null;
};

/** 가격 포맷 헬퍼 — price 없으면 null 반환 */
function formatTrendPrice(price: unknown, currency: unknown): string | null {
  const p = typeof price === 'number' ? price : null;
  if (p == null || !isFinite(p)) return null;
  const cur = typeof currency === 'string' ? currency.toUpperCase() : 'USD';
  if (cur === 'KRW') return `₩${Math.round(p).toLocaleString()}`;
  if (cur === 'EUR') return `€${p.toFixed(2)}`;
  if (cur === 'GBP') return `£${p.toFixed(2)}`;
  return `$${p.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────
export default function TargetProducts() {

  // ── 필터 폼 상태 (검색 버튼 클릭 전) ────────────────────────────
  const [search,         setSearch]         = useState('');
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [dateRange,      setDateRange]      = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');

  // ── 적용된 필터 상태 (검색 버튼 클릭 후 실제 반영) ──────────────
  const [appliedSearch,         setAppliedSearch]         = useState('');
  const [appliedPlatformFilter, setAppliedPlatformFilter] = useState<string[]>([]);
  const [appliedDateRange,      setAppliedDateRange]      = useState('');
  const [appliedDateFrom,       setAppliedDateFrom]       = useState('');
  const [appliedDateTo,         setAppliedDateTo]         = useState('');

  // ── 정렬 ─────────────────────────────────────────────────────────
  const [sort, setSort] = useState<SortKey>('latest');

  // ── 사이드 패널 상태 ─────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<TrendFeedItem | null>(null);
  const [sheetOpen,    setSheetOpen]    = useState(false);

  // ── 페이지네이션 ─────────────────────────────────────────────────
  const [pageSize, setPageSize]       = useState(20);
  const [currentPage, setCurrentPage] = useState(0);

  // ── 드래그 스크롤 ────────────────────────────────────────────────
  const scrollRef  = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX     = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    isDragging.current = true;
    startX.current     = e.pageX - el.offsetLeft;
    scrollLeft.current = el.scrollLeft;
    el.style.cursor    = 'grabbing';
    el.style.userSelect = 'none';
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    scrollRef.current.scrollLeft = scrollLeft.current - (x - startX.current);
  };
  const handleMouseUp = () => {
    isDragging.current = false;
    if (scrollRef.current) {
      scrollRef.current.style.cursor    = 'grab';
      scrollRef.current.style.userSelect = '';
    }
  };

  // ── 데이터 fetch ─────────────────────────────────────────────────
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['target-trend-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trend_analyses')
        .select('*')
        .eq('status', 'analyzed')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data ?? []).map((row: any) => {
        const sd = row.source_data || {};
        return {
          id:               row.id,
          platform:         (sd.platform || '').toLowerCase().trim(),
          image_url:        (sd.image_url || '').trim() || FALLBACK_IMG,
          permalink:        sd.permalink || '',
          trend_name:       sd.trend_name || sd.article_title || '',
          summary_ko:
            sd.summary_ko && sd.summary_ko !== 'GPT 미연동 - 기본 수집'
              ? sd.summary_ko : '',
          trend_keywords:   row.trend_keywords || [],
          primary_category: row.primary_category ?? sd.primary_category ?? null,
          created_at:       row.created_at,
          price:            typeof sd.price === 'number' ? sd.price : null,
          currency:         typeof sd.currency === 'string' ? sd.currency : null,
        } as TrendItem;
      }).filter((item) =>
        TARGET_PLATFORMS.includes(item.platform as TargetPlatform)
      );
    },
  });

  // ── 검색 실행 ────────────────────────────────────────────────────
  const handleSearch = () => {
    setAppliedSearch(search);
    setAppliedPlatformFilter(platformFilter);
    setAppliedDateRange(dateRange);
    setAppliedDateFrom(dateFrom);
    setAppliedDateTo(dateTo);
    setCurrentPage(0);
  };

  // ── 필터 + 정렬 적용 (appliedX 기반) ────────────────────────────
  const filtered = useMemo(() => {
    let list = [...items];

    // 플랫폼 체크박스 필터 (미선택 = 전체)
    if (appliedPlatformFilter.length > 0) {
      list = list.filter((item) => appliedPlatformFilter.includes(item.platform));
    }

    // 검색어
    const q = appliedSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.trend_name.toLowerCase().includes(q) ||
          item.trend_keywords.some((k) => k.toLowerCase().includes(q)) ||
          (item.primary_category?.toLowerCase().includes(q) ?? false),
      );
    }

    // 수집기간 — 프리셋
    if (appliedDateRange) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(appliedDateRange, 10));
      list = list.filter((item) => new Date(item.created_at) >= cutoff);
    }

    // 수집기간 — 커스텀
    // new Date("YYYY-MM-DD")는 UTC 자정으로 파싱 → KST 9h 차이 발생.
    // 다중 인수 생성자로 로컬(KST) 기준 파싱.
    if (appliedDateFrom) {
      const [y, m, d] = appliedDateFrom.split('-').map(Number);
      const from = new Date(y, m - 1, d, 0, 0, 0, 0);
      list = list.filter((item) => new Date(item.created_at) >= from);
    }
    if (appliedDateTo) {
      const [y, m, d] = appliedDateTo.split('-').map(Number);
      const to = new Date(y, m - 1, d, 23, 59, 59, 999);
      list = list.filter((item) => new Date(item.created_at) <= to);
    }

    // 정렬
    if (sort === 'platform') {
      list.sort((a, b) => a.platform.localeCompare(b.platform));
    }
    // 'latest' → 이미 created_at DESC 순서

    return list;
  }, [items, appliedSearch, appliedPlatformFilter, appliedDateRange, appliedDateFrom, appliedDateTo, sort]);

  // ── TrendItem → TrendFeedItem 변환 ──────────────────────────────
  const toFeedItem = (it: TrendItem): TrendFeedItem => ({
    id:               it.id,
    platform:         it.platform,
    image_url:        it.image_url,
    permalink:        it.permalink,
    author:           '',
    like_count:       0,
    view_count:       0,
    trend_name:       it.trend_name,
    trend_score:      0,
    summary_ko:       it.summary_ko,
    trend_keywords:   it.trend_keywords,
    trend_categories: [],
    search_hashtags:  [],
    ai_analyzed:      false,
    ai_keywords:      [],
    created_at:       it.created_at,
    primary_category: it.primary_category,
    style_tags:       null,
    signal_score:     null,
    supply_gap_score: null,
    lifecycle_stage:  null,
    platform_count:   null,
    engagement_rate:  null,
    source_followers: null,
    match_count:      null,
    top_match_score:  null,
    source_data:      it.price != null ? { price: it.price, currency: it.currency } : undefined,
  });

  // ── 페이지 초기화 (페이지 크기 변경 시) ──────────────────────────
  useEffect(() => { setCurrentPage(0); }, [pageSize]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedItems  = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  // ── 필터 초기화 ──────────────────────────────────────────────────
  const handleReset = () => {
    setSearch('');
    setPlatformFilter([]);
    setDateRange('');
    setDateFrom('');
    setDateTo('');
    setAppliedSearch('');
    setAppliedPlatformFilter([]);
    setAppliedDateRange('');
    setAppliedDateFrom('');
    setAppliedDateTo('');
    setSort('latest');
    setCurrentPage(0);
  };

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── 헤더 ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">타겟상품</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            트렌드 분석 중 Zara · Amazon · Shein 출처로 분류된 타겟 상품 목록
          </p>
        </div>
      </div>

      {/* ── 필터 카드 ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-5 py-3 space-y-0">

        {/* 행 1: 검색어 */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <span className={labelCls}>검색어</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(); } }}
            placeholder="상품명 / 키워드 / 카테고리..."
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>

        {/* 행 2: 수집기간 */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50 flex-wrap">
          <span className={labelCls}>수집기간</span>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {DATE_PRESETS.map((opt, idx) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDateRange(opt.key)}
                  className={cn(
                    'text-xs px-3 py-1.5 transition-colors',
                    idx > 0 && 'border-l border-border',
                    dateRange === opt.key && !dateFrom && !dateTo
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background text-muted-foreground hover:bg-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setDateRange(''); }}
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setDateRange(''); }}
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]"
              />
            </div>
          </div>
        </div>

        {/* 행 3: 플랫폼 */}
        <div className={rowCls}>
          <span className={labelCls}>플랫폼</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
            {TARGET_PLATFORMS.map((p) => (
              <label key={p} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={platformFilter.includes(p)}
                  onChange={() =>
                    setPlatformFilter((prev) =>
                      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
                    )
                  }
                  className="w-3.5 h-3.5 rounded accent-primary"
                />
                <span className="text-xs text-foreground capitalize">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center justify-end gap-3 pt-3">
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            필터 초기화
          </button>
          <button
            type="button"
            onClick={handleSearch}
            className="text-xs px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            검색
          </button>
        </div>
      </div>

      {/* ── 툴바: 건수 + 정렬 ───────────────────────────────────── */}
      <div className="flex items-center gap-2 min-h-[32px]">
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          총 {filtered.length}개 상품
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              {SORT_OPTIONS.find((o) => o.key === sort)?.label}
              <span className="text-[10px]">▼</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {SORT_OPTIONS.map(({ key, label }) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSort(key)}
                className={cn(sort === key && 'text-primary font-medium')}
              >
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── 테이블 ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">
            로딩 중...
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="w-full overflow-x-auto rounded-lg border border-border cursor-grab"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1060 }}>
              <thead>
                <tr className="bg-muted/50">
                  {['이미지', '플랫폼', '상품명', '카테고리', '키워드', '요약', '수집일', '가격', ''].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="text-left text-[11px] font-medium text-muted-foreground tracking-wide px-3 py-2.5 border-b border-border whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pagedItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-muted-foreground text-sm">
                      {search || dateRange || dateFrom || dateTo
                        ? '검색 결과가 없습니다.'
                        : '타겟 상품 데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  pagedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => { setSelectedItem(toFeedItem(item)); setSheetOpen(true); }}
                    >
                      {/* 이미지 */}
                      <td className="px-3 py-2 align-top" style={{ width: 70 }}>
                        <ImgCell src={item.image_url} />
                      </td>

                      {/* 플랫폼 */}
                      <td className="px-3 py-2 align-top w-[90px]">
                        <span className="text-xs text-foreground capitalize">{item.platform}</span>
                      </td>

                      {/* 상품명 */}
                      <td className="px-3 py-2 min-w-[200px] max-w-[280px] align-top">
                        <span className="whitespace-normal break-words text-xs font-medium text-foreground">
                          {item.trend_name || '—'}
                        </span>
                      </td>

                      {/* 카테고리 */}
                      <td className="px-3 py-2 align-top w-[120px]">
                        <span style={{ fontSize: 12, background: 'hsl(var(--muted))', padding: '2px 8px', borderRadius: 4, color: 'hsl(var(--foreground))' }}>
                          {item.primary_category || '—'}
                        </span>
                      </td>

                      {/* 키워드 */}
                      <td className="px-3 py-2 align-top min-w-[160px]">
                        <div className="flex flex-wrap gap-0.5">
                          {item.trend_keywords.slice(0, 5).map((k, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {k}
                            </Badge>
                          ))}
                        </div>
                      </td>

                      {/* 요약 */}
                      <td className="px-3 py-2 align-top min-w-[200px] max-w-[300px] whitespace-normal break-words text-xs text-muted-foreground leading-relaxed">
                        {item.summary_ko || '—'}
                      </td>

                      {/* 수집일 */}
                      <td className="px-3 py-2 align-top w-[90px]">
                        <span className="text-[11px] text-foreground font-medium whitespace-nowrap">
                          {new Date(item.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </td>

                      {/* 가격 */}
                      <td className="px-3 py-2 align-top w-[80px]">
                        {(() => {
                          const priceLabel = formatTrendPrice(item.price, item.currency);
                          return priceLabel ? (
                            <span className="text-[11px] font-semibold text-foreground whitespace-nowrap tabular-nums">
                              {priceLabel}
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/40">—</span>
                          );
                        })()}
                      </td>

                      {/* 링크 */}
                      <td className="px-2 py-2 align-top w-[40px]">
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            title="원본 보기"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 페이지네이션 ────────────────────────────────────────── */}
      {!isLoading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value={10}>10개씩 보기</option>
              <option value={20}>20개씩 보기</option>
              <option value={50}>50개씩 보기</option>
              <option value={100}>100개씩 보기</option>
            </select>
            <span className="text-xs text-muted-foreground">
              {filtered.length > 0
                ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, filtered.length)} / ${filtered.length}개`
                : '0개'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs px-2"
              disabled={currentPage === 0}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              이전
            </Button>
            <span className="text-xs text-muted-foreground px-1">
              {currentPage + 1} / {totalPages}
            </span>
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs px-2"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              다음
            </Button>
          </div>
        </div>
      )}

      {/* ── 사이드 패널 ─────────────────────────────────────────── */}
      <TrendItemDetailSheet
        item={selectedItem}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  );
}
