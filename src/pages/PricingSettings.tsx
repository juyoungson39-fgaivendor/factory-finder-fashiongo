import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Settings, ArrowRight, Clock } from 'lucide-react';

const DEFAULT_VENDORS = [
  { name: 'BASIC', color: 'bg-slate-500', position: '베이직 스테디', keywords: '뉴트럴,데일리,베이직,심플', categories: 'Tops, Basics, Everyday Wear' },
  { name: 'CURVE', color: 'bg-pink-500', position: '플러스사이즈', keywords: '플러스,커브,사이즈인클루시브,빅사이즈', categories: 'Plus Size Tops, Dresses, Bottoms' },
  { name: 'DENIM', color: 'bg-blue-600', position: '데님 스테디', keywords: '데님,인디고,워시드,진', categories: 'Jeans, Denim Jackets, Shorts' },
  { name: 'VACATION', color: 'bg-emerald-500', position: '리조트/여름', keywords: '리조트,코스탈,스윔,린넨,비치', categories: 'Swimwear, Resort, Linen' },
  { name: 'FESTIVAL', color: 'bg-purple-500', position: '미국 시즌 이벤트', keywords: '시즌,파티,포멀,홀리데이,프롬', categories: 'Holiday, Prom, Party, Formal' },
  { name: 'TREND', color: 'bg-orange-500', position: 'SNS 트렌드', keywords: '바이럴,트렌드,인스타,틱톡', categories: 'TikTok Viral, Instagram Trend' },
];

const PricingSettings = () => {
  const { toast } = useToast();

  // Section 1
  const [exchangeRate, setExchangeRate] = useState(7);
  const [marginMultiplier, setMarginMultiplier] = useState(3);

  // Section 2
  const [vendors, setVendors] = useState(DEFAULT_VENDORS);

  // Section 3
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [schedule, setSchedule] = useState('weekly_mon');
  const [runTime, setRunTime] = useState('06:00');

  useEffect(() => {
    const savedRate = localStorage.getItem('fg_exchange_rate');
    const savedMultiplier = localStorage.getItem('fg_margin_multiplier');
    if (savedRate) setExchangeRate(parseFloat(savedRate));
    if (savedMultiplier) setMarginMultiplier(parseFloat(savedMultiplier));

    const savedVendors = localStorage.getItem('fg_vendor_criteria');
    if (savedVendors) {
      try { setVendors(JSON.parse(savedVendors)); } catch {}
    }

    const savedAuto = localStorage.getItem('fg_trend_auto');
    if (savedAuto !== null) setAutoEnabled(savedAuto === 'true');
    const savedSchedule = localStorage.getItem('fg_trend_schedule');
    if (savedSchedule) setSchedule(savedSchedule);
    const savedTime = localStorage.getItem('fg_trend_time');
    if (savedTime) setRunTime(savedTime);
  }, []);

  const toDollar = (cny: number) => exchangeRate > 0 ? (cny / exchangeRate).toFixed(2) : '—';
  const toFG = (cny: number) => exchangeRate > 0 ? ((cny / exchangeRate) * marginMultiplier).toFixed(2) : '—';

  const savePricing = () => {
    localStorage.setItem('fg_exchange_rate', String(exchangeRate));
    localStorage.setItem('fg_margin_multiplier', String(marginMultiplier));
    toast({ title: '가격 설정이 저장되었습니다' });
  };

  const saveVendors = () => {
    localStorage.setItem('fg_vendor_criteria', JSON.stringify(vendors));
    toast({ title: 'AI Vendor 기준이 저장되었습니다' });
  };

  const saveSchedule = () => {
    localStorage.setItem('fg_trend_auto', String(autoEnabled));
    localStorage.setItem('fg_trend_schedule', schedule);
    localStorage.setItem('fg_trend_time', runTime);
    toast({ title: '스케줄 설정이 저장되었습니다' });
  };

  const updateVendor = (idx: number, field: 'keywords' | 'categories', value: string) => {
    setVendors(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6" />
          가격 설정
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          1688/Alibaba 원가를 FashionGo 판매가로 자동 변환하는 기준을 설정합니다
        </p>
      </div>

      {/* SECTION 1 — 가격 변환 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">가격 변환 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="exchange">환율 (위안 → USD)</Label>
              <p className="text-xs text-muted-foreground">1688 판매가(위안)를 달러로 나누는 값</p>
              <Input
                id="exchange"
                type="number"
                min={0.01}
                step={0.1}
                placeholder="7"
                value={exchangeRate}
                onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="margin">마진 배수</Label>
              <p className="text-xs text-muted-foreground">달러 원가에 곱해서 FashionGo 판매가를 만드는 값</p>
              <Input
                id="margin"
                type="number"
                min={0.01}
                step={0.1}
                placeholder="3"
                value={marginMultiplier}
                onChange={e => setMarginMultiplier(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          {/* Live Preview */}
          <Card className="bg-secondary/50 border-dashed">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">가격 미리보기</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[100, 500].map(cny => (
                <div key={cny} className="flex items-center gap-2 flex-wrap text-sm">
                  <span className="font-medium">원가 ¥{cny}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>달러 환산 <span className="font-medium">${toDollar(cny)}</span></span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span>FashionGo 판매가 <span className="font-bold text-destructive">${toFG(cny)}</span></span>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={savePricing}>설정 저장</Button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 2 — AI Vendor 스타일 기준 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Vendor 배정 기준</CardTitle>
          <CardDescription>상품 카테고리/키워드 분석으로 AI Vendor를 자동 배정합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Vendor</TableHead>
                  <TableHead className="w-[130px]">포지션</TableHead>
                  <TableHead>키워드</TableHead>
                  <TableHead>주력 카테고리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendors.map((v, idx) => (
                  <TableRow key={v.name}>
                    <TableCell>
                      <Badge className={`${v.color} text-white border-0`}>{v.name}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{v.position}</TableCell>
                    <TableCell>
                      <Input
                        className="text-sm h-8"
                        value={v.keywords}
                        onChange={e => updateVendor(idx, 'keywords', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        className="text-sm h-8"
                        value={v.categories}
                        onChange={e => updateVendor(idx, 'categories', e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveVendors}>기준 저장</Button>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 3 — 트렌드 분석 스케줄 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">트렌드 분석 자동 실행</CardTitle>
          <CardDescription>FashionGo 트렌드를 자동으로 분석하는 스케줄을 설정합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-toggle" className="cursor-pointer">자동 분석 활성화</Label>
            <Switch id="auto-toggle" checked={autoEnabled} onCheckedChange={setAutoEnabled} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>실행 주기</Label>
              <Select value={schedule} onValueChange={setSchedule} disabled={!autoEnabled}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">매일</SelectItem>
                  <SelectItem value="weekly_mon">매주 월요일</SelectItem>
                  <SelectItem value="weekly_fri">매주 금요일</SelectItem>
                  <SelectItem value="manual">수동만</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="run-time">실행 시간</Label>
              <Input
                id="run-time"
                type="time"
                value={runTime}
                onChange={e => setRunTime(e.target.value)}
                disabled={!autoEnabled}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            최근 실행: 분석 이력은 FashionGo 페이지에서 확인하세요
          </p>

          <div className="flex justify-end">
            <Button onClick={saveSchedule}>스케줄 저장</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PricingSettings;
