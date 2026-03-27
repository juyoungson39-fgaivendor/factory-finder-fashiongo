import React, { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductTable, { type ProductRow } from "@/components/product/ProductTable";
import CSVUploadDialog from "@/components/product/CSVUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

type SortKey = "newest" | "price-asc" | "price-desc" | "product_no";

const SourceableAgent = () => {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["sourceable-products", "agent"],
    queryFn: async () => {
      const { data, error } = await supabase.
      from("sourceable_products").
      select("*").
      eq("source", "agent").
      order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    }
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
      case "price-asc":
        return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-desc":
        return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "product_no":
        return [...list].sort((a, b) => (a.product_no ?? "").localeCompare(b.product_no ?? ""));
      default:
        return list;
    }
  }, [items, search, sort]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Input
            placeholder="상품코드 / 카테고리 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
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
      <div className="overflow-x-auto">
        <ProductTable items={filtered} isLoading={isLoading} emptyText="소싱 가능 상품이 없습니다" tableName="sourceable_products" queryKey={["sourceable-products", "agent"]} />
      </div>
    </div>
  );

};

export default SourceableAgent;