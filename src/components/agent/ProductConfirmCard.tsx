import { useState, useCallback } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import ProductLogTimeline, { type ProductLogEntry } from './ProductLogTimeline';

const VENDOR_COLORS: Record<string, string> = {
  BASIC: '#1A1A1A', DENIM: '#1E3A5F', VACATION: '#F59E0B',
  FESTIVAL: '#7C3AED', TREND: '#EC4899', CURVE: '#D60000',
};
const VENDOR_KEYS = Object.keys(VENDOR_COLORS);
const CATEGORIES = ['Dresses', 'Tops', 'Pants & Jeans', 'Sets', 'Activewear', 'Swimwear', 'Jumpsuits', 'Skirts', 'Outerwear', 'Accessories'];
const SEASONS = ['All Season', 'Spring/Summer', 'Fall/Winter', 'Spring', 'Summer', 'Fall', 'Winter'];

export interface ConfirmProduct {
  id: number;
  name: string;
  vendor: string;
  vendorColor: string;
  factory: string;
  yuan: number;
  score: number;
  image: string;
  styleNo?: string;
  msrp?: number;
  category?: string;
  season?: string;
  madeIn?: string;
  pack?: string;
  minQty?: number;
  weight?: string;
  aiDesc?: string;
  factoryScore?: number;
  platform?: string;
  originalName?: string;
  sourceUrl?: string;
  moq?: string;
  leadTime?: string;
}

export interface FashionGoData {
  name: string;
  price: number;
  msrp: number;
  category: string;
  season: string;
  vendor: string;
  aiDesc: string;
}

export interface ChangeLogEntry {
  productId: number;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

interface Props {
  product: ConfirmProduct;
  checked: boolean;
  isExpanded: boolean;
  onToggleCheck: () => void;
  onToggleExpand: () => void;
  fgOverrides: Record<number, Partial<FashionGoData>>;
  onSaveFgData: (productId: number, data: Partial<FashionGoData>) => void;
  changeLogs: ChangeLogEntry[];
  onAddChangeLogs: (logs: ChangeLogEntry[]) => void;
  productLogs?: ProductLogEntry[];
}

function calcDefaultFgPrice(yuan: number) {
  return Math.round(yuan / 7 * 3);
}

export default function ProductConfirmCard({
  product: p,
  checked,
  isExpanded,
  onToggleCheck,
  onToggleExpand,
  fgOverrides,
  onSaveFgData,
  changeLogs,
  onAddChangeLogs,
}: Props) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);

  const defaultFgPrice = calcDefaultFgPrice(p.yuan);
  const defaultMsrp = p.msrp ?? defaultFgPrice * 2;

  // Merge overrides into defaults
  const overrides = fgOverrides[p.id] || {};
  const fgData: FashionGoData = {
    name: overrides.name ?? p.name,
    price: overrides.price ?? defaultFgPrice,
    msrp: overrides.msrp ?? defaultMsrp,
    category: overrides.category ?? p.category ?? 'Apparel',
    season: overrides.season ?? p.season ?? 'All Season',
    vendor: overrides.vendor ?? p.vendor,
    aiDesc: overrides.aiDesc ?? p.aiDesc ?? '',
  };

  const [draft, setDraft] = useState<FashionGoData>({ ...fgData });

  const hasOverrides = Object.keys(overrides).length > 0;
  const isFieldModified = useCallback((field: keyof FashionGoData) => {
    return overrides[field] !== undefined;
  }, [overrides]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft({ ...fgData });
    setEditing(true);
  };

  const handleCancel = () => {
    setDraft({ ...fgData });
    setEditing(false);
  };

  const handleSave = () => {
    const newLogs: ChangeLogEntry[] = [];
    const now = new Date().toISOString();
    const changes: Partial<FashionGoData> = {};

    const defaults: FashionGoData = {
      name: p.name,
      price: defaultFgPrice,
      msrp: defaultMsrp,
      category: p.category ?? 'Apparel',
      season: p.season ?? 'All Season',
      vendor: p.vendor,
      aiDesc: p.aiDesc ?? '',
    };

    (Object.keys(draft) as (keyof FashionGoData)[]).forEach((key) => {
      const draftVal = String(draft[key]);
      const prevVal = String(fgData[key]);
      if (draftVal !== prevVal) {
        newLogs.push({
          productId: p.id,
          field: key,
          oldValue: prevVal,
          newValue: draftVal,
          changedBy: 'user',
          changedAt: now,
        });
      }
      // Only store as override if different from original defaults
      if (draftVal !== String(defaults[key])) {
        (changes as any)[key] = draft[key];
      }
    });

    onSaveFgData(p.id, changes);
    if (newLogs.length > 0) {
      onAddChangeLogs(newLogs);
    }
    setEditing(false);
    toast({ title: '저장 완료', description: `${p.name}의 FashionGo 등록 정보가 업데이트되었습니다.` });
  };

  const handleReset = () => {
    const resetData: FashionGoData = {
      name: p.name,
      price: defaultFgPrice,
      msrp: defaultMsrp,
      category: p.category ?? 'Apparel',
      season: p.season ?? 'All Season',
      vendor: p.vendor,
      aiDesc: p.aiDesc ?? '',
    };
    setDraft(resetData);
    onSaveFgData(p.id, {});
    toast({ title: '초기화 완료', description: '원본 데이터 기준으로 초기화되었습니다.' });
  };

  const usd = (p.yuan / 7 * 3).toFixed(2);
  const displayName = fgData.name;
  const displayPrice = fgData.price;
  const displayVendor = fgData.vendor;

  const ModifiedBadge = () => (
    <span className="text-[9px] px-1 py-0.5 bg-warning/20 text-warning rounded font-medium ml-1">수정됨</span>
  );

  return (
    <div className={`rounded-lg border transition-colors ${checked ? 'border-destructive' : 'border-border'}`}>
      {/* Summary row */}
      <div
        className={`flex items-center gap-3 p-3 cursor-pointer ${checked ? 'bg-destructive/5' : 'hover:bg-muted/50'}`}
        onClick={onToggleExpand}
      >
        <div
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${checked ? 'bg-destructive border-destructive' : 'border-muted-foreground'}`}
          onClick={(e) => { e.stopPropagation(); onToggleCheck(); }}
        >
          {checked && <Check className="w-3 h-3 text-destructive-foreground" />}
        </div>
        <img src={p.image} alt={displayName} className="w-14 h-14 rounded-md object-cover shrink-0 bg-muted" loading="lazy" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium truncate">{displayName}</p>
            {hasOverrides && <ModifiedBadge />}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: VENDOR_COLORS[displayVendor] || '#666' }}>{displayVendor}</span>
            <span className="text-[11px] text-muted-foreground">{p.factory}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground line-through">¥{p.yuan}</p>
          <p className="text-sm font-bold text-destructive">${hasOverrides ? displayPrice : usd}</p>
        </div>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${p.score >= 80 ? 'bg-green-500' : 'bg-orange-400'}`}>{p.score}</div>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* FG Registration Info */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-foreground">📋 FashionGo 등록 정보</h4>
              {!editing && (
                <button onClick={handleStartEdit} className="text-xs text-primary hover:underline font-medium">✏️ 편집</button>
              )}
            </div>

            {editing ? (
              /* ===== EDIT MODE ===== */
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">상품명</label>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Style#</label>
                    <Input
                      value={p.styleNo || `FG-${p.vendor}-${p.id}`}
                      disabled
                      className="h-8 text-xs bg-muted"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">판매가 ($)</label>
                    <Input
                      type="number"
                      value={draft.price}
                      onChange={(e) => setDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">MSRP ($)</label>
                    <Input
                      type="number"
                      value={draft.msrp}
                      onChange={(e) => setDraft((d) => ({ ...d, msrp: Number(e.target.value) }))}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">카테고리</label>
                    <Select value={draft.category} onValueChange={(v) => setDraft((d) => ({ ...d, category: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">시즌</label>
                    <Select value={draft.season} onValueChange={(v) => setDraft((d) => ({ ...d, season: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEASONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[11px] text-muted-foreground mb-1 block">벤더 배정</label>
                    <Select value={draft.vendor} onValueChange={(v) => setDraft((d) => ({ ...d, vendor: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {VENDOR_KEYS.map((v) => (
                          <SelectItem key={v} value={v}>
                            <div className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: VENDOR_COLORS[v] }} />
                              {v}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground mb-1 block">AI Description</label>
                  <Textarea
                    value={draft.aiDesc}
                    onChange={(e) => setDraft((d) => ({ ...d, aiDesc: e.target.value }))}
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
                {/* Edit mode buttons */}
                <div className="flex items-center justify-between pt-1">
                  <button onClick={handleReset} className="text-xs text-destructive hover:underline">원본으로 초기화</button>
                  <div className="flex items-center gap-2">
                    <button onClick={handleCancel} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5">취소</button>
                    <button onClick={handleSave} className="text-xs bg-foreground text-background px-3 py-1.5 rounded font-medium hover:bg-foreground/90">저장</button>
                  </div>
                </div>
              </div>
            ) : (
              /* ===== VIEW MODE ===== */
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {([
                    ['상품명', fgData.name, 'name'],
                    ['Style#', p.styleNo || `FG-${p.vendor}-${p.id}`, null],
                    ['판매가', `$${fgData.price}`, 'price'],
                    ['MSRP', `$${fgData.msrp}`, 'msrp'],
                    ['카테고리', fgData.category, 'category'],
                    ['시즌', fgData.season, 'season'],
                    ['Made In', p.madeIn || 'China', null],
                    ['Pack', p.pack || 'Open-pack', null],
                    ['Min Qty', String(p.minQty || 6), null],
                    ['Weight', p.weight || '0.5 lb', null],
                  ] as [string, string, string | null][]).map(([label, value, field]) => (
                    <div key={label} className="flex justify-between text-xs py-0.5">
                      <span className="text-muted-foreground flex items-center">
                        {label}
                        {field && isFieldModified(field as keyof FashionGoData) && <ModifiedBadge />}
                      </span>
                      <span className="font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>
                {fgData.vendor !== p.vendor && (
                  <div className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground flex items-center">벤더 배정<ModifiedBadge /></span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-white" style={{ backgroundColor: VENDOR_COLORS[fgData.vendor] || '#666' }}>{fgData.vendor}</span>
                  </div>
                )}
                <div className="mt-2">
                  <p className="text-[11px] text-muted-foreground mb-0.5 flex items-center">
                    AI Description
                    {isFieldModified('aiDesc') && <ModifiedBadge />}
                  </p>
                  <p className="text-xs text-foreground bg-muted/30 rounded p-2 leading-relaxed">"{fgData.aiDesc}"</p>
                </div>
              </>
            )}
          </div>

          {/* Source Info — always read-only */}
          <div className="relative border-t border-border bg-muted/30">
            {editing && (
              <div className="px-4 pt-3 pb-0">
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">🔒 원본 데이터는 수정할 수 없습니다</p>
              </div>
            )}
            <div className="absolute left-0 top-0 bottom-0 w-5 bg-muted flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground font-bold tracking-widest" style={{ writingMode: 'vertical-rl' }}>원본</span>
            </div>
            <div className="pl-7 pr-4 py-4 space-y-3">
              <h4 className="text-xs font-bold text-foreground">📦 원본 소싱 정보 (공장 데이터)</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                {[
                  ['공장명', p.factory],
                  ['공장 스코어', `${p.factoryScore || p.score}점`],
                  ['플랫폼', p.platform || '1688'],
                  ['MOQ', p.moq || '100pcs'],
                  ['리드타임', p.leadTime || '15-25 days'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-xs py-0.5">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">원본 상품명</p>
                <p className="text-xs text-foreground">{p.originalName || p.name}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-0.5">원본 가격</p>
                <p className="text-xs text-foreground">¥{p.yuan} → ${(p.yuan / 7).toFixed(2)} → FG판매가 ${defaultFgPrice}</p>
              </div>
              {p.sourceUrl && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-0.5">원본 URL</p>
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline truncate block">{p.sourceUrl}</a>
                </div>
              )}
              {!editing && (
                <div className="flex items-center justify-between pt-2">
                  <button onClick={handleStartEdit} className="text-xs text-muted-foreground hover:text-foreground">✏️ 편집</button>
                  <Link to="/factories" target="_blank" className="text-xs text-primary hover:underline font-medium">공장 상세 보기 →</Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
