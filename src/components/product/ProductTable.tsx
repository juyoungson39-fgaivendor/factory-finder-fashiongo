import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export interface ProductRow {
  id: string;
  item_name: string;
  item_name_en?: string | null;
  style_no?: string | null;
  vendor_name?: string | null;
  category?: string | null;
  unit_price?: number | null;
  unit_price_usd?: number | null;
  image_url?: string | null;
  source_url?: string | null;
  status: string;
  created_at: string;
  source?: string;
}

interface ProductTableProps {
  items: ProductRow[];
  isLoading: boolean;
  emptyText?: string;
  showSource?: boolean;
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  fashiongo: { label: 'FashionGo', color: '#e3726e' },
  sns: { label: 'SNS', color: '#6366f1' },
  other: { label: '기타', color: '#8b5cf6' },
  agent: { label: 'Agent', color: '#059669' },
  csv: { label: 'CSV', color: '#d97706' },
};

const ProductTable: React.FC<ProductTableProps> = ({ items, isLoading, emptyText = '등록된 상품이 없습니다', showSource }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6d7175' }} />
      </div>
    );
  }

  const headers = ['이미지', '상품명', '스타일번호', '벤더', '카테고리', '공급가', ...(showSource ? ['출처'] : []), '상태', '등록일'];

  return (
    <div className="w-full overflow-auto rounded-lg" style={{ border: '1px solid #e1e3e5' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f6f6f7' }}>
            {headers.map((h) => (
              <th key={h} style={{
                fontSize: 11, fontWeight: 500, color: '#6d7175', letterSpacing: 0.3,
                padding: '10px 12px', borderBottom: '1px solid #e1e3e5', textAlign: 'left', whiteSpace: 'nowrap',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: i < items.length - 1 ? '1px solid #e1e3e5' : 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f3'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <td style={{ padding: '8px 12px', width: 60 }}>
                {p.image_url ? (
                  <img src={p.image_url} alt={p.item_name} style={{ width: 44, height: 56, objectFit: 'cover', borderRadius: 4, border: '1px solid #e1e3e5' }} />
                ) : (
                  <div style={{ width: 44, height: 56, borderRadius: 4, border: '1px solid #e1e3e5', background: '#f6f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, color: '#b5b5b5' }}>No img</span>
                  </div>
                )}
              </td>
              <td style={{ padding: '10px 12px', minWidth: 200 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: '#202223' }}>{p.item_name}</span>
                {p.item_name_en && <span style={{ display: 'block', fontSize: 11, color: '#6d7175' }}>{p.item_name_en}</span>}
              </td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175', fontFamily: 'monospace' }}>{p.style_no ?? '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175' }}>{p.vendor_name ?? '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175' }}>{p.category ?? '—'}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>
                {p.unit_price != null ? `₩${p.unit_price.toLocaleString()}` : '—'}
                {p.unit_price_usd != null && <span style={{ fontSize: 11, color: '#6d7175', marginLeft: 4 }}>(${p.unit_price_usd.toFixed(2)})</span>}
              </td>
              {showSource && (
                <td style={{ padding: '10px 12px' }}>
                  {p.source && SOURCE_LABELS[p.source] && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', padding: '2px 7px', borderRadius: 3, backgroundColor: SOURCE_LABELS[p.source].color }}>
                      {SOURCE_LABELS[p.source].label}
                    </span>
                  )}
                </td>
              )}
              <td style={{ padding: '10px 12px' }}>
                <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                  {p.status === 'active' ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td style={{ padding: '10px 12px', fontSize: 11, color: '#6d7175', whiteSpace: 'nowrap' }}>
                {new Date(p.created_at).toLocaleDateString('ko-KR')}
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: 40, textAlign: 'center', color: '#6d7175', fontSize: 13 }}>{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ProductTable;
