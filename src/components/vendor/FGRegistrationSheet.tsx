import React, { useState, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw } from 'lucide-react';

const NAME_MAP: Record<string, string> = {
  '린넨 와이드 슬랙스': 'Linen Wide Leg Slacks',
  '오버사이즈 크롭 자켓': 'Oversized Crop Jacket',
  '플리츠 미디 스커트': 'Pleated Midi Skirt',
  '리브 니트 탑': 'Ribbed Knit Top',
  '와이드 데님 팬츠': 'Wide Denim Pants',
  '스트라이프 셔츠 원피스': 'Striped Shirt Dress',
};

const SUB1_OPTIONS = ['Tops', 'Dresses', 'Jeans & Denim', 'Swimwear', 'Bottoms', 'Outerwear', 'Activewear', 'Lingerie', 'Accessories'];
const SUB2_OPTIONS = ['', 'Blouses', 'T-Shirts', 'Tanks', 'Sweaters', 'Jackets', 'Pants', 'Skirts', 'Shorts'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

const BODY_FITS = ['Regular', 'Slim', 'Oversized', 'Relaxed'];
const PATTERNS = ['Solid', 'Stripe', 'Floral', 'Plaid', 'Graphic'];
const LENGTHS = ['Mini', 'Midi', 'Maxi', 'Crop'];
const STYLES = ['Casual', 'Formal', 'Bohemian', 'Minimalist', 'Y2K'];
const FABRICS = ['Cotton', 'Linen', 'Polyester', 'Knit', 'Denim'];
const OCCASIONS = ['Casual', 'Work', 'Party', 'Beach', 'Holiday'];
const SEASONS_LIST = ['Spring', 'Summer', 'Fall', 'Winter', 'All Season'];
const HOLIDAYS_LIST = ['None', '4th of July', 'Halloween', 'Christmas', "Valentine's", 'Prom', 'Mardi Gras'];
const VALUE_FLAGS = ['Only at FASHIONGO', 'Eco Friendly', 'Handmade', 'Organic', 'Small Batch', 'Not on Amazon'];

function readLS(key: string, fallback: string) {
  return localStorage.getItem(key) || fallback;
}

function genStyleNumber(vendorName: string) {
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const rand = String(Math.floor(1000 + Math.random() * 9000));
  return `FG-${vendorName}-${ym}-${rand}`;
}

function generateDescription(enName: string, occasion: string) {
  return `${enName} — a versatile piece designed for everyday style. Crafted with quality materials for a comfortable and flattering fit. Perfect for ${occasion.toLowerCase()} occasions. Available in multiple colors and sizes.`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: { name: string; nameEn?: string; nameKor?: string; yuan: number; img: string } | null;
  vendorName: string;
  onConfirm: () => void;
}

const FGRegistrationSheet = ({ open, onOpenChange, product, vendorName, onConfirm }: Props) => {
  // Read settings from localStorage
  const rate = parseFloat(readLS('fg_exchange_rate', '7'));
  const multiplier = parseFloat(readLS('fg_margin_multiplier', '3'));
  const msrpMult = parseFloat(readLS('fg_msrp_multiplier', '2'));
  const autoDesc = readLS('fg_auto_description', 'true') !== 'false';
  const defaultMadeIn = readLS('fg_made_in', 'China');
  const defaultPack = readLS('fg_pack', 'Open-pack');
  const defaultMinQty = parseInt(readLS('fg_min_qty', '6'));
  const defaultWeight = parseFloat(readLS('fg_weight', '0.5'));

  // Read vendor policies
  const vendorPolicy = useMemo(() => {
    try {
      const policies = JSON.parse(localStorage.getItem('fg_vendor_policies') || '[]');
      return policies.find((p: { name: string }) => p.name === vendorName) || null;
    } catch { return null; }
  }, [vendorName]);

  const enName = product ? (NAME_MAP[product.name] || product.nameEn || product.name) : '';
  const calcPrice = product ? (product.yuan / rate * multiplier) : 0;

  // Form state
  const [itemName, setItemName] = useState('');
  const [styleNumber, setStyleNumber] = useState('');
  const [status, setStatus] = useState('Active');
  const [sub1, setSub1] = useState('');
  const [sub2, setSub2] = useState('');
  const [description, setDescription] = useState('');
  const [originalPrice, setOriginalPrice] = useState(0);
  const [salePrice, setSalePrice] = useState('');
  const [bodyFit, setBodyFit] = useState('');
  const [pattern, setPattern] = useState('');
  const [length, setLength] = useState('');
  const [style, setStyle] = useState('');
  const [fabric, setFabric] = useState('');
  const [occasion, setOccasion] = useState('');
  const [season, setSeason] = useState('');
  const [holiday, setHoliday] = useState('');
  const [sizes, setSizes] = useState<string[]>([...SIZES]);
  const [pack, setPack] = useState('');
  const [minQty, setMinQty] = useState(0);
  const [colors, setColors] = useState('Black');
  const [madeIn, setMadeIn] = useState('');
  const [fabricContents, setFabricContents] = useState('100% Polyester');
  const [valueFlags, setValueFlags] = useState<string[]>([]);
  const [weight, setWeight] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  // Reset form when product changes
  React.useEffect(() => {
    if (product && open) {
      setItemName(NAME_MAP[product.name] || product.nameEn);
      setStyleNumber(genStyleNumber(vendorName));
      setStatus('Active');
      const vpSub1 = vendorPolicy?.fgCategory || 'Tops';
      setSub1(vpSub1);
      setSub2('');
      const vpOccasion = vendorPolicy?.occasion || 'Casual';
      const vpSeason = vendorPolicy?.season || 'All Season';
      const vpHoliday = vendorPolicy?.holiday || 'None';
      setOccasion(vpOccasion);
      setSeason(vpSeason);
      setHoliday(vpHoliday);
      const price = parseFloat((product.yuan / rate * multiplier).toFixed(2));
      setOriginalPrice(price);
      setSalePrice('');
      setDescription(autoDesc ? generateDescription(NAME_MAP[product.name] || product.nameEn, vpOccasion) : '');
      setBodyFit(''); setPattern(''); setLength(''); setStyle(''); setFabric('');
      setSizes([...SIZES]);
      setPack(defaultPack);
      setMinQty(defaultMinQty);
      setColors('Black');
      setMadeIn(defaultMadeIn);
      setFabricContents('100% Polyester');
      setValueFlags([]);
      setWeight(defaultWeight);
      setErrors({});
    }
  }, [product, open, vendorName, rate, multiplier, autoDesc, defaultPack, defaultMinQty, defaultMadeIn, defaultWeight, vendorPolicy]);

  const msrp = (originalPrice * msrpMult).toFixed(2);

  const handleConfirm = () => {
    const newErrors: Record<string, boolean> = {};
    if (!itemName.trim()) newErrors.itemName = true;
    if (!sub1) newErrors.sub1 = true;
    if (!originalPrice || originalPrice <= 0) newErrors.price = true;
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onConfirm();
  };

  const toggleSize = (s: string) => {
    setSizes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const toggleFlag = (f: string) => {
    setValueFlags(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const regenerateDesc = () => {
    setDescription(generateDescription(itemName || enName, occasion || 'Casual'));
  };

  const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{children}</h3>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[600px] p-0 flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetHeader>
            <SheetTitle className="text-lg">FashionGo 등록</SheetTitle>
            <SheetDescription>필수 항목(*)을 확인하고 등록을 완료하세요</SheetDescription>
          </SheetHeader>
        </div>

        <ScrollArea className="flex-1 px-6">
          <div className="space-y-6 py-6">

            {/* SECTION 1 — Basic Information */}
            <div className="space-y-4">
              <SectionTitle>Basic Information</SectionTitle>
              <div className="space-y-2">
                <Label>Item Name <span className="text-destructive">*</span></Label>
                <Input
                  value={itemName}
                  onChange={e => { setItemName(e.target.value.slice(0, 60)); setErrors(p => ({ ...p, itemName: false })); }}
                  maxLength={60}
                  className={errors.itemName ? 'border-destructive' : ''}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Do not include special characters</span>
                  <span>{itemName.length}/60</span>
                </div>
                {errors.itemName && <p className="text-xs text-destructive">상품명을 입력하세요</p>}
              </div>
              <div className="space-y-2">
                <Label>Style Number</Label>
                <Input value={styleNumber} onChange={e => setStyleNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <RadioGroup value={status} onValueChange={setStatus} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Active" id="fg-active" />
                    <Label htmlFor="fg-active" className="font-normal cursor-pointer">Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Inactive" id="fg-inactive" />
                    <Label htmlFor="fg-inactive" className="font-normal cursor-pointer">Inactive</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>

            <Separator />

            {/* SECTION 2 — FG Category */}
            <div className="space-y-4">
              <SectionTitle>FG Category <span className="text-destructive">*</span></SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Main</Label>
                  <Input value="Women's Apparel" readOnly className="bg-muted" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">1st Sub</Label>
                  <Select value={sub1} onValueChange={v => { setSub1(v); setErrors(p => ({ ...p, sub1: false })); }}>
                    <SelectTrigger className={errors.sub1 ? 'border-destructive' : ''}><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      {SUB1_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.sub1 && <p className="text-xs text-destructive">카테고리를 선택하세요</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">2nd Sub</Label>
                  <Select value={sub2} onValueChange={setSub2}>
                    <SelectTrigger><SelectValue placeholder="선택 (선택사항)" /></SelectTrigger>
                    <SelectContent>
                      {SUB2_OPTIONS.filter(Boolean).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            {/* SECTION 3 — Images */}
            <div className="space-y-3">
              <SectionTitle>Images</SectionTitle>
              {product && (
                <div className="flex items-center gap-3">
                  <img src={product.img} alt="" className="w-16 h-20 object-cover rounded-md border border-border"
                    style={{ filter: 'brightness(1.1) contrast(1.15) saturate(1.25)' }} />
                  <div className="space-y-1">
                    <Badge variant="secondary" className="bg-green-500/15 text-green-600 border-0 text-xs">✓ AI 모델 이미지 자동 적용</Badge>
                    <p className="text-xs text-muted-foreground">1500 × 2250 px, max 5 MB</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* SECTION 4 — Listing Details */}
            <div className="space-y-4">
              <SectionTitle>Listing Details</SectionTitle>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Description</Label>
                  {autoDesc && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={regenerateDesc}>
                      <RefreshCw className="w-3 h-3" /> Suggest with AI
                    </Button>
                  )}
                </div>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value.slice(0, 4000))}
                  rows={4}
                  maxLength={4000}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Do not include special characters</span>
                  <span>{description.length}/4000</span>
                </div>
              </div>

              {/* Attributes grid */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">Attributes</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Body Fit', value: bodyFit, set: setBodyFit, options: BODY_FITS },
                    { label: 'Pattern', value: pattern, set: setPattern, options: PATTERNS },
                    { label: 'Length', value: length, set: setLength, options: LENGTHS },
                    { label: 'Style', value: style, set: setStyle, options: STYLES },
                    { label: 'Fabric', value: fabric, set: setFabric, options: FABRICS },
                    { label: 'Occasion', value: occasion, set: setOccasion, options: OCCASIONS },
                    { label: 'Season', value: season, set: setSeason, options: SEASONS_LIST },
                    { label: 'Holiday', value: holiday, set: setHoliday, options: HOLIDAYS_LIST },
                  ].map(attr => (
                    <div key={attr.label} className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">{attr.label}</Label>
                      <Select value={attr.value} onValueChange={attr.set}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {attr.options.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* SECTION 5 — Pricing */}
            <div className="space-y-4">
              <SectionTitle>Pricing</SectionTitle>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Original Price <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={originalPrice}
                    onChange={e => { setOriginalPrice(parseFloat(e.target.value) || 0); setErrors(p => ({ ...p, price: false })); }}
                    className={`font-bold text-destructive ${errors.price ? 'border-destructive' : ''}`}
                  />
                  {product && (
                    <p className="text-[10px] text-muted-foreground">
                      ¥{product.yuan} ÷ {rate} × {multiplier} = ${calcPrice.toFixed(2)}
                    </p>
                  )}
                  {errors.price && <p className="text-xs text-destructive">가격을 입력하세요</p>}
                </div>
                <div className="space-y-2">
                  <Label>Sale Price</Label>
                  <Input type="number" min={0} step={0.01} value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="선택사항" />
                </div>
                <div className="space-y-2">
                  <Label>MSRP</Label>
                  <Input value={`$${msrp}`} readOnly className="bg-muted" />
                  <p className="text-[10px] text-muted-foreground">자동 계산: 판매가 × {msrpMult}</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* SECTION 6 — Variants / Inventory */}
            <div className="space-y-4">
              <SectionTitle>Variants / Inventory</SectionTitle>
              <div className="space-y-2">
                <Label className="text-xs">Size</Label>
                <div className="flex flex-wrap gap-2">
                  {SIZES.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => toggleSize(s)}
                      className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                        sizes.includes(s)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Pack</Label>
                  <Select value={pack} onValueChange={setPack}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Open-pack', '2-pack', '3-pack', '6-pack'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Min. Qty</Label>
                  <Input type="number" min={1} value={minQty} onChange={e => setMinQty(parseInt(e.target.value) || 1)} className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Color</Label>
                  <Input value={colors} onChange={e => setColors(e.target.value)} className="h-8 text-xs" placeholder="Black" />
                </div>
              </div>
            </div>

            <Separator />

            {/* SECTION 7 — Additional Details */}
            <div className="space-y-4">
              <SectionTitle>Additional Details</SectionTitle>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Made In</Label>
                  <Select value={madeIn} onValueChange={setMadeIn}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['China', 'USA', 'Korea', 'Vietnam', 'India', 'Other'].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Fabric Contents</Label>
                  <Input value={fabricContents} onChange={e => setFabricContents(e.target.value)} className="h-8 text-xs" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Value</Label>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {VALUE_FLAGS.map(f => (
                    <label key={f} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox checked={valueFlags.includes(f)} onCheckedChange={() => toggleFlag(f)} />
                      <span className="text-xs">{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <Separator />

            {/* SECTION 8 — Shipment */}
            <div className="space-y-3">
              <SectionTitle>Shipment</SectionTitle>
              <div className="w-1/2 space-y-1.5">
                <Label className="text-xs">Weight (lb)</Label>
                <Input type="number" min={0.01} step={0.1} value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} className="h-8 text-xs" />
              </div>
            </div>

            {/* Bottom padding for sticky footer */}
            <div className="h-4" />
          </div>
        </ScrollArea>

        {/* Sticky Footer */}
        <div className="shrink-0 border-t border-border px-6 py-4 flex items-center justify-between bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleConfirm}>
            등록 확정
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default FGRegistrationSheet;
