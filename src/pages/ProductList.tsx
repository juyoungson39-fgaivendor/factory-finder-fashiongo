import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useProducts } from '@/integrations/va-api/hooks/use-products';
import { useResolvedVendors } from '@/integrations/va-api/use-resolved-vendors';
import type { FGProductListItem } from '@/integrations/va-api/types';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

const ProductList = () => {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const { active: activeVendors } = useResolvedVendors();
  const vendorColors = useMemo(
    () => Object.fromEntries(activeVendors.map((v) => [v.wholesalerId, { name: v.name, color: v.color }])),
    [activeVendors],
  );

  const selectedWholesalerId = vendorFilter === 'all'
    ? activeVendors[0]?.wholesalerId
    : Number(vendorFilter);

  const { data, isLoading } = useProducts({
    wholesalerId: selectedWholesalerId,
    page,
    size: PAGE_SIZE,
  });

  const items = data?.items ?? [];
  const totalCount = data?.totalCount ?? 0;

  const filtered = useMemo(() => {
    let list = items;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.itemName.toLowerCase().includes(q) || p.styleNo.toLowerCase().includes(q));
    }
    switch (sort) {
      case 'price-asc': return [...list].sort((a, b) => a.unitPrice - b.unitPrice);
      case 'price-desc': return [...list].sort((a, b) => b.unitPrice - a.unitPrice);
      case 'name': return [...list].sort((a, b) => a.itemName.localeCompare(b.itemName));
      default: return [...list].sort((a, b) => (b.createdOn ?? '').localeCompare(a.createdOn ?? ''));
    }
  }, [items, search, sort]);

  const vendorInfo = vendorColors[selectedWholesalerId];
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6d7175' }} />
          <Input
            placeholder="상품명 / 스타일번호 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-[13px]"
            style={{ borderColor: '#e1e3e5' }}
          />
        </div>
        <Select value={vendorFilter} onValueChange={(v) => { setVendorFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[130px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <SelectValue placeholder="벤더" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 벤더</SelectItem>
            {activeVendors.map((v) => (
              <SelectItem key={v.id} value={String(v.wholesalerId)}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="w-[130px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <ArrowUpDown className="w-3.5 h-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">최신순</SelectItem>
            <SelectItem value="price-asc">가격 낮은순</SelectItem>
            <SelectItem value="price-desc">가격 높은순</SelectItem>
            <SelectItem value="name">이름순</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-[12px]" style={{ color: '#6d7175' }}>
          {isLoading ? '로딩 중...' : `총 ${totalCount}개 상품 (${filtered.length}개 표시)`}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-[12px]">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-1 rounded border disabled:opacity-40"
              style={{ borderColor: '#e1e3e5' }}
            >
              이전
            </button>
            <span style={{ color: '#6d7175' }}>{page} / {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-1 rounded border disabled:opacity-40"
              style={{ borderColor: '#e1e3e5' }}
            >
              다음
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6d7175' }} />
        </div>
      ) : (
        <div className="w-full overflow-auto rounded-lg" style={{ border: '1px solid #e1e3e5' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f6f6f7' }}>
                {['이미지', '상품명', '스타일번호', '벤더', '판매가', '리스팅가', '상태', '등록일'].map((h) => (
                  <th key={h} style={{
                    fontSize: 11, fontWeight: 500, color: '#6d7175', textTransform: 'uppercase' as const,
                    letterSpacing: 0.3, padding: '10px 12px', borderBottom: '1px solid #e1e3e5',
                    textAlign: 'left', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: FGProductListItem, i: number) => (
                <tr
                  key={p.productId}
                  style={{ borderBottom: i < filtered.length - 1 ? '1px solid #e1e3e5' : 'none' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f3'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Image */}
                  <td style={{ padding: '8px 12px', width: 60 }}>
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt={p.itemName}
                        style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid #e1e3e5' }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 56, borderRadius: 4, border: '1px solid #e1e3e5', background: '#f6f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontSize: 9, color: '#b5b5b5' }}>No img</span>
                      </div>
                    )}
                  </td>
                  {/* Item Name */}
                  <td style={{ padding: '10px 12px', minWidth: 200 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#202223' }}>{p.itemName}</span>
                  </td>
                  {/* Style No */}
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175', fontFamily: 'monospace' }}>
                    {p.styleNo}
                  </td>
                  {/* Vendor */}
                  <td style={{ padding: '10px 12px' }}>
                    {vendorInfo && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: '#fff',
                        padding: '2px 7px', borderRadius: 3,
                        backgroundColor: vendorInfo.color,
                      }}>
                        {vendorInfo.name}
                      </span>
                    )}
                  </td>
                  {/* Unit Price */}
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>
                    ${p.unitPrice?.toFixed(2) ?? '—'}
                  </td>
                  {/* Listing Price */}
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175', whiteSpace: 'nowrap' }}>
                    ${p.unitPrice1?.toFixed(2) ?? '—'}
                  </td>
                  {/* Status */}
                  <td style={{ padding: '10px 12px' }}>
                    <Badge variant={p.isActive ? 'default' : 'secondary'} className="text-[10px]">
                      {p.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  {/* Created */}
                  <td style={{ padding: '10px 12px', fontSize: 11, color: '#6d7175', whiteSpace: 'nowrap' }}>
                    {p.createdOn ? new Date(p.createdOn).toLocaleDateString('ko-KR') : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#6d7175', fontSize: 13 }}>
                    {totalCount === 0 ? '등록된 상품이 없습니다' : '검색 결과가 없습니다'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ProductList;
