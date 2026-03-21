import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';

interface VendorPolicy {
  name: string;
  color: string;
  fgCategory: string;
  season: string;
  occasion: string;
  holiday: string;
}

const DEFAULT_POLICIES: VendorPolicy[] = [
  { name: 'BASIC', color: 'bg-slate-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'CURVE', color: 'bg-pink-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'DENIM', color: 'bg-blue-600', fgCategory: 'Jeans & Denim', season: 'All Season', occasion: 'Casual', holiday: 'None' },
  { name: 'VACATION', color: 'bg-emerald-500', fgCategory: 'Swimwear', season: 'Summer', occasion: 'Beach', holiday: 'None' },
  { name: 'FESTIVAL', color: 'bg-purple-500', fgCategory: 'Dresses', season: 'All Season', occasion: 'Holiday', holiday: '4th of July' },
  { name: 'TREND', color: 'bg-orange-500', fgCategory: 'Tops', season: 'All Season', occasion: 'Casual', holiday: 'None' },
];

const CATEGORIES = ['Tops', 'Dresses', 'Jeans & Denim', 'Swimwear', 'Bottoms', 'Outerwear', 'Activewear', 'Lingerie', 'Accessories'];
const SEASONS = ['All Season', 'Spring', 'Summer', 'Fall', 'Winter'];
const OCCASIONS = ['Casual', 'Beach', 'Holiday', 'Formal', 'Work', 'Party', 'Athletic'];
const HOLIDAYS = ['None', '4th of July', 'Halloween', 'Thanksgiving', 'Christmas', 'New Year', 'Valentine', 'Mardi Gras', 'Prom'];

const VendorPolicySection = () => {
  const { toast } = useToast();
  const [policies, setPolicies] = useState<VendorPolicy[]>(DEFAULT_POLICIES);

  useEffect(() => {
    const saved = localStorage.getItem('fg_vendor_policies');
    if (saved) {
      try { setPolicies(JSON.parse(saved)); } catch {}
    }
  }, []);

  const updatePolicy = (idx: number, field: keyof VendorPolicy, value: string) => {
    setPolicies(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const savePolicy = (idx: number) => {
    localStorage.setItem('fg_vendor_policies', JSON.stringify(policies));
    toast({ title: `${policies[idx].name} 정책이 저장되었습니다` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI Vendor별 등록 정책</CardTitle>
        <CardDescription>각 AI Vendor의 FashionGo 카테고리 매핑과 기본 속성을 설정합니다</CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          {policies.map((p, idx) => (
            <AccordionItem key={p.name} value={p.name}>
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3 flex-1 mr-4">
                  <Badge className={`${p.color} text-white border-0`}>{p.name}</Badge>
                  <span className="text-sm text-muted-foreground hidden sm:inline">{p.fgCategory}</span>
                  <span className="text-sm text-muted-foreground hidden sm:inline">·</span>
                  <span className="text-sm text-muted-foreground hidden sm:inline">{p.season}</span>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 pb-4">
                  <div className="space-y-2">
                    <Label>FG 1st Sub Category</Label>
                    <Select value={p.fgCategory} onValueChange={v => updatePolicy(idx, 'fgCategory', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Season</Label>
                    <Select value={p.season} onValueChange={v => updatePolicy(idx, 'season', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEASONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Occasion</Label>
                    <Select value={p.occasion} onValueChange={v => updatePolicy(idx, 'occasion', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OCCASIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Holiday Tag</Label>
                    <Select value={p.holiday} onValueChange={v => updatePolicy(idx, 'holiday', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {HOLIDAYS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={() => savePolicy(idx)}>저장</Button>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
};

export default VendorPolicySection;
