import React, { useState, useMemo, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProductTable, { type ProductRow } from '@/components/product/ProductTable';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

const SourceableCSV = () => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['sourceable-products', 'csv_upload'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sourceable_products')
        .select('*')
        .eq('source', 'csv_upload')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(Boolean);
      if (lines.length < 2) throw new Error('CSV에 데이터가 없습니다');
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h.includes('name') || h.includes('상품명'));
      if (nameIdx === -1) throw new Error('상품명(name) 컬럼을 찾을 수 없습니다');

      const rows = lines.slice(1).map((line) => {
        const cols = line.split(',').map((c) => c.trim());
        return {
          user_id: user.id,
          source: 'csv' as const,
          item_name: cols[nameIdx] || 'Unnamed',
          item_name_en: cols[headers.findIndex((h) => h.includes('name_en') || h.includes('영문'))] || null,
          style_no: cols[headers.findIndex((h) => h.includes('style') || h.includes('스타일'))] || null,
          vendor_name: cols[headers.findIndex((h) => h.includes('vendor') || h.includes('벤더'))] || null,
          category: cols[headers.findIndex((h) => h.includes('category') || h.includes('카테고리'))] || null,
          unit_price: parseFloat(cols[headers.findIndex((h) => h.includes('price') || h.includes('가격'))]) || null,
          image_url: cols[headers.findIndex((h) => h.includes('image') || h.includes('이미지'))] || null,
          source_url: cols[headers.findIndex((h) => h.includes('url') || h.includes('링크'))] || null,
        };
      }).filter((r) => r.item_name && r.item_name !== 'Unnamed');

      if (rows.length === 0) throw new Error('유효한 상품 데이터가 없습니다');

      const { error } = await supabase.from('sourceable_products').insert(rows);
      if (error) throw error;

      toast({ title: `${rows.length}개 상품이 등록되었습니다` });
      queryClient.invalidateQueries({ queryKey: ['sourceable-products', 'csv'] });
    } catch (err: any) {
      toast({ title: 'CSV 업로드 실패', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
        <Button variant="outline" size="sm" className="h-9 text-[12px]" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Upload className="w-4 h-4 mr-1" />}
          CSV 업로드
        </Button>
      </div>
      <div className="text-[12px]" style={{ color: '#6d7175' }}>{isLoading ? '로딩 중...' : `총 ${filtered.length}개 상품`}</div>
      <ProductTable items={filtered} isLoading={isLoading} emptyText="CSV로 등록된 상품이 없습니다. 위 'CSV 업로드' 버튼으로 상품을 등록하세요." />
    </div>
  );
};

export default SourceableCSV;
