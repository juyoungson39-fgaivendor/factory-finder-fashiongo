import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown } from 'lucide-react';
import ProductTable, { type ProductRow } from '@/components/product/ProductTable';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

const SourceableAgent = () => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['sourceable-products', 'agent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sourceable_products')
        .select('*')
        .eq('source', 'agent')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.item_name.toLowerCase().includes(q) || (p.style_no ?? '').toLowerCase().includes(q));
    }
    switch (sort) {
      case 'price-asc': return [...list].sort((a, b) => (a.unit_price ?? 0) - (b.unit_price ?? 0));
      case 'price-desc': return [...list].sort((a, b) => (b.unit_price ?? 0) - (a.unit_price ?? 0));
      case 'name': return [...list].sort((a, b) => a.item_name.localeCompare(b.item_name));
      default: return list;
    }
  }, [items, search, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6d7175' }} />
          <Input placeholder="상품명 / 스타일번호 검색..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-[13px]" style={{ borderColor: '#e1e3e5' }} />
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[130px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <ArrowUpDown className="w-3.5 h-3.5 mr-1" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="price-asc">가격 낮은순</SelectItem>
            <SelectItem value="price-desc">가격 높은순</SelectItem>
            <SelectItem value="name">이름순</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-[12px]" style={{ color: '#6d7175' }}>{isLoading ? '로딩 중...' : `총 ${filtered.length}개 상품`}</div>
      <ProductTable items={filtered} isLoading={isLoading} emptyText="Angel Agent가 추출한 소싱 가능 상품이 없습니다" />
    </div>
  );
};

export default SourceableAgent;
