import { useState } from 'react';
import { Sparkles, Download, RefreshCw, LayoutGrid, Target, BarChart2, X, Package } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface MatchedProduct {
  product_id: string;
  product_name: string;
  factory_name: string;
  image_url: string;
  similarity: number;
  price: number | null;
}

interface AiKeyword {
  keyword: string;
  type?: string;
}

interface MatrixRow {
  trend_id: string;
  trend_title: string;
  trend_image_url: string | null;
  trend_score: number;
  ai_keywords: AiKeyword[];
  matched_products: MatchedProduct[];
}

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const MAX_PRODUCT_COLS = 5;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function similarityColor(score: number): string {
  if (score >= 0.75) return 'text-emerald-600 font-semibold';
  if (score >= 0.55) return 'text-amber-600 font-semibold';
  return 'text-red-500 font-semibold';
}

function similarityBg(score: number): string {
  if (score >= 0.75) return 'bg-emerald-50 border-emerald-200';
  if (score >= 0.55) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────
const TrendImageCell = ({ src, title }: { src: string | null; title: string }) => (
  src ? (
    <img
      src={src}
      alt={title}
      className="w-12 h-12 rounded-lg object-cover shrink-0 bg-muted border border-border"
    />
  ) : (
    <div className="w-12 h-12 rounded-lg bg-muted shrink-0 flex items-center justify-center border border-border">
      <span className="text-[9px] text-muted-foreground text-center leading-tight px-0.5">No img</span>
    </div>
  )
);

const ProductCell = ({ p }: { p: MatchedProduct }) => (
  <div
    className={cn(
      'flex flex-col gap-1.5 p-2 rounded-lg border min-w-[130px] max-w-[130px]',
      similarityBg(p.similarity)
    )}
  >
    {p.image_url ? (
      <img
        src={p.image_url}
        alt={p.product_name}
        className="w-full h-16 rounded-md object-cover bg-muted"
      />
    ) : (
      <div className="w-full h-16 rounded-md bg-muted flex items-center justify-center">
        <Package className="w-5 h-5 text-muted-foreground/40" />
      </div>
    )}
    <p className="text-[11px] font-medium text-foreground line-clamp-2 leading-tight">
      {p.product_name || '(상품명 없음)'}
    </p>
    <p className="text-[10px] text-muted-foreground truncate">{p.factory_name || '-'}</p>
    <div className="flex items-center justify-between mt-auto">
      <span className={cn('text-[11px] tabular-nums', similarityColor(p.similarity))}>
        {Math.round(p.similarity * 100)}%
      </span>
      {p.price != null && (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          ${p.price.toLocaleString()}
        </span>
      )}
    </div>
  </div>
);

const EmptyProductCell = () => (
  <div className="min-w-[130px] max-w-[130px] h-[120px] rounded-lg border border-dashed border-border flex items-center justify-center">
    <span className="text-[10px] text-muted-foreground/40">—</span>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Row Skeleton
// ─────────────────────────────────────────────────────────────
const RowSkeleton = () => (
  <tr className="border-b border-border">
    {/* Trend cell */}
    <td className="sticky left-0 z-10 bg-white border-r border-border px-3 py-3 min-w-[220px] max-w-[220px]">
      <div className="flex gap-2.5 items-start">
        <Skeleton className="w-12 h-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-1.5 mt-0.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-16" />
          <div className="flex gap-1 mt-1">
            <Skeleton className="h-4 w-14 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        </div>
      </div>
    </td>
    {/* Product cells */}
    {Array.from({ length: MAX_PRODUCT_COLS }).map((_, i) => (
      <td key={i} className="px-2 py-3 align-top">
        <Skeleton className="min-w-[130px] max-w-[130px] h-[120px] rounded-lg" />
      </td>
    ))}
  </tr>
);

// ─────────────────────────────────────────────────────────────
// Sheet Side Panel
// ─────────────────────────────────────────────────────────────
const TrendSheetPanel = ({
  row,
  open,
  onClose,
}: {
  row: MatrixRow | null;
  open: boolean;
  onClose: () => void;
}) => {
  if (!row) return null;
  const products = row.matched_products ?? [];

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border shrink-0">
          <div className="flex items-start gap-3">
            <TrendImageCell src={row.trend_image_url} title={row.trend_title} />
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-sm font-semibold leading-tight line-clamp-2">
                {row.trend_title}
              </SheetTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                트렌드 점수 <span className="font-semibold text-foreground">{row.trend_score}</span>
              </p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {(row.ai_keywords ?? []).slice(0, 5).map((kw) => (
                  <span
                    key={kw.keyword}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary"
                  >
                    {kw.keyword}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Product list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {products.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Package className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">매칭된 상품이 없습니다</p>
              <p className="text-xs text-muted-foreground/60">최소 유사도를 낮춰보세요.</p>
            </div>
          ) : (
            products.map((p) => (
              <div
                key={p.product_id}
                className={cn(
                  'flex gap-2.5 p-2.5 rounded-xl border',
                  similarityBg(p.similarity)
                )}
              >
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.product_name}
                    className="w-16 h-16 rounded-lg object-cover shrink-0 bg-muted"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-muted shrink-0 flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                    {p.product_name || '(상품명 없음)'}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {p.factory_name || '-'}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className={cn(
                        'text-[11px] px-1.5 py-0.5 rounded-full border',
                        similarityBg(p.similarity),
                        similarityColor(p.similarity)
                      )}
                    >
                      유사도 {Math.round(p.similarity * 100)}%
                    </span>
                    {p.price != null && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        ${p.price.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground shrink-0">
          총 {products.length}개 매칭 상품
        </div>
      </SheetContent>
    </Sheet>
  );
};

// ─────────────────────────────────────────────────────────────
// Summary Cards
// ─────────────────────────────────────────────────────────────
const SummaryCards = ({ rows }: { rows: MatrixRow[] }) => {
  const totalTrends = rows.length;
  const matchedRows = rows.filter((r) => r.matched_products.length > 0);
  const matchRate =
    totalTrends > 0 ? Math.round((matchedRows.length / totalTrends) * 100) : 0;

  const allSimilarities = rows.flatMap((r) =>
    r.matched_products.map((p) => p.similarity)
  );
  const avgSimilarity =
    allSimilarities.length > 0
      ? Math.round(
          (allSimilarities.reduce((s, v) => s + v, 0) / allSimilarities.length) * 100
        )
      : 0;

  const cards = [
    {
      label: '분석 트렌드 수',
      value: totalTrends,
      unit: '건',
      icon: LayoutGrid,
      color: '#4f46e5',
    },
    {
      label: '매칭 성공률',
      value: matchRate,
      unit: '%',
      icon: Target,
      color: '#16a34a',
    },
    {
      label: '평균 유사도',
      value: avgSimilarity,
      unit: '%',
      icon: BarChart2,
      color: '#d97706',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="flex items-center gap-3 p-4">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${c.color}18` }}
            >
              <c.icon className="w-5 h-5" style={{ color: c.color }} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground leading-none">{c.label}</p>
              <p className="text-xl font-bold text-foreground mt-1 tabular-nums">
                {c.value}
                <span className="text-sm font-medium text-muted-foreground ml-0.5">{c.unit}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────
const SourcingReport = () => {
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [minSimilarity, setMinSimilarity] = useState<number>(0.3);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<MatrixRow[] | null>(null);
  const [selectedRow, setSelectedRow] = useState<MatrixRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // ── Fetch matrix ──────────────────────────────────────────
  const handleGenerate = async () => {
    setLoading(true);
    setSelectedRow(null);
    setSheetOpen(false);
    try {
      const { data, error } = await (supabase.rpc as any)('get_trend_product_matrix', {
        period_days: periodDays,
        min_similarity: minSimilarity,
        max_products_per_trend: MAX_PRODUCT_COLS,
      });

      if (error) throw error;

      const result = (data ?? []) as MatrixRow[];

      // Ensure ai_keywords and matched_products are always arrays
      const normalized = result.map((r) => ({
        ...r,
        ai_keywords: Array.isArray(r.ai_keywords) ? r.ai_keywords : [],
        matched_products: Array.isArray(r.matched_products) ? r.matched_products : [],
      }));

      setRows(normalized);

      if (normalized.length === 0) {
        toast.warning('해당 기간에 분석된 트렌드가 없습니다. 기간을 늘리거나 트렌드를 수집해주세요.');
      } else {
        const matched = normalized.filter((r) => r.matched_products.length > 0).length;
        toast.success(`${normalized.length}개 트렌드 분석 완료 (매칭 ${matched}건)`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '매트릭스 생성에 실패했습니다';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── CSV export ────────────────────────────────────────────
  const handleExportCSV = () => {
    if (!rows || rows.length === 0) return;

    const productHeaders = Array.from({ length: MAX_PRODUCT_COLS }, (_, i) => [
      `p${i + 1}_product_name`,
      `p${i + 1}_factory_name`,
      `p${i + 1}_similarity`,
      `p${i + 1}_price`,
    ]).flat();

    const headers = ['trend_title', 'trend_score', 'matched_count', ...productHeaders];

    const csvRows = rows.map((r) => {
      const base = [
        `"${r.trend_title.replace(/"/g, '""')}"`,
        r.trend_score,
        r.matched_products.length,
      ];
      const productCols = Array.from({ length: MAX_PRODUCT_COLS }, (_, i) => {
        const p = r.matched_products[i];
        if (!p) return ['', '', '', ''];
        return [
          `"${(p.product_name ?? '').replace(/"/g, '""')}"`,
          `"${(p.factory_name ?? '').replace(/"/g, '""')}"`,
          Math.round(p.similarity * 100),
          p.price ?? '',
        ];
      }).flat();
      return [...base, ...productCols].join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trend_product_matrix_${todayString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV 파일을 다운로드했습니다');
  };

  // ── Row click ─────────────────────────────────────────────
  const handleRowClick = (row: MatrixRow) => {
    setSelectedRow(row);
    setSheetOpen(true);
  };

  // ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Control Bar */}
      <div className="flex flex-wrap gap-3 items-end">
        {/* Period */}
        <div className="w-32">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">기간</label>
          <Select
            value={String(periodDays)}
            onValueChange={(v) => setPeriodDays(Number(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">최근 7일</SelectItem>
              <SelectItem value="14">최근 14일</SelectItem>
              <SelectItem value="30">최근 30일</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Min similarity slider */}
        <div className="w-56">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            최소 유사도{' '}
            <span className="text-foreground font-semibold tabular-nums">
              {Math.round(minSimilarity * 100)}%
            </span>
          </label>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] text-muted-foreground tabular-nums">10%</span>
            <Slider
              min={0.1}
              max={0.9}
              step={0.05}
              value={[minSimilarity]}
              onValueChange={([v]) => setMinSimilarity(v)}
              className="flex-1"
            />
            <span className="text-[11px] text-muted-foreground tabular-nums">90%</span>
          </div>
        </div>

        {/* Generate */}
        <Button
          onClick={handleGenerate}
          disabled={loading}
          className="gap-1.5"
          size="sm"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {loading ? '분석 중...' : '매트릭스 생성'}
        </Button>

        {/* Export CSV */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!rows || rows.length === 0 || loading}
          onClick={handleExportCSV}
        >
          <Download className="w-3.5 h-3.5" />
          CSV 내보내기
        </Button>
      </div>

      {/* Empty state */}
      {!loading && rows === null && (
        <div className="text-center py-20 space-y-3">
          <LayoutGrid className="w-12 h-12 mx-auto text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">
            소싱 인텔리전스 매트릭스
          </p>
          <p className="text-xs text-muted-foreground/70">
            트렌드별 매칭 공장 상품을 한눈에 확인하세요.<br />
            매트릭스 생성 버튼을 눌러 시작하세요.
          </p>
        </div>
      )}

      {/* No data after generate */}
      {!loading && rows !== null && rows.length === 0 && (
        <div className="text-center py-16 space-y-2">
          <p className="text-sm font-medium text-muted-foreground">해당 기간에 트렌드 데이터가 없습니다</p>
          <p className="text-xs text-muted-foreground/60">
            기간을 늘리거나 이미지 트렌드 탭에서 트렌드를 먼저 수집해주세요.
          </p>
        </div>
      )}

      {/* Matrix Table */}
      {(loading || (rows !== null && rows.length > 0)) && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              {/* Sticky header */}
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  <th className="sticky left-0 z-20 bg-muted/60 text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground min-w-[220px] max-w-[220px] border-r border-border">
                    트렌드
                  </th>
                  {Array.from({ length: MAX_PRODUCT_COLS }, (_, i) => (
                    <th
                      key={i}
                      className="text-center px-2 py-2.5 text-xs font-semibold text-muted-foreground min-w-[146px]"
                    >
                      매칭 상품 {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <RowSkeleton key={i} />)
                  : rows!.map((row) => (
                      <tr
                        key={row.trend_id}
                        onClick={() => handleRowClick(row)}
                        className="border-b border-border hover:bg-primary/5 cursor-pointer transition-colors group"
                      >
                        {/* Trend cell — sticky left */}
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-primary/5 transition-colors border-r border-border px-3 py-3 min-w-[220px] max-w-[220px] align-top">
                          <div className="flex gap-2.5 items-start">
                            <TrendImageCell
                              src={row.trend_image_url}
                              title={row.trend_title}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">
                                {row.trend_title || '(제목 없음)'}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5">
                                점수{' '}
                                <span className="font-semibold text-foreground">
                                  {row.trend_score ?? '-'}
                                </span>
                              </p>
                              {/* AI keyword chips */}
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {(row.ai_keywords ?? []).slice(0, 3).map((kw) => (
                                  <span
                                    key={kw.keyword}
                                    className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary truncate max-w-[80px]"
                                  >
                                    {kw.keyword}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Product cells */}
                        {Array.from({ length: MAX_PRODUCT_COLS }, (_, i) => {
                          const p = row.matched_products[i];
                          return (
                            <td key={i} className="px-2 py-3 align-top">
                              {p ? <ProductCell p={p} /> : <EmptyProductCell />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>

          {/* Row count footer */}
          {!loading && rows !== null && rows.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
              총{' '}
              <span className="font-semibold text-foreground">{rows.length}</span>개 트렌드 ·
              행을 클릭하면 전체 매칭 상품을 볼 수 있습니다
            </div>
          )}
        </div>
      )}

      {/* Summary cards — shown after data loaded */}
      {!loading && rows !== null && rows.length > 0 && (
        <SummaryCards rows={rows} />
      )}

      {/* Sheet Side Panel */}
      <TrendSheetPanel
        row={selectedRow}
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
};

export default SourcingReport;
