import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductTable, { type ProductRow } from "@/components/product/ProductTable";
import CSVUploadDialog from "@/components/product/CSVUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type SortKey = "newest" | "price-asc" | "price-desc" | "product_no";
type PageSize = 10 | 20 | 50 | 100;

const SourceableAgent = () => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);

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
        (p) => (p.product_no ?? "").toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q)
      );
    }
    switch (sort) {
      case "price-asc":  return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-desc": return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "product_no": return [...list].sort((a, b) => (a.product_no ?? "").localeCompare(b.product_no ?? ""));
      default:           return list;
    }
  }, [items, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // 검색/정렬 변경 시 1페이지로 리셋
  const handleSearch = (v: string) => { setSearch(v); setCurrentPage(1); };
  const handleSort = (v: SortKey) => { setSort(v); setCurrentPage(1); };
  const handlePageSize = (v: string) => { setPageSize(Number(v) as PageSize); setCurrentPage(1); };

  return (
    <div className="p-6 space-y-4">
      {/* 검색/정렬/액션 바 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="상품코드 / 카테고리 검색..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-64"
          />
          <Select value={sort} onValueChange={(v) => handleSort(v as SortKey)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">최신순</SelectItem>
              <SelectItem value="price-asc">가격 낮은순</SelectItem>
              <SelectItem value="price-desc">가격 높은순</SelectItem>
              <SelectItem value="product_no">코드순</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <CSVUploadDialog />
          <span className="text-sm text-muted-foreground">총 {filtered.length}개 상품</span>
        </div>
      </div>

      {/* 페이지당 노출 수 + 페이지 정보 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={handlePageSize}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10개씩 보기</SelectItem>
              <SelectItem value="20">20개씩 보기</SelectItem>
              <SelectItem value="50">50개씩 보기</SelectItem>
              <SelectItem value="100">100개씩 보기</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs">
            {filtered.length === 0 ? "0개" : `${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length}개`}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs">
          <span>{safePage} / {totalPages}</span>
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto">
        <ProductTable
          items={paginated}
          isLoading={isLoading}
          emptyText="소싱 가능 상품이 없습니다"
          tableName="sourceable_products"
          queryKey={["sourceable-products", "agent"]}
        />
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-4">
          <button
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            disabled={safePage <= 1}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4,
              border: '1px solid #e1e3e5', background: '#fff',
              color: safePage <= 1 ? '#b5b5b5' : '#202223',
              cursor: safePage <= 1 ? 'default' : 'pointer',
            }}
          >
            ← 이전
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(page =>
              page === 1 || page === totalPages ||
              Math.abs(page - safePage) <= 2
            )
            .reduce<(number | '...')[]>((acc, page, idx, arr) => {
              if (idx > 0 && (page as number) - (arr[idx - 1] as number) > 1) acc.push('...');
              acc.push(page);
              return acc;
            }, [])
            .map((page, idx) =>
              page === '...' ? (
                <span key={`ellipsis-${idx}`} style={{ padding: '6px 4px', fontSize: 12, color: '#b5b5b5' }}>…</span>
              ) : (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page as number)}
                  style={{
                    padding: '6px 10px', fontSize: 12, minWidth: 34, borderRadius: 4,
                    fontWeight: page === safePage ? 700 : 400,
                    border: page === safePage ? '1px solid #2c6ecb' : '1px solid #e1e3e5',
                    background: page === safePage ? '#f2f7fe' : '#fff',
                    color: page === safePage ? '#2c6ecb' : '#202223',
                    cursor: 'pointer',
                  }}
                >
                  {page}
                </button>
              )
            )}
          <button
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            disabled={safePage >= totalPages}
            style={{
              padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 4,
              border: '1px solid #e1e3e5', background: '#fff',
              color: safePage >= totalPages ? '#b5b5b5' : '#202223',
              cursor: safePage >= totalPages ? 'default' : 'pointer',
            }}
          >
            다음 →
          </button>
        </div>
      )}
    </div>
  );
};

export default SourceableAgent;
