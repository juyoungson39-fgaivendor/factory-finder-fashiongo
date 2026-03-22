import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowUpDown, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Combined product data from all vendors
const ALL_PRODUCTS = [
  { id: 'b1', name: 'Smocked Halter Maxi Dress', nameKor: '스모크 홀터 맥시 드레스', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'Dresses', yuan: 126, colors: ['Black', 'White', 'Navy'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.35, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 'b2', name: 'Reversible Ribbed Tank Top', nameKor: '리버서블 리브드 탱크탑', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'Tanks', yuan: 84, colors: ['Black', 'Ivory'], sizes: ['S', 'M', 'L'], weight: 0.15, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-19' },
  { id: 'b3', name: 'Mineral Wash Relaxed Cotton Tee', nameKor: '미네랄워시 릴렉스핏 티셔츠', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'T-Shirts', yuan: 77, colors: ['Charcoal', 'Sage'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.2, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-18' },
  { id: 'b4', name: 'Classic Satin Camisole', nameKor: '클래식 새틴 캐미솔', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'Camisoles', yuan: 91, colors: ['Champagne', 'Black'], sizes: ['S', 'M', 'L'], weight: 0.12, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-17' },
  { id: 'b5', name: 'Gingham Ruffle Blouse', nameKor: '깅엄 러플 블라우스', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'Blouses', yuan: 105, colors: ['Blue/White', 'Pink/White'], sizes: ['S', 'M', 'L'], weight: 0.18, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-16' },
  { id: 'b6', name: 'Round Neck Extended Sweater Top', nameKor: '라운드넥 오버사이즈 스웨터탑', vendor: 'BASIC', fgCategory: 'Tops', inputCategory: 'Sweaters', yuan: 126, colors: ['Oatmeal', 'Black', 'Gray'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.4, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-15' },
  { id: 'd1', name: 'Easy Flow Wide Leg Denim Pants', nameKor: '와이드 레그 데님 팬츠', vendor: 'DENIM', fgCategory: 'Jeans', inputCategory: 'Pants', yuan: 154, colors: ['Medium Wash', 'Dark Wash'], sizes: ['24', '26', '28', '30', '32'], weight: 0.65, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 'd2', name: '90s Vintage High Rise Flare Jeans', nameKor: '90년대 빈티지 하이라이즈 플레어 진', vendor: 'DENIM', fgCategory: 'Jeans', inputCategory: 'Jeans', yuan: 168, colors: ['Indigo', 'Light Wash'], sizes: ['24', '26', '28', '30'], weight: 0.7, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-19' },
  { id: 'd3', name: 'Raw Hem Crop Slim Wide Leg Jeans', nameKor: '로우헴 크롭 슬림 와이드 진', vendor: 'DENIM', fgCategory: 'Jeans', inputCategory: 'Jeans', yuan: 154, colors: ['Blue'], sizes: ['24', '26', '28', '30'], weight: 0.6, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-18' },
  { id: 'd4', name: 'Denim Camo Contrast Jacket', nameKor: '데님 카모 콘트라스트 자켓', vendor: 'DENIM', fgCategory: 'Outerwear', inputCategory: 'Jackets', yuan: 182, colors: ['Camo/Denim'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.8, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-17' },
  { id: 'v1', name: 'Sunny Days Bikini Set', nameKor: '써니 데이즈 비키니 세트', vendor: 'VACATION', fgCategory: 'Swimwear', inputCategory: 'Bikini', yuan: 98, colors: ['Coral', 'Teal'], sizes: ['S', 'M', 'L'], weight: 0.15, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 'v2', name: 'Linen Trousers 100% Linen', nameKor: '100% 린넨 트라우저', vendor: 'VACATION', fgCategory: 'Bottoms', inputCategory: 'Pants', yuan: 154, colors: ['Beige', 'White'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.35, img: 'https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-19' },
  { id: 'v3', name: 'Coastal Stripe Smocked Jumpsuit', nameKor: '코스탈 스트라이프 점프수트', vendor: 'VACATION', fgCategory: 'Jumpsuits', inputCategory: 'Jumpsuits', yuan: 168, colors: ['Navy/White'], sizes: ['S', 'M', 'L'], weight: 0.4, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-18' },
  { id: 'f1', name: 'Back Lace Up Mermaid Evening Dress', nameKor: '백 레이스업 머메이드 이브닝 드레스', vendor: 'FESTIVAL', fgCategory: 'Dresses', inputCategory: 'Evening', yuan: 224, colors: ['Burgundy', 'Navy'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.55, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 'f2', name: 'Sequin Formal Gown', nameKor: '시퀸 포멀 가운', vendor: 'FESTIVAL', fgCategory: 'Dresses', inputCategory: 'Formal', yuan: 280, colors: ['Gold', 'Silver'], sizes: ['S', 'M', 'L'], weight: 0.7, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-19' },
  { id: 't1', name: 'Expensive & Difficult Puff Sweatshirt', nameKor: '익스펜시브 그래픽 스웨트셔츠', vendor: 'TREND', fgCategory: 'Tops', inputCategory: 'Sweatshirts', yuan: 119, colors: ['Cream', 'Black'], sizes: ['S', 'M', 'L', 'XL'], weight: 0.45, img: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 't2', name: 'Easy Tiger Retro Ringer Shirt', nameKor: '이지 타이거 레트로 링거 셔츠', vendor: 'TREND', fgCategory: 'Tops', inputCategory: 'T-Shirts', yuan: 112, colors: ['White/Red'], sizes: ['S', 'M', 'L'], weight: 0.2, img: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-18' },
  { id: 't3', name: 'Activewear Crop Top & Shorts Set', nameKor: '액티브웨어 크롭탑 세트', vendor: 'TREND', fgCategory: 'Activewear', inputCategory: 'Sets', yuan: 154, colors: ['Black', 'Olive'], sizes: ['S', 'M', 'L'], weight: 0.3, img: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-17' },
  { id: 'c1', name: 'Plus Size Floral Tiered Midi Dress', nameKor: '플러스 플로럴 티어드 미디 드레스', vendor: 'CURVE', fgCategory: 'Dresses', inputCategory: 'Midi Dresses', yuan: 154, colors: ['Floral Pink', 'Floral Blue'], sizes: ['1X', '2X', '3X'], weight: 0.45, img: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-20' },
  { id: 'c2', name: 'Plus Size Wide Leg Linen Pants', nameKor: '플러스 와이드 레그 린넨 팬츠', vendor: 'CURVE', fgCategory: 'Bottoms', inputCategory: 'Pants', yuan: 140, colors: ['Natural', 'Black'], sizes: ['1X', '2X', '3X'], weight: 0.4, img: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=200&h=240&fit=crop', url: '', createdAt: '2026-03-19' },
];

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#202223', DENIM: '#1c3d7a', VACATION: '#e88c00',
  FESTIVAL: '#6c3db5', TREND: '#e0387a', CURVE: '#d42020',
};

const FG_CATEGORIES = [...new Set(ALL_PRODUCTS.map(p => p.fgCategory))];
const INPUT_CATEGORIES = [...new Set(ALL_PRODUCTS.map(p => p.inputCategory))];
const VENDORS = [...new Set(ALL_PRODUCTS.map(p => p.vendor))];

const getUsd = (yuan: number) => {
  const rate = parseFloat(localStorage.getItem('fg_exchange_rate') || '7');
  const multiplier = parseFloat(localStorage.getItem('fg_margin_multiplier') || '3');
  return (yuan / rate * multiplier).toFixed(2);
};

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

const ProductList = () => {
  const [search, setSearch] = useState('');
  const [vendorFilter, setVendorFilter] = useState('all');
  const [fgCategoryFilter, setFgCategoryFilter] = useState('all');
  const [inputCategoryFilter, setInputCategoryFilter] = useState('all');
  const [sort, setSort] = useState<SortKey>('newest');

  const filtered = useMemo(() => {
    let list = ALL_PRODUCTS;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || p.nameKor.includes(q));
    }
    if (vendorFilter !== 'all') list = list.filter(p => p.vendor === vendorFilter);
    if (fgCategoryFilter !== 'all') list = list.filter(p => p.fgCategory === fgCategoryFilter);
    if (inputCategoryFilter !== 'all') list = list.filter(p => p.inputCategory === inputCategoryFilter);

    switch (sort) {
      case 'price-asc': return [...list].sort((a, b) => a.yuan - b.yuan);
      case 'price-desc': return [...list].sort((a, b) => b.yuan - a.yuan);
      case 'name': return [...list].sort((a, b) => a.name.localeCompare(b.name));
      default: return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }, [search, vendorFilter, fgCategoryFilter, inputCategoryFilter, sort]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#6d7175' }} />
          <Input
            placeholder="상품명 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-[13px]"
            style={{ borderColor: '#e1e3e5' }}
          />
        </div>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger className="w-[130px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <SelectValue placeholder="벤더" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 벤더</SelectItem>
            {VENDORS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fgCategoryFilter} onValueChange={setFgCategoryFilter}>
          <SelectTrigger className="w-[140px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <SelectValue placeholder="FG 카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 FG 카테고리</SelectItem>
            {FG_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={inputCategoryFilter} onValueChange={setInputCategoryFilter}>
          <SelectTrigger className="w-[140px] h-9 text-[12px]" style={{ borderColor: '#e1e3e5' }}>
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {INPUT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

      <div className="text-[12px]" style={{ color: '#6d7175' }}>
        총 {filtered.length}개 상품
      </div>

      {/* Table */}
      <div className="w-full overflow-auto rounded-lg" style={{ border: '1px solid #e1e3e5' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f6f6f7' }}>
              {['이미지', '상품명', '벤더', '카테고리', 'FG 카테고리', '공급가', '옵션', '무게', 'URL'].map((h) => (
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
            {filtered.map((p, i) => (
              <tr
                key={p.id}
                style={{ borderBottom: i < filtered.length - 1 ? '1px solid #e1e3e5' : 'none' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {/* 이미지 */}
                <td style={{ padding: '8px 12px', width: 60 }}>
                  <img
                    src={p.img}
                    alt={p.name}
                    style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid #e1e3e5' }}
                  />
                </td>
                {/* 상품명 */}
                <td style={{ padding: '10px 12px', minWidth: 180 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#202223' }}>{p.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: '#6d7175', marginTop: 2 }}>{p.nameKor}</span>
                </td>
                {/* 벤더 */}
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#fff',
                    padding: '2px 7px', borderRadius: 3,
                    backgroundColor: VENDOR_COLORS[p.vendor] || '#666',
                  }}>
                    {p.vendor}
                  </span>
                </td>
                {/* 카테고리 */}
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#202223' }}>{p.inputCategory}</td>
                {/* FG 카테고리 */}
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175' }}>{p.fgCategory}</td>
                {/* 공급가 */}
                <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, color: '#6d7175' }}>¥{p.yuan}</span>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#202223' }}>${getUsd(p.yuan)}</span>
                </td>
                {/* 옵션 */}
                <td style={{ padding: '10px 12px', fontSize: 11, color: '#6d7175', maxWidth: 160 }}>
                  <div>
                    <span style={{ fontWeight: 500, color: '#202223' }}>컬러:</span> {p.colors.join(', ')}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontWeight: 500, color: '#202223' }}>사이즈:</span> {p.sizes.join(', ')}
                  </div>
                </td>
                {/* 무게 */}
                <td style={{ padding: '10px 12px', fontSize: 12, color: '#202223', whiteSpace: 'nowrap' }}>
                  {p.weight}kg
                </td>
                {/* URL */}
                <td style={{ padding: '10px 12px' }}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: '#2c6ecb', textDecoration: 'underline' }}>
                      링크
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: '#b5b5b5' }}>—</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#6d7175', fontSize: 13 }}>
                  검색 결과가 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductList;
