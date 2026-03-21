import { useState } from 'react';

const CONFIRM_PRODUCTS = [
  { id:1, name:'Smocked Halter Maxi Dress', vendor:'BASIC', factory:'C&S Fashion', yuan:126, score:88 },
  { id:2, name:'Easy Flow Wide Leg Denim Pants', vendor:'DENIM', factory:'Leqi Fashion', yuan:154, score:85 },
  { id:3, name:'100% Linen Wide Leg Trousers', vendor:'BASIC', factory:'Fengjue Fashion', yuan:158, score:82 },
  { id:4, name:'Reversible Ribbed Tank Top', vendor:'BASIC', factory:'C&S Fashion', yuan:84, score:88 },
  { id:5, name:'Graphic Fleece Pullover', vendor:'TREND', factory:'Unity Mode', yuan:112, score:79 },
  { id:6, name:'Crochet Button Down Shorts Set', vendor:'VACATION', factory:'Youthmi', yuan:196, score:82 },
  { id:7, name:'Floral Chiffon Tiered Maxi Dress', vendor:'BASIC', factory:'C&S Fashion', yuan:168, score:85 },
  { id:8, name:'Back Lace Up Evening Dress', vendor:'FESTIVAL', factory:'Chengni Fashion', yuan:224, score:76 },
  { id:9, name:'Sunny Days Bikini Set', vendor:'VACATION', factory:'Youthmi', yuan:98, score:79 },
  { id:10, name:'Graphic Fleece Pullover', vendor:'TREND', factory:'Unity Mode', yuan:140, score:82 },
  { id:11, name:'Activewear 3Pcs Sports Set', vendor:'TREND', factory:'Fengjue Fashion', yuan:182, score:75 },
  { id:12, name:'Coastal Stripe Smocked Jumpsuit', vendor:'VACATION', factory:'Youthmi', yuan:168, score:76 },
];

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000',
};

const STEPS = [
  { num: '①', name: '트렌드', badge: '100', done: true, current: false },
  { num: '②', name: '매칭', badge: '9', done: true, current: false },
  { num: '③', name: '컨펌', badge: '12', done: false, current: true },
  { num: '④', name: '배분', badge: '', done: false, current: false },
  { num: '⑤', name: '완성', badge: '', done: false, current: false },
  { num: '⑥', name: '등록', badge: '', done: false, current: false },
] as const;

/** Compact one-line bar for the global header */
export const AIAgentBarCompact = () => {
  return (
    <div className="flex items-center gap-4 w-full">
      <span className="font-bold text-sm shrink-0">🤖 AI Agent</span>
      <div className="flex items-center gap-1 flex-1 justify-center">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="flex items-center gap-1.5">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                s.current ? 'bg-warning text-warning-foreground' : s.done ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground'
              }`}>
                {s.done ? '✓' : (i + 1)}
              </div>
              <span className={`text-[11px] font-medium hidden lg:inline ${
                s.current ? 'text-foreground' : s.done ? 'text-destructive' : 'text-muted-foreground'
              }`}>{s.name}</span>
              {s.badge && <span className={`text-[10px] font-bold hidden lg:inline ${
                s.current ? 'text-warning' : s.done ? 'text-destructive' : 'text-muted-foreground'
              }`}>{s.badge}</span>}
            </div>
            {i < 5 && <span className={`text-[10px] mx-0.5 ${s.done ? 'text-destructive' : 'text-muted-foreground/30'}`}>→</span>}
          </div>
        ))}
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
              <span className="text-sm font-bold">🤖 AI Vendor Agent</span>
              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[11px] rounded-full">⏳ 컨펌 대기</span>
              <span className="text-[11px] text-muted-foreground">다음 실행: 월 06:00</span>
            </div>
            <button onClick={() => setOpen(true)} className="text-xs text-muted-foreground px-2 py-1">표시 ∨</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="font-bold">🤖 AI Vendor Agent</span>
                <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-xs rounded-full animate-pulse">⏳ 컨펌 대기</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">마지막 실행: 2026.03.24 06:00</span>
                <button className="px-3 py-1 bg-destructive text-destructive-foreground text-xs rounded">지금 실행</button>
                <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground px-2">숨기기 ∧</button>
              </div>
            </div>
            <div className="flex items-start gap-1 overflow-x-auto pb-1">
              {STEPS.map((s, i) => (
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
              ))}
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
          <div className="bg-background rounded-xl border w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold">상품 컨펌 — 12개 후보 상품</h2>
                <p className="text-xs text-muted-foreground mt-0.5">AI가 선별한 후보 상품을 검토하고 등록할 상품을 선택하세요</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground text-lg">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {CONFIRM_PRODUCTS.map((p) => {
                const usd = (p.yuan / 7 * 3).toFixed(2);
                const checked = confirmed.includes(p.id);
                return (
                  <div key={p.id} onClick={() => setConfirmed(prev => checked ? prev.filter(i => i !== p.id) : [...prev, p.id])}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${checked ? 'border-destructive bg-red-50' : 'border-border hover:bg-muted/50'}`}>
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}>
                      {checked && <span className="text-white text-[10px]">✓</span>}
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
                  </div>
                );
              })}
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
