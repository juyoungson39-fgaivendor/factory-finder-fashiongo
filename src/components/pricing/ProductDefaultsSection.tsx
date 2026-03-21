import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';

const ProductDefaultsSection = () => {
  const { toast } = useToast();

  const [madeIn, setMadeIn] = useState('China');
  const [pack, setPack] = useState('Open-pack');
  const [minQty, setMinQty] = useState(6);
  const [weight, setWeight] = useState(0.5);
  const [defaultStatus, setDefaultStatus] = useState('Active');
  const [msrpMultiplier, setMsrpMultiplier] = useState(2);
  const [autoDescription, setAutoDescription] = useState(true);
  const [descriptionTemplate, setDescriptionTemplate] = useState('');

  useEffect(() => {
    const saved = {
      madeIn: localStorage.getItem('fg_made_in'),
      pack: localStorage.getItem('fg_pack'),
      minQty: localStorage.getItem('fg_min_qty'),
      weight: localStorage.getItem('fg_weight'),
      status: localStorage.getItem('fg_default_status'),
      msrp: localStorage.getItem('fg_msrp_multiplier'),
      autoDesc: localStorage.getItem('fg_auto_description'),
      descTemplate: localStorage.getItem('fg_description_template'),
    };
    if (saved.madeIn) setMadeIn(saved.madeIn);
    if (saved.pack) setPack(saved.pack);
    if (saved.minQty) setMinQty(parseFloat(saved.minQty));
    if (saved.weight) setWeight(parseFloat(saved.weight));
    if (saved.status) setDefaultStatus(saved.status);
    if (saved.msrp) setMsrpMultiplier(parseFloat(saved.msrp));
    if (saved.autoDesc !== null) setAutoDescription(saved.autoDesc !== 'false');
    if (saved.descTemplate) setDescriptionTemplate(saved.descTemplate);
  }, []);

  const sampleFgPrice = 21.4;
  const msrpPreview = (sampleFgPrice * msrpMultiplier).toFixed(1);

  const saveDefaults = () => {
    localStorage.setItem('fg_made_in', madeIn);
    localStorage.setItem('fg_pack', pack);
    localStorage.setItem('fg_min_qty', String(minQty));
    localStorage.setItem('fg_weight', String(weight));
    localStorage.setItem('fg_default_status', defaultStatus);
    localStorage.setItem('fg_msrp_multiplier', String(msrpMultiplier));
    localStorage.setItem('fg_auto_description', String(autoDescription));
    localStorage.setItem('fg_description_template', descriptionTemplate);
    toast({ title: '기본값이 저장되었습니다' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">상품 등록 기본값</CardTitle>
        <CardDescription>1688/Alibaba에서 가져올 수 없는 항목의 기본값을 설정합니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* Style Number 규칙 */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">Style Number 규칙</Label>
          <div className="space-y-2">
            <Label className="text-sm">Style Number 형식</Label>
            <div className="flex items-center gap-3 flex-wrap">
              <code className="px-3 py-1.5 rounded-md bg-muted text-sm font-mono">
                FG-[VENDOR]-[YYYYMM]-[4자리]
              </code>
              <Badge variant="secondary" className="text-xs">예) FG-BASIC-202603-4821</Badge>
            </div>
          </div>
        </div>

        {/* 등록 기본값 */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold">등록 기본값</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="made-in">Made In</Label>
              <Select value={madeIn} onValueChange={setMadeIn}>
                <SelectTrigger id="made-in"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['China', 'USA', 'Korea', 'Vietnam', 'India', 'Other'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pack">Pack</Label>
              <Select value={pack} onValueChange={setPack}>
                <SelectTrigger id="pack"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Open-pack', '2-pack', '3-pack', '6-pack'].map(v => (
                    <SelectItem key={v} value={v}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min-qty">Min. Qty</Label>
              <Input id="min-qty" type="number" min={1} value={minQty} onChange={e => setMinQty(parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Weight (lb)</Label>
              <Input id="weight" type="number" min={0.01} step={0.1} value={weight} onChange={e => setWeight(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Default Status</Label>
              <RadioGroup value={defaultStatus} onValueChange={setDefaultStatus} className="flex gap-4">
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Active" id="status-active" />
                  <Label htmlFor="status-active" className="cursor-pointer font-normal">Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="Inactive" id="status-inactive" />
                  <Label htmlFor="status-inactive" className="cursor-pointer font-normal">Inactive</Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="msrp">MSRP 배수</Label>
              <p className="text-xs text-muted-foreground">FashionGo 판매가 × N = MSRP</p>
              <Input id="msrp" type="number" min={0.1} step={0.1} value={msrpMultiplier} onChange={e => setMsrpMultiplier(parseFloat(e.target.value) || 1)} />
              <p className="text-xs text-muted-foreground">
                예) ${sampleFgPrice} × {msrpMultiplier} = MSRP <span className="font-semibold">${msrpPreview}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Description 자동생성 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Label className="text-sm font-semibold cursor-pointer">AI Description 자동생성</Label>
              {autoDescription && <Badge variant="secondary" className="bg-green-500/15 text-green-600 border-0 text-xs">AI 생성 활성화</Badge>}
            </div>
            <Switch checked={autoDescription} onCheckedChange={setAutoDescription} />
          </div>
          {!autoDescription && (
            <Textarea
              placeholder="기본 Description 템플릿을 입력하세요..."
              value={descriptionTemplate}
              onChange={e => setDescriptionTemplate(e.target.value)}
              rows={4}
            />
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={saveDefaults}>기본값 저장</Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default ProductDefaultsSection;
