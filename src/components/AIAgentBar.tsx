import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface ProductDetail {
  id: number;
  name: string;
  vendor: string;
  factory: string;
  yuan: number;
  score: number;
  styleNo: string;
  msrp: number;
  category: string;
  season: string;
  madeIn: string;
  pack: string;
  minQty: number;
  weight: string;
  aiDesc: string;
  factoryScore: number;
  platform: string;
  originalName: string;
  sourceUrl: string;
  moq: string;
  leadTime: string;
}

const CONFIRM_PRODUCTS: ProductDetail[] = [
  { id: 1, name: 'Smocked Halter Maxi Dress', vendor: 'BASIC', factory: 'C&S Fashion', yuan: 126, score: 88, styleNo: 'FG-BASIC-202603-4821', msrp: 108, category: 'Dresses', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.5 lb', aiDesc: 'Elegant smocked halter maxi dress with flowing silhouette, perfect for casual and semi-formal occasions.', factoryScore: 85, platform: '1688', originalName: '吊带连衣裙女夏季褶皱长裙', sourceUrl: 'https://detail.1688.com/offer/example1.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 2, name: 'Easy Flow Wide Leg Denim Pants', vendor: 'DENIM', factory: 'Leqi Fashion', yuan: 154, score: 85, styleNo: 'FG-DENIM-202603-3912', msrp: 132, category: 'Pants & Jeans', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.8 lb', aiDesc: 'Relaxed wide-leg denim pants with comfortable elastic waistband and easy-flowing fit.', factoryScore: 82, platform: '1688', originalName: '宽松阔腿牛仔裤女高腰', sourceUrl: 'https://detail.1688.com/offer/example2.html', moq: '200pcs', leadTime: '20-30 days' },
  { id: 3, name: '100% Linen Wide Leg Trousers', vendor: 'BASIC', factory: 'Fengjue Fashion', yuan: 158, score: 82, styleNo: 'FG-BASIC-202603-5543', msrp: 136, category: 'Pants & Jeans', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Premium 100% linen wide-leg trousers with breathable fabric and elegant drape.', factoryScore: 78, platform: '1688', originalName: '亚麻阔腿裤女夏季薄款', sourceUrl: 'https://detail.1688.com/offer/example3.html', moq: '150pcs', leadTime: '15-20 days' },
  { id: 4, name: 'Reversible Ribbed Tank Top', vendor: 'BASIC', factory: 'C&S Fashion', yuan: 84, score: 88, styleNo: 'FG-BASIC-202603-2210', msrp: 72, category: 'Tops', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 12, weight: '0.2 lb', aiDesc: 'Versatile reversible ribbed tank top with flattering fit, can be worn front or back.', factoryScore: 85, platform: '1688', originalName: '双面穿螺纹背心女修身', sourceUrl: 'https://detail.1688.com/offer/example4.html', moq: '100pcs', leadTime: '10-15 days' },
  { id: 5, name: 'Graphic Fleece Pullover', vendor: 'TREND', factory: 'Unity Mode', yuan: 112, score: 79, styleNo: 'FG-TREND-202603-7788', msrp: 96, category: 'Tops', season: 'Fall/Winter', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Trendy graphic fleece pullover with oversized fit and bold print design.', factoryScore: 74, platform: '1688', originalName: '卫衣女秋冬加绒印花宽松', sourceUrl: 'https://detail.1688.com/offer/example5.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 6, name: 'Crochet Button Down Shorts Set', vendor: 'VACATION', factory: 'Youthmi', yuan: 196, score: 82, styleNo: 'FG-VACA-202603-6634', msrp: 168, category: 'Sets', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Hand-crafted crochet button-down top and shorts set, perfect for beach and resort wear.', factoryScore: 80, platform: '1688', originalName: '镂空针织套装女短裤两件套', sourceUrl: 'https://detail.1688.com/offer/example6.html', moq: '100pcs', leadTime: '20-30 days' },
  { id: 7, name: 'Floral Chiffon Tiered Maxi Dress', vendor: 'BASIC', factory: 'C&S Fashion', yuan: 168, score: 85, styleNo: 'FG-BASIC-202603-1199', msrp: 144, category: 'Dresses', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.4 lb', aiDesc: 'Romantic floral chiffon maxi dress with tiered skirt and delicate print.', factoryScore: 85, platform: '1688', originalName: '碎花雪纺连衣裙女夏季长裙', sourceUrl: 'https://detail.1688.com/offer/example7.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 8, name: 'Back Lace Up Evening Dress', vendor: 'FESTIVAL', factory: 'Chengni Fashion', yuan: 224, score: 76, styleNo: 'FG-FEST-202603-8845', msrp: 192, category: 'Dresses', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Stunning back lace-up evening dress with elegant silhouette and premium fabric.', factoryScore: 72, platform: '1688', originalName: '晚礼服后背绑带连衣裙', sourceUrl: 'https://detail.1688.com/offer/example8.html', moq: '50pcs', leadTime: '25-35 days' },
  { id: 9, name: 'Sunny Days Bikini Set', vendor: 'VACATION', factory: 'Youthmi', yuan: 98, score: 79, styleNo: 'FG-VACA-202603-3321', msrp: 84, category: 'Swimwear', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 12, weight: '0.2 lb', aiDesc: 'Cheerful bikini set with vibrant patterns and adjustable straps.', factoryScore: 80, platform: '1688', originalName: '比基尼泳衣女分体', sourceUrl: 'https://detail.1688.com/offer/example9.html', moq: '200pcs', leadTime: '10-20 days' },
  { id: 10, name: 'Graphic Fleece Pullover', vendor: 'TREND', factory: 'Unity Mode', yuan: 140, score: 82, styleNo: 'FG-TREND-202603-7790', msrp: 120, category: 'Tops', season: 'Fall/Winter', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.7 lb', aiDesc: 'Premium graphic fleece pullover with detailed embroidery and soft inner lining.', factoryScore: 74, platform: '1688', originalName: '卫衣女秋冬刺绣加绒', sourceUrl: 'https://detail.1688.com/offer/example10.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 11, name: 'Activewear 3Pcs Sports Set', vendor: 'TREND', factory: 'Fengjue Fashion', yuan: 182, score: 75, styleNo: 'FG-TREND-202603-9901', msrp: 156, category: 'Activewear', season: 'All Season', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.6 lb', aiDesc: 'Complete 3-piece activewear set including sports bra, jacket, and leggings.', factoryScore: 78, platform: '1688', originalName: '运动套装女三件套瑜伽服', sourceUrl: 'https://detail.1688.com/offer/example11.html', moq: '100pcs', leadTime: '15-25 days' },
  { id: 12, name: 'Coastal Stripe Smocked Jumpsuit', vendor: 'VACATION', factory: 'Youthmi', yuan: 168, score: 76, styleNo: 'FG-VACA-202603-4456', msrp: 144, category: 'Jumpsuits', season: 'Spring/Summer', madeIn: 'China', pack: 'Open-pack', minQty: 6, weight: '0.5 lb', aiDesc: 'Breezy coastal-inspired striped jumpsuit with smocked bodice and wide legs.', factoryScore: 80, platform: '1688', originalName: '条纹连体裤女夏季阔腿', sourceUrl: 'https://detail.1688.com/offer/example12.html', moq: '100pcs', leadTime: '20-30 days' },
];

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000'
};

const STEPS = [
  { num: '①', name: '트렌드', badge: '100', done: true, current: false },
  { num: '②', name: '매칭', badge: '9', done: true, current: false },
  { num: '③', name: '컨펌', badge: '12', done: false, current: true },
  { num: '④', name: '배분', badge: '', done: false, current: false },
  { num: '⑤', name: '완성', badge: '', done: false, current: false },
  { num: '⑥', name: '등록', badge: '', done: false, current: false },
] as const;

const DetailRow = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex justify-between text-xs py-0.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium text-foreground">{value}</span>
  </div>
);

const ProductAccordion = ({ p, checked, onToggleCheck }: { p: ProductDetail; checked: boolean; onToggleCheck: () => void }) => {
  const [expanded, setExpanded] = useState(false);
  const usd = (p.yuan / 7 * 3).toFixed(2);
  const fgPrice = (p.yuan / 7 * 3).toFixed(0);

  return (
    <div className={`rounded-lg border ${checked ? 'border-destructive' : 'border-border'}`}>
      {/* Summary row */}
      <div
        className={`flex items-center gap-3 p-3 cursor-pointer ${checked ? 'bg-destructive/5' : 'hover:bg-muted/50'}`}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
      >
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
        >
          {checked && <span className="text-destructive-foreground text-[10px]">✓</span>}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{p.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: VENDOR_COLORS[p.vendor] || '#666' }}>{p.vendor}</span>
            <span className="text-[11px] text-muted-foreground">{p.factory}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground line-through">¥{p.yuan}</p>
          <p className="text-sm font-bold text-destructive">${usd}</p>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-500'}`}>{p.score}</div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border">
          {/* FG Registration Info */}
          <div className="p-4 space-y-3">
            <h4 className="text-xs font-bold text-foreground">📋 FashionGo 등록 정보</h4>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
              <DetailRow label="상품명" value={p.name} />
              <DetailRow label="Style#" value={p.styleNo} />
              <DetailRow label="판매가" value={`$${fgPrice}`} />
              <DetailRow label="MSRP" value={`$${p.msrp}`} />
              <DetailRow label="카테고리" value={p.category} />
              <DetailRow label="시즌" value={p.season} />
              <DetailRow label="Made In" value={p.madeIn} />
              <DetailRow label="Pack" value={p.pack} />
              <DetailRow label="Min Qty" value={p.minQty} />
              <DetailRow label="Weight" value={p.weight} />
            </div>
            <div className="mt-2">
              <p className="text-[11px] text-muted-foreground mb-0.5">AI Description</p>
              <p className="text-xs text-foreground bg-muted/30 rounded p-2 leading-relaxed">"{p.aiDesc}"</p>
            </div>
          </div>

          {/* Source Info */}
          <div className="relative border-t border-border bg-muted/30">
            {/* Vertical "원본" label */}
            <div className="absolute left-0 top-0 bottom-0 w-5 bg-muted flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground font-bold tracking-widest" style={{ writingMode: 'vertical-rl' }}>원본</span>
            </div>
            <div className="pl-7 pr-4 py-4 space-y-3">
              <h4 className="text-xs font-bold text-foreground">📦 원본 소싱 정보 (공장 데이터)</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                <DetailRow label="공장명" value={p.factory} />
                <DetailRow label="공장 스코어" value={`${p.factoryScore}점`} />
                <DetailRow label="플랫폼" value={p.platform} />
                <DetailRow label="MOQ" value={p.moq} />
                <DetailRow label="리드타임" value={p.leadTime} />
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">원본 상품명</p>
                <p className="text-xs text-foreground">{p.originalName}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">원본 가격</p>
                <p className="text-xs text-foreground">¥{p.yuan} → ${(p.yuan / 7).toFixed(2)} → FG판매가 ${fgPrice}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">원본 URL</p>
                <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{p.sourceUrl}</a>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button className="text-xs text-muted-foreground hover:text-foreground">✏️ 편집</button>
                <a href={`/factories`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline font-medium">공장 상세 보기 →</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Compact one-line bar for the global header */
export const AIAgentBarCompact = () => {
  return (
    <div className="flex items-center gap-4 w-full">
      <span className="font-bold text-sm shrink-0">🤖 AI Sourcing Agent</span>
      <div className="flex items-center gap-1 flex-1 justify-center">
        {STEPS.map((s, i) =>
          <div key={i} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${s.current ? 'bg-warning text-warning-foreground' : s.done ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'}`}>
                {s.done ? '✓' : i + 1}
              </div>
              <span className={`text-[11px] font-medium hidden lg:inline ${s.current ? 'text-foreground' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.name}</span>
              {s.badge && <span className={`text-[10px] font-bold hidden lg:inline ${s.current ? 'text-warning' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.badge}</span>}
            </div>
            {i < 5 && <span className={`text-[10px] mx-0.5 ${s.done ? 'text-destructive' : 'text-muted-foreground/30'}`}>→</span>}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="px-2 py-0.5 bg-warning/15 text-warning text-[10px] rounded-full font-medium">⏳ 컨펌 대기</span>
        <span className="text-[10px] text-muted-foreground hidden md:inline">03.24 06:00</span>
        <button className="px-2.5 py-1 bg-destructive text-destructive-foreground text-[10px] rounded font-medium">지금 실행</button>
      </div>
    </div>
  );
};

/** Full detailed card for the Dashboard page */
const AIAgentBar = () => {
  const [open, setOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [confirmed, setConfirmed] = useState<number[]>([]);

  return (
    <>
      <div className="mb-4 rounded-lg border border-border bg-card">
        {!open ? (
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold">🤖 Angel Agent</span>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[11px] rounded-full">⏳ 컨펌 대기</span>
              <span className="text-[11px] text-muted-foreground">다음 실행: 월 06:00</span>
            </div>
            <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground px-2 py-1">표시 ∨</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold">🤖 Angel Agent</span>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full animate-pulse">⏳ 컨펌 대기</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">마지막 실행: 2026.03.24 06:00</span>
                <button className="px-3 py-1 bg-destructive text-destructive-foreground text-xs rounded">지금 실행</button>
                <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground px-2">숨기기 ∧</button>
              </div>
            </div>
            <div className="flex items-start gap-1 overflow-x-auto pb-1">
              {STEPS.map((s, i) =>
                <div key={i} className="flex items-center gap-1 shrink-0">
                  <div className={`flex flex-col items-center w-[88px] px-2 py-2 rounded-lg border text-center ${s.current ? 'border-orange-300 bg-orange-50' : s.done ? 'border-red-100 bg-red-50' : 'border-border bg-muted/20'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mb-1 ${s.current ? 'bg-orange-500 text-white' : s.done ? 'bg-destructive text-white' : 'bg-muted text-muted-foreground'}`}>
                      {s.done ? '✓' : s.num}
                    </div>
                    <span className="text-[11px] font-medium leading-tight">{s.name}</span>
                    {s.badge && <span className={`text-[11px] font-bold mt-0.5 ${s.current ? 'text-orange-500' : s.done ? 'text-destructive' : 'text-muted-foreground'}`}>{s.badge}</span>}
                  </div>
                  {i < 5 && <span className={`text-base font-bold ${s.done ? 'text-destructive' : 'text-muted-foreground/20'}`}>→</span>}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-xs text-muted-foreground">다음 자동 실행: 월요일 06:00</span>
              <button onClick={() => setShowModal(true)} className="px-4 py-1.5 bg-destructive text-destructive-foreground text-sm rounded font-medium">
                📋 12개 상품 확인하기 →
              </button>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-background rounded-xl border w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold">상품 컨펌 — 12개 후보 상품</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI가 선별한 후보 상품을 검토하고 등록할 상품을 선택하세요. 상품을 클릭하면 상세 정보를 확인할 수 있습니다.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {CONFIRM_PRODUCTS.map((p) => (
                <ProductAccordion
                  key={p.id}
                  p={p}
                  checked={confirmed.includes(p.id)}
                  onToggleCheck={() => setConfirmed((prev) => prev.includes(p.id) ? prev.filter((i) => i !== p.id) : [...prev, p.id])}
                />
              ))}
            </div>
            <div className="p-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{confirmed.length}개 선택됨</span>
              <div className="flex gap-2">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 border rounded text-sm">취소</button>
                <button onClick={() => { setShowModal(false); setConfirmed([]); }} disabled={confirmed.length === 0}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded text-sm font-medium disabled:opacity-50">
                  선택 상품 컨펌 ({confirmed.length}개)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AIAgentBar;
