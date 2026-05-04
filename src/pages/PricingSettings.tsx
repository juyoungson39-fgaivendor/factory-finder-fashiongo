import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Settings, ArrowRight, Clock, Loader2, Database, Trash2, AlertTriangle, CalendarX } from 'lucide-react';
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

  // ── 데이터 관리 ───────────────────────────────────────────
  const [trendStats, setTrendStats] = useState<{ count: number; oldest: string | null; newest: string | null } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 전체 초기화 다이얼로그
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetStep, setResetStep] = useState<1 | 2>(1);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // 오래된 데이터 정리
  const [cleanupDays, setCleanupDays] = useState('30');
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [cleanupCount, setCleanupCount] = useState<number | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);

  const fetchTrendStats = async () => {
    setStatsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      const { count } = await supabase
        .from('trend_analyses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      const { data: oldest } = await supabase
        .from('trend_analyses')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      const { data: newest } = await supabase
        .from('trend_analyses')
        .select('created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setTrendStats({
        count: count ?? 0,
        oldest: oldest?.created_at ?? null,
        newest: newest?.created_at ?? null,
      });
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => { fetchTrendStats(); }, []);

  const handleResetData = async () => {
    setResetLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) { toast({ title: '로그인이 필요합니다.', variant: 'destructive' }); return; }
      const { error } = await supabase.from('trend_analyses').delete().eq('user_id', userId);
      if (error) throw error;
      toast({ title: '데이터가 초기화되었습니다' });
      setResetDialogOpen(false);
      setResetStep(1);
      setResetConfirmText('');
      fetchTrendStats();
    } catch (e: any) {
      toast({ title: '초기화 실패', description: e?.message, variant: 'destructive' });
    } finally {
      setResetLoading(false);
    }
  };

  const openCleanupDialog = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (!userId) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - parseInt(cleanupDays));
    const { count } = await supabase
      .from('trend_analyses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .lt('created_at', cutoff.toISOString());
    setCleanupCount(count ?? 0);
    setCleanupDialogOpen(true);
  };

  const handleCleanupData = async () => {
    setCleanupLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - parseInt(cleanupDays));
      const { error } = await supabase
        .from('trend_analyses')
        .delete()
        .eq('user_id', userId)
        .lt('created_at', cutoff.toISOString());
      if (error) throw error;
      toast({ title: `${cleanupDays}일 이전 데이터가 삭제되었습니다` });
      setCleanupDialogOpen(false);
      fetchTrendStats();
    } catch (e: any) {
      toast({ title: '삭제 실패', description: e?.message, variant: 'destructive' });
    } finally {
      setCleanupLoading(false);
    }
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
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

      {/* SECTION — 데이터 관리 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            데이터 관리
          </CardTitle>
          <CardDescription>
            트렌드 데이터를 관리합니다. 초기화 시 모든 수집 데이터가 삭제됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* 트렌드 데이터 현황 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">트렌드 데이터 현황</h4>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={fetchTrendStats} disabled={statsLoading}>
                {statsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : '새로고침'}
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-secondary/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">총 트렌드 수</p>
                <p className="text-2xl font-bold text-foreground">
                  {statsLoading ? '—' : (trendStats?.count ?? 0).toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground ml-1">건</span>
                </p>
              </div>
              <div className="rounded-lg border bg-secondary/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">가장 오래된 데이터</p>
                <p className="text-sm font-semibold text-foreground">
                  {statsLoading ? '—' : formatDate(trendStats?.oldest ?? null)}
                </p>
              </div>
              <div className="rounded-lg border bg-secondary/40 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-1">가장 최근 데이터</p>
                <p className="text-sm font-semibold text-foreground">
                  {statsLoading ? '—' : formatDate(trendStats?.newest ?? null)}
                </p>
              </div>
            </div>
          </div>

          {/* 구분선 */}
          <div className="border-t border-border" />

          {/* 오래된 데이터 정리 */}
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-sm font-medium flex items-center gap-1.5">
                  <CalendarX className="w-4 h-4 text-muted-foreground" />
                  오래된 데이터 정리
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">전체 초기화보다 안전하게 기간을 지정해 삭제합니다.</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-3">
              <Select value={cleanupDays} onValueChange={setCleanupDays}>
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30일 이전</SelectItem>
                  <SelectItem value="60">60일 이전</SelectItem>
                  <SelectItem value="90">90일 이전</SelectItem>
                  <SelectItem value="180">180일 이전</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={openCleanupDialog}>
                삭제 대상 확인 및 삭제
              </Button>
            </div>
          </div>

          {/* 구분선 */}
          <div className="border-t border-border" />

          {/* 전체 초기화 */}
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                전체 데이터 초기화
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">모든 수집된 트렌드 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              className="h-8 text-xs shrink-0 ml-4"
              onClick={() => { setResetStep(1); setResetConfirmText(''); setResetDialogOpen(true); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              전체 데이터 초기화
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 전체 초기화 다이얼로그 (2단계) ─────────────────────── */}
      <Dialog open={resetDialogOpen} onOpenChange={(o) => { if (!o) { setResetStep(1); setResetConfirmText(''); } setResetDialogOpen(o); }}>
        <DialogContent className="max-w-md">
          {resetStep === 1 ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  트렌드 데이터 초기화
                </DialogTitle>
                <DialogDescription>
                  정말로 모든 트렌드 데이터를 초기화하시겠습니까? 이 작업은 되돌릴 수 없습니다.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                현재 <strong>{(trendStats?.count ?? 0).toLocaleString()}건</strong>의 트렌드 데이터가 모두 삭제됩니다.
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>취소</Button>
                <Button variant="destructive" onClick={() => setResetStep(2)}>초기화 진행</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  최종 확인
                </DialogTitle>
                <DialogDescription>
                  계속하려면 아래 입력란에 <strong className="text-foreground">'초기화'</strong>를 입력하세요.
                </DialogDescription>
              </DialogHeader>
              <Input
                placeholder="초기화를 확인하려면 '초기화'를 입력하세요"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="text-sm"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setResetDialogOpen(false)}>취소</Button>
                <Button
                  variant="destructive"
                  disabled={resetConfirmText !== '초기화' || resetLoading}
                  onClick={handleResetData}
                >
                  {resetLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '삭제 실행'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── 오래된 데이터 정리 확인 다이얼로그 ─────────────────── */}
      <Dialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>오래된 데이터 삭제</DialogTitle>
            <DialogDescription>
              {cleanupDays}일 이전의 트렌드 데이터를 삭제합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm">
            {cleanupCount === 0 ? (
              <span className="text-muted-foreground">삭제할 데이터가 없습니다.</span>
            ) : (
              <>
                <strong>{(cleanupCount ?? 0).toLocaleString()}건</strong>이 삭제됩니다. 진행하시겠습니까?
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCleanupDialogOpen(false)}>취소</Button>
            <Button
              variant="destructive"
              disabled={!cleanupCount || cleanupLoading}
              onClick={handleCleanupData}
            >
              {cleanupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '삭제 실행'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default PricingSettings;
