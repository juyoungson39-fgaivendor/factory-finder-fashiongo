import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { deriveShopId } from '@/lib/factoryShopId';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Search, Upload, ImageIcon, X, Bot, CheckCircle2, XCircle, Globe, Eye } from 'lucide-react';
import BulkFactoryUpload from '@/components/factory/BulkFactoryUpload';
import BulkCrawl1688Panel from '@/components/factory/BulkCrawl1688Panel';
import Quick1688Card from '@/components/factory/Quick1688Card';
import AlibabaQuickAddCard from '@/components/factory/AlibabaQuickAddCard';
import { Link } from 'react-router-dom';

interface AgentStep {
  step: string;
  status: string;
  detail?: string;
}

interface ScreenshotThumb {
  label: string;
  url: string;
  source_url: string;
}

const STEP_LABELS: Record<string, Record<string, string>> = {
  '1688': {
    direct_scrape: '1688 직접 크롤링',
    web_search: '1688 웹 검색 수집',
    auto_screenshot: '1688 다중 페이지 캡처 (회사소개/연락처/메인)',
    screenshot_analysis: '스크린샷 분석',
    ai_extraction: 'AI 데이터 추출',
  },
  alibaba: {
    direct_scrape: 'Alibaba 직접 크롤링',
    web_search: 'Alibaba 웹 검색 수집',
    auto_screenshot: 'Alibaba 다중 페이지 캡처 (Company Profile/Contact)',
    screenshot_analysis: '스크린샷 분석',
    ai_extraction: 'AI 데이터 추출',
  },
  default: {
    direct_scrape: '직접 크롤링',
    web_search: '웹 검색 수집',
    auto_screenshot: '자동 스크린샷 캡처',
    screenshot_analysis: '스크린샷 분석',
    ai_extraction: 'AI 데이터 추출',
  },
};

const detectPlatform = (url: string): string => {
  if (url.includes('alibaba.com')) return 'alibaba';
  if (url.includes('1688.com')) return '1688';
  return 'other';
};

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const AddFactory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [crawling, setCrawling] = useState(false);
  const [crawlScores, setCrawlScores] = useState<any[]>([]);
  const [url, setUrl] = useState('');
  const [captchaBlocked, setCaptchaBlocked] = useState(false);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);
  const [screenshotBase64List, setScreenshotBase64List] = useState<string[]>([]);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [capturedScreenshots, setCapturedScreenshots] = useState<ScreenshotThumb[]>([]);
  const [detectedPlatform, setDetectedPlatform] = useState<string>('default');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', source_platform: '', country: '', city: '',
    contact_name: '', contact_email: '', contact_phone: '', contact_wechat: '',
    description: '', main_products: '', moq: '', lead_time: '',
    platform_score: '', repurchase_rate: '', years_on_platform: '',
    certifications: '', fg_category: '', recommendation_grade: '',
    // 1688 detail scores
    score_consultation: '', score_logistics: '', score_dispute: '',
    score_quality: '', score_exchange: '',
    // Alibaba detail scores
    score_supplier_service: '', score_ontime_shipment: '', score_product_quality: '',
    // Alibaba supplier metrics (manual augmentation)
    review_score: '', review_count: '', response_time_hours: '',
    on_time_delivery_rate: '', transaction_volume_usd: '', transaction_count: '',
    gold_supplier_years: '', export_years: '', verified_by: '',
    trade_assurance: false as boolean,
    main_markets: '', capabilities: '', category_ranking: '',
    // Alibaba 4-axis (5pt) experience scores
    consultation_score: '', logistics_score: '',
    after_sales_score: '', product_score: '',
  });

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setCaptchaBlocked(false);
    setAgentSteps([]);
    setDataSource(null);
    if (value) setForm((prev) => ({ ...prev, source_platform: detectPlatform(value) }));
  };

  const handleScreenshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const newPreviews: string[] = [];
    const newBase64s: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const base64 = await fileToBase64(files[i]);
      newBase64s.push(base64);
      newPreviews.push(base64);
    }
    setScreenshotBase64List(prev => [...prev, ...newBase64s]);
    setScreenshotPreviews(prev => [...prev, ...newPreviews]);
  };

  const removeScreenshot = (index: number) => {
    setScreenshotBase64List(prev => prev.filter((_, i) => i !== index));
    setScreenshotPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearScreenshots = () => {
    setScreenshotBase64List([]);
    setScreenshotPreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCrawl = async (useScreenshot = false) => {
    if (!url && screenshotBase64List.length === 0) return;
    const shouldUseScreenshot = useScreenshot || screenshotBase64List.length > 0;

    setCrawling(true);
    setAgentSteps([]);
    setDataSource(null);
    setCapturedScreenshots([]);

    if (!shouldUseScreenshot) {
      setAgentSteps([{ step: 'direct_scrape', status: 'running' }]);
    } else {
      setAgentSteps([{ step: 'screenshot_analysis', status: 'running' }]);
    }

    try {
      const body: any = {
        url: url || undefined,
        agent_mode: true,
        scoring_criteria: criteria.length > 0
          ? criteria.map(c => ({ id: c.id, name: c.name, description: c.description, max_score: c.max_score }))
          : undefined,
      };

      if (shouldUseScreenshot && screenshotBase64List.length > 0) {
        body.screenshot_base64 = screenshotBase64List[0];
        if (screenshotBase64List.length > 1) {
          body.screenshot_base64_list = screenshotBase64List;
        }
      }

      const { data, error } = await supabase.functions.invoke('scrape-factory', { body });
      if (error) throw error;

      // Update agent steps from response
      if (data?.steps) {
        setAgentSteps(data.steps);
      }
      if (data?.platform) {
        setDetectedPlatform(data.platform);
      }
      if (data?.screenshots?.length) {
        setCapturedScreenshots(data.screenshots);
      }

      if (data?.error === 'CAPTCHA_BLOCKED') {
        setCaptchaBlocked(true);
        if (data.steps) setAgentSteps(data.steps);
        toast({
          title: '🤖 Agent: 모든 자동 수집 실패',
          description: '스크린샷을 업로드하면 AI가 정보를 추출합니다.',
          variant: 'destructive',
        });
        return;
      }

      if (data?.error) throw new Error(data.error);

      const d = data.data;
      setDataSource(data.source || 'text');
      setForm((prev) => ({
        ...prev,
        name: d.name || prev.name,
        country: d.country || prev.country,
        city: d.city || prev.city,
        description: d.description || prev.description,
        main_products: d.main_products || prev.main_products,
        moq: d.moq || prev.moq,
        lead_time: d.lead_time || prev.lead_time,
        contact_name: d.contact_name || prev.contact_name,
        contact_email: d.contact_email || prev.contact_email,
        contact_phone: d.contact_phone || prev.contact_phone,
        contact_wechat: d.contact_wechat || prev.contact_wechat,
        source_platform: url ? detectPlatform(url) : prev.source_platform,
        platform_score: d.platform_score != null ? String(d.platform_score) : prev.platform_score,
        repurchase_rate: d.repurchase_rate != null ? String(d.repurchase_rate) : prev.repurchase_rate,
        years_on_platform: d.years_on_platform != null ? String(d.years_on_platform) : prev.years_on_platform,
        certifications: d.certifications ? (Array.isArray(d.certifications) ? d.certifications.join(', ') : d.certifications) : prev.certifications,
        fg_category: d.fg_category || prev.fg_category,
        recommendation_grade: d.recommendation_grade || prev.recommendation_grade,
        // 1688 detail scores
        score_consultation: d.platform_score_detail?.consultation != null ? String(d.platform_score_detail.consultation) : prev.score_consultation,
        score_logistics: d.platform_score_detail?.logistics != null ? String(d.platform_score_detail.logistics) : prev.score_logistics,
        score_dispute: d.platform_score_detail?.dispute != null ? String(d.platform_score_detail.dispute) : prev.score_dispute,
        score_quality: d.platform_score_detail?.quality != null ? String(d.platform_score_detail.quality) : prev.score_quality,
        score_exchange: d.platform_score_detail?.exchange != null ? String(d.platform_score_detail.exchange) : prev.score_exchange,
        // Alibaba detail scores
        score_supplier_service: d.platform_score_detail?.supplier_service != null ? String(d.platform_score_detail.supplier_service) : prev.score_supplier_service,
        score_ontime_shipment: d.platform_score_detail?.ontime_shipment != null ? String(d.platform_score_detail.ontime_shipment) : prev.score_ontime_shipment,
        score_product_quality: d.platform_score_detail?.product_quality != null ? String(d.platform_score_detail.product_quality) : prev.score_product_quality,
      }));

      if (d.scores && Array.isArray(d.scores)) {
        setCrawlScores(d.scores);
      }

      setCaptchaBlocked(false);
      const sourceLabel = data.source === 'search' ? '웹 검색' : data.source === 'screenshot' ? '업로드/자동 스크린샷' : '직접 크롤링';
      toast({
        title: `🤖 Agent 완료 (${sourceLabel})`,
        description: `보이는 정보를 최대한 채워 넣었습니다. 검토 후 등록하세요${d.scores?.length ? ` · ${d.scores.length}개 자동 스코어링` : ''}`,
      });
    } catch (err: any) {
      toast({ title: '추출 실패', description: err.message, variant: 'destructive' });
    } finally {
      setCrawling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({ title: '로그인이 필요합니다', variant: 'destructive' });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: '공장 이름은 필수입니다', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const isAlibaba = form.source_platform === 'alibaba';
      const platformScoreDetail = isAlibaba
        ? (form.score_supplier_service || form.score_ontime_shipment || form.score_product_quality)
          ? {
              supplier_service: form.score_supplier_service ? parseFloat(form.score_supplier_service) : null,
              ontime_shipment: form.score_ontime_shipment ? parseFloat(form.score_ontime_shipment) : null,
              product_quality: form.score_product_quality ? parseFloat(form.score_product_quality) : null,
            }
          : null
        : (form.score_consultation || form.score_logistics || form.score_dispute || form.score_quality || form.score_exchange)
          ? {
              consultation: form.score_consultation ? parseFloat(form.score_consultation) : null,
              logistics: form.score_logistics ? parseFloat(form.score_logistics) : null,
              dispute: form.score_dispute ? parseFloat(form.score_dispute) : null,
              quality: form.score_quality ? parseFloat(form.score_quality) : null,
              exchange: form.score_exchange ? parseFloat(form.score_exchange) : null,
            }
          : null;

      // Alibaba 4-axis (5pt) experience scores -> raw_crawl_data.parsed.experience_scores
      const expScores = (form.consultation_score || form.logistics_score || form.after_sales_score || form.product_score)
        ? {
            consultation: form.consultation_score ? parseFloat(form.consultation_score) : null,
            logistics: form.logistics_score ? parseFloat(form.logistics_score) : null,
            after_sales: form.after_sales_score ? parseFloat(form.after_sales_score) : null,
            product: form.product_score ? parseFloat(form.product_score) : null,
          }
        : null;
      const rawCrawlData = expScores
        ? { parsed: { experience_scores: expScores }, manual: true, saved_at: new Date().toISOString() }
        : null;

      const aliMatch = url.match(/https?:\/\/([a-z0-9_-]+)\.en\.alibaba\.com/i);
      const alibabaSupplierId = aliMatch ? aliMatch[1].toLowerCase() : null;

      const { data, error } = await supabase
        .from('factories')
        .insert({
          user_id: user.id, shop_id: deriveShopId(url), name: form.name, source_url: url || null,
          source_platform: form.source_platform || (alibabaSupplierId ? 'alibaba' : null),
          alibaba_supplier_id: alibabaSupplierId,
          alibaba_url: alibabaSupplierId ? url : null,
          country: form.country || null,
          city: form.city || null, contact_name: form.contact_name || null,
          contact_email: form.contact_email || null, contact_phone: form.contact_phone || null,
          contact_wechat: form.contact_wechat || null, description: form.description || null,
          main_products: form.main_products ? form.main_products.split(',').map((s) => s.trim()) : null,
          moq: form.moq || null, lead_time: form.lead_time || null,
          platform_score: form.platform_score ? parseFloat(form.platform_score) : null,
          repurchase_rate: form.repurchase_rate ? parseFloat(form.repurchase_rate) : null,
          years_on_platform: form.years_on_platform ? parseInt(form.years_on_platform) : null,
          certifications: form.certifications ? form.certifications.split(',').map((s) => s.trim()) : null,
          fg_category: form.fg_category || null,
          recommendation_grade: form.recommendation_grade || null,
          platform_score_detail: platformScoreDetail,
          // Alibaba supplier metrics
          review_score: form.review_score ? parseFloat(form.review_score) : null,
          review_count: form.review_count ? parseInt(form.review_count) : null,
          response_time_hours: form.response_time_hours ? parseFloat(form.response_time_hours) : null,
          on_time_delivery_rate: form.on_time_delivery_rate ? parseFloat(form.on_time_delivery_rate) : null,
          transaction_volume_usd: form.transaction_volume_usd ? parseInt(form.transaction_volume_usd) : null,
          transaction_count: form.transaction_count ? parseInt(form.transaction_count) : null,
          gold_supplier_years: form.gold_supplier_years ? parseInt(form.gold_supplier_years) : null,
          export_years: form.export_years ? parseInt(form.export_years) : null,
          verified_by: form.verified_by || null,
          trade_assurance: form.trade_assurance || false,
          main_markets: form.main_markets ? form.main_markets.split(',').map((s) => s.trim()).filter(Boolean) : null,
          capabilities: form.capabilities ? form.capabilities.split(',').map((s) => s.trim()).filter(Boolean) : null,
          category_ranking: form.category_ranking || null,
          raw_crawl_data: rawCrawlData,
        })
        .select().single();
      if (error) throw error;

      if (crawlScores.length > 0 && data.id) {
        const scoreInserts = crawlScores
          .filter((s: any) => s.criteria_id && typeof s.score === 'number')
          .map((s: any) => ({
            factory_id: data.id,
            criteria_id: s.criteria_id,
            score: Math.min(s.score, 10),
            ai_original_score: Math.min(s.score, 10),
            notes: s.notes || null,
          }));
        if (scoreInserts.length > 0) {
          await supabase.from('factory_scores').insert(scoreInserts);
          await supabase.rpc('recalculate_factory_score', { p_factory_id: data.id });
        }
        toast({ title: '✅ AI가 ' + scoreInserts.length + '개 항목을 자동 평가했습니다.', description: '점수를 검토하고 필요시 교정해주세요.' });
        navigate(`/factories/${data.id}?tab=scoring&ai_scored=true`);
      } else {
        // No crawl scores — trigger auto-scoring via edge function
        toast({ title: '공장이 추가되었습니다. AI 스코어링을 시작합니다...' });
        navigate(`/factories/${data.id}?tab=scoring&ai_scoring=true`);
        // Fire and forget — the detail page will handle the scoring call
        supabase.functions.invoke('auto-score-factory', { body: { factory_id: data.id } }).then(({ data: scoreData, error: scoreErr }) => {
          // scoring result handled by detail page via query refetch
        });
      }
    } catch (err: any) {
      toast({ title: '추가 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateBoolField = (field: string, value: boolean) => setForm((prev) => ({ ...prev, [field]: value }));

  const hasExtractedData = form.name.length > 0;

  return (
    <div>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* Alibaba.com — primary path */}
        <AlibabaQuickAddCard />

        {/* 1688 Quick Crawl (보조 채널) — 기본 접힘 */}
        <details className="group rounded-xl border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground font-medium hover:bg-muted/30 rounded-xl">
            <span>⚡ 1688 자동 크롤링·스코어링 (보조 채널)</span>
            <span className="text-muted-foreground transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="px-4 pb-4 pt-1">
            <Quick1688Card />
          </div>
        </details>


        {/* Data Review Banner */}
        {hasExtractedData && dataSource && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary shrink-0" />
            <p className="text-xs text-primary">
              <strong>검토 필요:</strong> AI가 추출한 데이터를 확인하고 수정한 후 등록하세요.
            </p>
          </div>
        )}

        {/* Basic Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">공장 이름 *</Label>
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">국가 *</Label>
              <Input value={form.country} onChange={(e) => updateField('country', e.target.value)} placeholder="China" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">도시 *</Label>
              <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="Guangzhou" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">주요 제품 (쉼표 구분) *</Label>
              <Input value={form.main_products} onChange={(e) => updateField('main_products', e.target.value)} placeholder="원피스, 블라우스, 니트" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">MOQ *</Label>
              <Input value={form.moq} onChange={(e) => updateField('moq', e.target.value)} placeholder="100pcs" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">리드타임 *</Label>
              <Input value={form.lead_time} onChange={(e) => updateField('lead_time', e.target.value)} placeholder="15-20일" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">설명 *</Label>
              <Textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Alibaba supplier metrics (manual augmentation) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
              Alibaba 공급사 지표 (수동 보강용)
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">별점 (0-5)</Label>
              <Input type="number" step="0.1" min={0} max={5} value={form.review_score} onChange={(e) => updateField('review_score', e.target.value)} placeholder="4.9" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">리뷰 수</Label>
              <Input type="number" value={form.review_count} onChange={(e) => updateField('review_count', e.target.value)} placeholder="183" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">응답시간 (시간)</Label>
              <Input type="number" step="0.5" value={form.response_time_hours} onChange={(e) => updateField('response_time_hours', e.target.value)} placeholder="3" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">정시 납품률 (%)</Label>
              <Input type="number" min={0} max={100} value={form.on_time_delivery_rate} onChange={(e) => updateField('on_time_delivery_rate', e.target.value)} placeholder="98.7" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">거래량 USD</Label>
              <Input type="number" value={form.transaction_volume_usd} onChange={(e) => updateField('transaction_volume_usd', e.target.value)} placeholder="1800000" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">주문 건수</Label>
              <Input type="number" value={form.transaction_count} onChange={(e) => updateField('transaction_count', e.target.value)} placeholder="994" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Gold Supplier 년수</Label>
              <Input type="number" value={form.gold_supplier_years} onChange={(e) => updateField('gold_supplier_years', e.target.value)} placeholder="10" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">수출 경력 (년)</Label>
              <Input type="number" value={form.export_years} onChange={(e) => updateField('export_years', e.target.value)} placeholder="10" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">인증 by</Label>
              <Input value={form.verified_by} onChange={(e) => updateField('verified_by', e.target.value)} placeholder="SGS Group" className="h-10" />
            </div>
            <div className="space-y-1.5 flex items-end">
              <label className="flex items-center gap-2 text-xs cursor-pointer h-10">
                <input type="checkbox" checked={form.trade_assurance} onChange={(e) => updateBoolField('trade_assurance', e.target.checked)} className="w-4 h-4" />
                Trade Assurance
              </label>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">주요 수출국 (쉼표 구분)</Label>
              <Input value={form.main_markets} onChange={(e) => updateField('main_markets', e.target.value)} placeholder="North America, Europe" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">역량 (쉼표 구분)</Label>
              <Input value={form.capabilities} onChange={(e) => updateField('capabilities', e.target.value)} placeholder="Agile Supply Chain, Full Customization, OEM, ODM" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">카테고리 랭킹</Label>
              <Input value={form.category_ranking} onChange={(e) => updateField('category_ranking', e.target.value)} placeholder="Top #6 in Men's Clothing" className="h-10" />
            </div>

            <div className="col-span-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">
                Alibaba 4축 평가 (5점 만점)
              </p>
              <div className="grid grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">咨询 (Consultation)</Label>
                  <Input type="number" step="0.1" min={0} max={5} value={form.consultation_score} onChange={(e) => updateField('consultation_score', e.target.value)} placeholder="4.8" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">物流 (Logistics)</Label>
                  <Input type="number" step="0.1" min={0} max={5} value={form.logistics_score} onChange={(e) => updateField('logistics_score', e.target.value)} placeholder="4.8" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">售后 (After-sales)</Label>
                  <Input type="number" step="0.1" min={0} max={5} value={form.after_sales_score} onChange={(e) => updateField('after_sales_score', e.target.value)} placeholder="4.8" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">商品 (Product)</Label>
                  <Input type="number" step="0.1" min={0} max={5} value={form.product_score} onChange={(e) => updateField('product_score', e.target.value)} placeholder="4.8" className="h-8 text-xs" />
                </div>
              </div>
            </div>

            <div className="col-span-2 pt-2 border-t">
              <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">기존 플랫폼 점수 (선택)</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">플랫폼 종합점수</Label>
                  <Input type="number" step="0.1" value={form.platform_score} onChange={(e) => updateField('platform_score', e.target.value)} placeholder="4.8" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">재구매율 (%)</Label>
                  <Input type="number" step="0.1" value={form.repurchase_rate} onChange={(e) => updateField('repurchase_rate', e.target.value)} placeholder="35.5" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">플랫폼 연수 (년)</Label>
                  <Input type="number" value={form.years_on_platform} onChange={(e) => updateField('years_on_platform', e.target.value)} placeholder="5" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">FG 카테고리</Label>
                  <Input value={form.fg_category} onChange={(e) => updateField('fg_category', e.target.value)} placeholder="Women's Clothing" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">추천등급</Label>
                  <Input value={form.recommendation_grade} onChange={(e) => updateField('recommendation_grade', e.target.value)} placeholder="★★★" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">인증 (쉼표 구분)</Label>
                  <Input value={form.certifications} onChange={(e) => updateField('certifications', e.target.value)} placeholder="ISO9001, BSCI" className="h-10" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Contact</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">담당자</Label>
              <Input value={form.contact_name} onChange={(e) => updateField('contact_name', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">이메일</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => updateField('contact_email', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">전화번호</Label>
              <Input value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">WeChat</Label>
              <Input value={form.contact_wechat} onChange={(e) => updateField('contact_wechat', e.target.value)} className="h-10" />
            </div>
          </CardContent>
        </Card>

        {/* Bulk registration (moved to bottom) */}
        <BulkCrawl1688Panel onDone={() => { /* no-op; user navigates to /factories */ }} />
        <BulkFactoryUpload />

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !form.name} className="h-10 text-xs uppercase tracking-wider">
            {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            {hasExtractedData ? '검토 완료 · 등록' : 'Add Vendor'}
          </Button>
          <Link to="/">
            <Button variant="outline" className="h-10 text-xs uppercase tracking-wider">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AddFactory;
