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
import { Settings, ArrowRight, Clock, Sparkles, Loader2 } from 'lucide-react';
import ProductDefaultsSection from '@/components/pricing/ProductDefaultsSection';
import VendorPolicySection from '@/components/pricing/VendorPolicySection';
import AIVendorManagementSection from '@/components/pricing/AIVendorManagementSection';
import { useFgSettings, useUpdateFgSettings } from '@/integrations/supabase/hooks/use-fg-settings';
import { supabase } from '@/integrations/supabase/client';

const PricingSettings = () => {
  const { toast } = useToast();
  const { data: settings } = useFgSettings();
  const updateSettings = useUpdateFgSettings();

  // Section 1
  const [exchangeRate, setExchangeRate] = useState(settings?.exchangeRate ?? 7);
  const [marginMultiplier, setMarginMultiplier] = useState(settings?.marginMultiplier ?? 3);

  // Section 2
  const [vendors, setVendors] = useState(settings?.vendorCriteria ?? []);

  // Section 3
  const [autoEnabled, setAutoEnabled] = useState(settings?.trendAuto ?? true);
  const [schedule, setSchedule] = useState(settings?.trendSchedule ?? 'weekly_mon');
  const [runTime, setRunTime] = useState(settings?.trendTime ?? '06:00');

  // Image embedding generation
  const [embedLoading, setEmbedLoading] = useState(false);
  const [embedRemaining, setEmbedRemaining] = useState<number | null>(null);
  const [embedProcessed, setEmbedProcessed] = useState<number | null>(null);
  const [embedFailures, setEmbedFailures] = useState<Array<{ id?: string; status: string; reason: string }>>([]);

  const runEmbedBatch = async () => {
    setEmbedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('batch-generate-image-embeddings', {
        body: {},
      });
      if (error) throw error;
      const processed = data?.processed ?? 0;
      const failed = data?.failed ?? 0;
      const remaining = data?.remaining ?? 0;
      const results: Array<any> = Array.isArray(data?.results) ? data.results : [];
      const failures = results
        .filter((r) => r?.status === 'error' || r?.status === 'skip')
        .map((r) => ({
          id: r.id ?? r.product_id,
          status: r.status,
          reason: r.reason ?? r.error ?? '알 수 없는 사유',
        }));
      setEmbedRemaining(remaining);
      setEmbedProcessed(processed);
      setEmbedFailures(failures);
      if (failures.length === 0) {
        toast({
          title: '이미지 임베딩 처리 완료',
          description: `처리 ${processed}건 · 실패 ${failed}건 · 남은 상품 ${remaining}건`,
        });
      }
    } catch (e: any) {
      toast({
        title: '임베딩 생성 실패',
        description: e?.message ?? '알 수 없는 오류',
        variant: 'destructive',
      });
    } finally {
      setEmbedLoading(false);
    }
  };
  // Sync local state when settings load from Supabase
  useEffect(() => {
    if (!settings) return;
    setExchangeRate(settings.exchangeRate);
    setMarginMultiplier(settings.marginMultiplier);
    setVendors(settings.vendorCriteria);
    setAutoEnabled(settings.trendAuto);
    setSchedule(settings.trendSchedule);
    setRunTime(settings.trendTime);
  }, [settings]);

  const toDollar = (cny: number) => exchangeRate > 0 ? (cny / exchangeRate).toFixed(2) : '—';
  const toFG = (cny: number) => exchangeRate > 0 ? ((cny / exchangeRate) * marginMultiplier).toFixed(2) : '—';

  const savePricing = () => {
    updateSettings.mutate(
      { exchangeRate, marginMultiplier },
      { onSuccess: () => toast({ title: '가격 설정이 저장되었습니다' }) },
    );
  };

  const saveVendors = () => {
    updateSettings.mutate(
      { vendorCriteria: vendors },
      { onSuccess: () => toast({ title: 'AI Vendor 기준이 저장되었습니다' }) },
    );
  };

  const saveSchedule = () => {
    updateSettings.mutate(
      { trendAuto: autoEnabled, trendSchedule: schedule, trendTime: runTime },
      { onSuccess: () => toast({ title: '스케줄 설정이 저장되었습니다' }) },
    );
  };

  const updateVendor = (idx: number, field: 'keywords' | 'categories', value: string) => {
    setVendors(prev => prev.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  return (
    <div className="space-y-8">

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

      {/* SECTION 2 — AI Vendor 활성/비활성 + 추가 */}
      <AIVendorManagementSection />

      {/* SECTION 3 — 상품 등록 기본값 */}
      <ProductDefaultsSection />

      {/* SECTION 4 — AI Vendor 등록 정책 */}
      <VendorPolicySection />

      {/* SECTION 4 — AI Vendor 스타일 기준 */}
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

      {/* SECTION 5 — 이미지 임베딩 생성 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            이미지 임베딩 생성
          </CardTitle>
          <CardDescription>
            소싱가능상품의 이미지를 AI로 분석하여 매칭 정확도를 향상시킵니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={runEmbedBatch} disabled={embedLoading}>
              {embedLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> 처리 중...
                </>
              ) : (
                '이미지 임베딩 생성'
              )}
            </Button>
            {embedRemaining !== null && embedRemaining > 0 && (
              <Button variant="outline" onClick={runEmbedBatch} disabled={embedLoading}>
                계속 실행 ({embedRemaining}건 남음)
              </Button>
            )}
            {embedRemaining !== null && (
              <span className="text-xs text-muted-foreground">
                남은 상품 {embedRemaining}건
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PricingSettings;
