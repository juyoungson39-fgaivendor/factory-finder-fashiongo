import React, { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ProductTable, { type ProductRow } from "@/components/product/ProductTable";
import CSVUploadDialog from "@/components/product/CSVUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────
type SortKey = "newest" | "price-asc" | "price-desc" | "product_no";
const SORT_LABELS: Record<SortKey, string> = {
  newest:       "최신순",
  "price-asc":  "가격 낮은순",
  "price-desc": "가격 높은순",
  product_no:   "코드순",
};

type StatusFilter = "active" | "archived" | "all";
type SourceKey = "agent_auto" | "csv_upload" | "manual" | "seed";
const ALL_SOURCES: SourceKey[] = ["agent_auto", "csv_upload", "manual", "seed"];
const SOURCE_LABEL: Record<SourceKey, string> = {
  agent_auto: "Agent",
  csv_upload: "CSV",
  manual:     "수동",
  seed:       "시드",
};

interface FilterState {
  status:             StatusFilter;
  sources:            SourceKey[];
  search:             string;
  categories:         string[];
  vendors:            string[];
  dateRange:          string;   // '' | '1' | '7' | '15' | '30'
  dateFrom:           string;
  dateTo:             string;
  priceMin:           string;
  priceMax:           string;
  weightMin:          string;
  weightMax:          string;
  detectedColors:     string[];
  detectedStyles:     string[];
  detectedMaterials:  string[];
}

const defaultFilters: FilterState = {
  status:            "active",
  sources:           [...ALL_SOURCES],
  search:            "",
  categories:        [],
  vendors:           [],
  dateRange:         "",
  dateFrom:          "",
  dateTo:            "",
  priceMin:          "",
  priceMax:          "",
  weightMin:         "",
  weightMax:         "",
  detectedColors:    [],
  detectedStyles:    [],
  detectedMaterials: [],
};

// ─────────────────────────────────────────────
// Filter panel style tokens (match trend page)
// ─────────────────────────────────────────────
const rowCls   = "flex items-start gap-3 py-2 border-b border-border/50";
const labelCls = "text-xs font-medium text-muted-foreground min-w-[72px] pt-1 shrink-0";
const cbCls    = "w-3.5 h-3.5 rounded accent-primary";

function toggleArr<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val];
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const SourceableAgent = () => {
  const [filters, setFilters]               = useState<FilterState>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(defaultFilters);
  const [sort, setSort]                     = useState<SortKey>("newest");
  const [detailOpen, setDetailOpen]         = useState(false);

  // ── Query key depends only on committed source filter ──────────
  const queryKey = [
    "sourceable-products",
    "all",
    appliedFilters.sources.join(","),
  ];

  // ── Fetch all items (server-side: source only; rest are client-side) ──
  const { data: items = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("sourceable_products")
        .select("*")
        .order("created_at", { ascending: false });
      if (
        appliedFilters.sources.length > 0 &&
        appliedFilters.sources.length < ALL_SOURCES.length
      ) {
        q = q.in("source", appliedFilters.sources);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  // ── Derive distinct values for filter options ──────────────────
  const distinctCategories = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of items) if (p.category) cnt[p.category] = (cnt[p.category] ?? 0) + 1;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [items]);

  const distinctVendors = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of items) {
      const v = p.vendor_name || "";
      cnt[v] = (cnt[v] ?? 0) + 1;
    }
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }, [items]);

  const distinctDetectedColors = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of items)
      for (const c of p.detected_colors ?? [])
        cnt[c] = (cnt[c] ?? 0) + 1;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([c]) => c);
  }, [items]);

  const distinctDetectedStyles = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of items)
      if (p.detected_style) cnt[p.detected_style] = (cnt[p.detected_style] ?? 0) + 1;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([s]) => s);
  }, [items]);

  const distinctDetectedMaterials = useMemo(() => {
    const cnt: Record<string, number> = {};
    for (const p of items)
      if (p.detected_material) cnt[p.detected_material] = (cnt[p.detected_material] ?? 0) + 1;
    return Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([m]) => m);
  }, [items]);

  // ── Status counts from full fetched data ──────────────────────
  const counts = useMemo(() => ({
    active:   items.filter((p) => p.status === "active").length,
    archived: items.filter((p) => p.status === "archived").length,
    all:      items.length,
  }), [items]);

  // ── Client-side filtering + sorting ───────────────────────────
  const filtered = useMemo(() => {
    let list = items;
    const af = appliedFilters;

    // status
    if (af.status !== "all")
      list = list.filter((p) => p.status === af.status);

    // search
    if (af.search) {
      const q = af.search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.product_no ?? "").toLowerCase().includes(q) ||
          (p.category   ?? "").toLowerCase().includes(q) ||
          (p.item_name  ?? "").toLowerCase().includes(q)
      );
    }

    // categories
    if (af.categories.length > 0)
      list = list.filter((p) => p.category && af.categories.includes(p.category));

    // vendors
    if (af.vendors.length > 0)
      list = list.filter((p) => af.vendors.includes(p.vendor_name ?? ""));

    // date range (created_at)
    if (af.dateRange || af.dateFrom || af.dateTo) {
      const now = Date.now();
      if (af.dateRange) {
        const days   = parseInt(af.dateRange, 10);
        const cutoff = now - days * 86_400_000;
        list = list.filter((p) => new Date(p.created_at).getTime() >= cutoff);
      } else {
        if (af.dateFrom) {
          const from = new Date(af.dateFrom).getTime();
          list = list.filter((p) => new Date(p.created_at).getTime() >= from);
        }
        if (af.dateTo) {
          const to = new Date(af.dateTo).getTime() + 86_400_000;
          list = list.filter((p) => new Date(p.created_at).getTime() < to);
        }
      }
    }

    // price (unit_price_usd)
    if (af.priceMin) {
      const min = parseFloat(af.priceMin);
      if (!isNaN(min)) list = list.filter((p) => (p.unit_price_usd ?? 0) >= min);
    }
    if (af.priceMax) {
      const max = parseFloat(af.priceMax);
      if (!isNaN(max)) list = list.filter((p) => (p.unit_price_usd ?? Infinity) <= max);
    }

    // weight (weight_kg)
    if (af.weightMin) {
      const min = parseFloat(af.weightMin);
      if (!isNaN(min)) list = list.filter((p) => (p.weight_kg ?? 0) >= min);
    }
    if (af.weightMax) {
      const max = parseFloat(af.weightMax);
      if (!isNaN(max)) list = list.filter((p) => (p.weight_kg ?? Infinity) <= max);
    }

    // detected colors (any match)
    if (af.detectedColors.length > 0)
      list = list.filter((p) =>
        (p.detected_colors ?? []).some((c) => af.detectedColors.includes(c))
      );

    // detected styles
    if (af.detectedStyles.length > 0)
      list = list.filter((p) => p.detected_style && af.detectedStyles.includes(p.detected_style));

    // detected materials
    if (af.detectedMaterials.length > 0)
      list = list.filter((p) =>
        p.detected_material && af.detectedMaterials.includes(p.detected_material)
      );

    // sort
    switch (sort) {
      case "price-asc":  return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-desc": return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "product_no": return [...list].sort((a, b) =>
        (a.product_no ?? "").localeCompare(b.product_no ?? "")
      );
      default: return list;
    }
  }, [items, appliedFilters, sort]);

  // ── Handlers ──────────────────────────────────────────────────
  const handleSearch = () => setAppliedFilters({ ...filters });
  const handleReset  = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── 페이지 헤더 ────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">소싱가능상품</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Angel Agent가 검증된 공장에서 자동 추출한 소싱 가능 상품
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4 mt-1">
          <CSVUploadDialog />
        </div>
      </div>

      {/* ── 필터 카드 ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card px-5 py-3 space-y-0">

        {/* 행 1: 상태 */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <span className={labelCls}>상태</span>
          <div className="inline-flex rounded-md border border-border overflow-hidden">
            {(["active", "archived", "all"] as StatusFilter[]).map((s, idx) => {
              const label = s === "active" ? "활성" : s === "archived" ? "보관" : "전체";
              const cnt   = counts[s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, status: s }))}
                  className={cn(
                    "text-xs px-3 py-1.5 transition-colors flex items-center gap-1",
                    idx > 0 && "border-l border-border",
                    filters.status === s
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                  <span className={cn("text-[10px]", filters.status === s ? "opacity-80" : "opacity-60")}>
                    ({cnt})
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 행 2: 검색어 */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <span className={labelCls}>검색어</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            placeholder="상품명 / 상품코드 / 카테고리 검색..."
            className="flex-1 text-sm px-3 py-1.5 rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
          />
        </div>

        {/* 행 3: 카테고리 */}
        {distinctCategories.length > 0 && (
          <div className={rowCls}>
            <span className={labelCls}>카테고리</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
              {distinctCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.categories.includes(cat)}
                    onChange={() =>
                      setFilters((f) => ({ ...f, categories: toggleArr(f.categories, cat) }))
                    }
                    className={cbCls}
                  />
                  <span className="text-xs text-foreground">{cat}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 행 4: 출처 */}
        <div className={rowCls}>
          <span className={labelCls}>출처</span>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
            {ALL_SOURCES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.sources.includes(s)}
                  onChange={() =>
                    setFilters((f) => ({
                      ...f,
                      sources: toggleArr(f.sources, s) as SourceKey[],
                    }))
                  }
                  className={cbCls}
                />
                <span className="text-xs text-foreground">{SOURCE_LABEL[s]}</span>
              </label>
            ))}
          </div>
        </div>

        {/* 행 5: 소싱처 */}
        {distinctVendors.length > 0 && (
          <div className={rowCls}>
            <span className={labelCls}>소싱처</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
              {distinctVendors.map((v) => (
                <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.vendors.includes(v)}
                    onChange={() =>
                      setFilters((f) => ({ ...f, vendors: toggleArr(f.vendors, v) }))
                    }
                    className={cbCls}
                  />
                  <span className="text-xs text-foreground">{v || "미지정"}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* 행 6: 등록기간 */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50 flex-wrap">
          <span className={labelCls}>등록기간</span>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex rounded-md border border-border overflow-hidden">
              {(
                [
                  { key: "",   label: "전체" },
                  { key: "1",  label: "어제" },
                  { key: "7",  label: "7일"  },
                  { key: "15", label: "15일" },
                  { key: "30", label: "30일" },
                ] as const
              ).map((opt, idx) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({ ...f, dateRange: opt.key, dateFrom: "", dateTo: "" }))
                  }
                  className={cn(
                    "text-xs px-3 py-1.5 transition-colors",
                    idx > 0 && "border-l border-border",
                    filters.dateRange === opt.key && !filters.dateFrom && !filters.dateTo
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateFrom: e.target.value, dateRange: "" }))
                }
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, dateTo: e.target.value, dateRange: "" }))
                }
                className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[130px]"
              />
            </div>
          </div>
        </div>

        {/* ── 상세검색 펼침 영역 ─────────────────────────────────── */}
        {detailOpen && (
          <div className="border-t border-border/50 space-y-0">

            {/* 행 7: 가격 범위 */}
            <div className={rowCls}>
              <span className={labelCls}>가격 (USD)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  value={filters.priceMin}
                  onChange={(e) => setFilters((f) => ({ ...f, priceMin: e.target.value }))}
                  placeholder="최소"
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[90px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <input
                  type="number"
                  min={0}
                  value={filters.priceMax}
                  onChange={(e) => setFilters((f) => ({ ...f, priceMax: e.target.value }))}
                  placeholder="최대"
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[90px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">USD</span>
              </div>
            </div>

            {/* 행 8: 무게 범위 */}
            <div className={rowCls}>
              <span className={labelCls}>무게 (kg)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={filters.weightMin}
                  onChange={(e) => setFilters((f) => ({ ...f, weightMin: e.target.value }))}
                  placeholder="최소"
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[90px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={filters.weightMax}
                  onChange={(e) => setFilters((f) => ({ ...f, weightMax: e.target.value }))}
                  placeholder="최대"
                  className="text-xs px-2 py-1.5 rounded-md border border-border bg-background text-foreground w-[90px] focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <span className="text-xs text-muted-foreground">kg</span>
              </div>
            </div>

            {/* 행 9a: 색상 감지 */}
            {distinctDetectedColors.length > 0 && (
              <div className={rowCls}>
                <span className={labelCls}>색상 감지</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {distinctDetectedColors.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.detectedColors.includes(c)}
                        onChange={() =>
                          setFilters((f) => ({
                            ...f,
                            detectedColors: toggleArr(f.detectedColors, c),
                          }))
                        }
                        className={cbCls}
                      />
                      <span className="text-xs text-foreground">{c}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 행 9b: 스타일 감지 */}
            {distinctDetectedStyles.length > 0 && (
              <div className={rowCls}>
                <span className={labelCls}>스타일 감지</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {distinctDetectedStyles.map((s) => (
                    <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.detectedStyles.includes(s)}
                        onChange={() =>
                          setFilters((f) => ({
                            ...f,
                            detectedStyles: toggleArr(f.detectedStyles, s),
                          }))
                        }
                        className={cbCls}
                      />
                      <span className="text-xs text-foreground">{s}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 행 9c: 소재 감지 */}
            {distinctDetectedMaterials.length > 0 && (
              <div className={rowCls}>
                <span className={labelCls}>소재 감지</span>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 flex-1">
                  {distinctDetectedMaterials.map((m) => (
                    <label key={m} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.detectedMaterials.includes(m)}
                        onChange={() =>
                          setFilters((f) => ({
                            ...f,
                            detectedMaterials: toggleArr(f.detectedMaterials, m),
                          }))
                        }
                        className={cbCls}
                      />
                      <span className="text-xs text-foreground">{m}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── 하단 액션 버튼 ─────────────────────────────────────── */}
        <div className="flex items-center justify-between pt-3">
          <button
            type="button"
            onClick={() => setDetailOpen(!detailOpen)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {detailOpen ? (
              <>
                <span>상세검색 접기</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>상세검색 펼치기</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
          <div className="flex items-center gap-3">
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
      </div>

      {/* ── 툴바: 건수 + 정렬 ──────────────────────────────────── */}
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
              {SORT_LABELS[sort]}
              <span className="text-[10px]">▼</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <DropdownMenuItem
                key={key}
                onClick={() => setSort(key)}
                className={cn(sort === key && "text-primary font-medium")}
              >
                {SORT_LABELS[key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── 테이블 ──────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <ProductTable
          items={filtered}
          isLoading={isLoading}
          emptyText="소싱 가능 상품이 없습니다"
          tableName="sourceable_products"
          queryKey={queryKey}
        />
      </div>
    </div>
  );
};

export default SourceableAgent;
