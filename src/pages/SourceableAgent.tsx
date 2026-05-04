import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
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

type SortKey = "newest" | "price-asc" | "price-desc" | "product_no";

const SORT_LABELS: Record<SortKey, string> = {
  newest:       "최신순",
  "price-asc":  "가격 낮은순",
  "price-desc": "가격 높은순",
  product_no:   "코드순",
};

const SourceableAgent = () => {
  const [search, setSearch] = useState("");
  const [sort, setSort]     = useState<SortKey>("newest");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sourceable-products", "agent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sourceable_products")
        .select("*")
        .eq("source", "agent")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          (p.product_no ?? "").toLowerCase().includes(q) ||
          (p.category   ?? "").toLowerCase().includes(q) ||
          (p.item_name  ?? "").toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "price-asc":  return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-desc": return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "product_no": return [...list].sort((a, b) => (a.product_no ?? "").localeCompare(b.product_no ?? ""));
      default:           return list;
    }
  }, [items, search, sort]);

  return (
    <div className="p-6 space-y-4">
      {/* ── 페이지 헤더 ── */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', marginBottom: 4, letterSpacing: '-0.02em' }}>
            소싱가능상품
          </h1>
          <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>
            Angel Agent가 검증된 공장에서 자동 추출한 소싱 가능 상품
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-4 mt-1">
          <CSVUploadDialog />
        </div>
      </div>

      {/* ── 툴바: 총 상품 수(좌) + 검색·정렬(우) ── */}
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm text-muted-foreground shrink-0">
          총 {filtered.length}개 상품
        </span>
        <div className="flex items-center gap-2">
          <Input
            placeholder="상품명 / 상품코드 / 카테고리 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
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
            <DropdownMenuContent align="end">
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
      </div>

      {/* ── 테이블 ── */}
      <div className="overflow-x-auto">
        <ProductTable
          items={filtered}
          isLoading={isLoading}
          emptyText="소싱 가능 상품이 없습니다"
          tableName="sourceable_products"
          queryKey={["sourceable-products", "agent"]}
        />
      </div>
    </div>
  );
};

export default SourceableAgent;
