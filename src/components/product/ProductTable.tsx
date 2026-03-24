import React from 'react';
import { Loader2, ExternalLink } from 'lucide-react';

export interface ProductRow {
    id: string;
    product_no?: string;
    image_url?: string | null;
    category?: string | null;
    price?: number | null;
    weight_kg?: number | null;
    material?: string | null;
    color_size?: string | null;
    purchase_link?: string | null;
    source?: string;
    created_at: string;
    images?: string[];
    // Fields from sourceable_products / sourcing_target_products
    item_name?: string;
    item_name_en?: string | null;
    style_no?: string | null;
    unit_price?: number | null;
    unit_price_usd?: number | null;
    vendor_name?: string | null;
    source_url?: string | null;
    fg_category?: string | null;
    notes?: string | null;
    options?: any;
    weight?: number | null;
    factory_id?: string | null;
    trend_analysis_id?: string | null;
    status?: string;
}

interface ProductTableProps {
    items: ProductRow[];
    isLoading: boolean;
    emptyText?: string;
    showSource?: boolean;
}

const ProductTable: React.FC<ProductTableProps> = ({ items, isLoading, emptyText = '등록된 상품이 없습니다' }) => {
    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#6d7175' }} />
            </div>
        );
    }

    const headers = ['이미지', '소싱처', '상품코드', '카테고리', '공급가', '소재', '색상/사이즈', '무게(kg)', '구매링크', '등록일'];

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
                                    <img src={p.image_url} alt={p.product_no} style={{ width: 50, height: 62, objectFit: 'cover', borderRadius: 4, border: '1px solid #e1e3e5' }} />
                                ) : (
                                    <div style={{ width: 50, height: 62, borderRadius: 4, border: '1px solid #e1e3e5', background: '#f6f6f7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span style={{ fontSize: 9, color: '#b5b5b5' }}>No img</span>
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '10px 12px', minWidth: 140 }}>
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#202223', fontFamily: 'monospace' }}>{p.product_no}</span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                                <span style={{ fontSize: 12, background: '#f1f2f3', padding: '2px 8px', borderRadius: 4, color: '#202223' }}>{p.category ?? '—'}</span>
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600, color: '#202223', whiteSpace: 'nowrap' }}>
                                {p.price != null ? `$${p.price.toFixed(2)}` : '—'}
                            </td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175', maxWidth: 150 }}>{p.material || '—'}</td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175', maxWidth: 200 }}>{p.color_size || '—'}</td>
                            <td style={{ padding: '10px 12px', fontSize: 12, color: '#6d7175' }}>
                                {p.weight_kg ? `${p.weight_kg}kg` : '—'}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                                {p.purchase_link ? (
                                    <a href={p.purchase_link} target="_blank" rel="noopener noreferrer"
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2563eb', textDecoration: 'none' }}>
                                        <ExternalLink size={12} /> 링크
                                    </a>
                                ) : '—'}
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
