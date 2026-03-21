import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Search, Upload, ImageIcon, X, Bot, CheckCircle2, XCircle, Globe, Eye } from 'lucide-react';
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
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotBase64, setScreenshotBase64] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([]);
  const [dataSource, setDataSource] = useState<string | null>(null);
  const [capturedScreenshots, setCapturedScreenshots] = useState<ScreenshotThumb[]>([]);
  const [detectedPlatform, setDetectedPlatform] = useState<string>('default');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: '', source_platform: '', country: '', city: '',
    contact_name: '', contact_email: '', contact_phone: '', contact_wechat: '',
    description: '', main_products: '', moq: '', lead_time: '',
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
    const file = e.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    setScreenshotBase64(base64);
    setScreenshotPreview(base64);
  };

  const clearScreenshot = () => {
    setScreenshotBase64(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCrawl = async (useScreenshot = false) => {
    if (!url && !screenshotBase64) return;
    const shouldUseScreenshot = useScreenshot || !!screenshotBase64;

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

      if (shouldUseScreenshot && screenshotBase64) {
        body.screenshot_base64 = screenshotBase64;
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
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('factories')
        .insert({
          user_id: user.id, name: form.name, source_url: url || null,
          source_platform: form.source_platform || null, country: form.country || null,
          city: form.city || null, contact_name: form.contact_name || null,
          contact_email: form.contact_email || null, contact_phone: form.contact_phone || null,
          contact_wechat: form.contact_wechat || null, description: form.description || null,
          main_products: form.main_products ? form.main_products.split(',').map((s) => s.trim()) : null,
          moq: form.moq || null, lead_time: form.lead_time || null,
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
            notes: s.notes || null,
          }));
        if (scoreInserts.length > 0) {
          await supabase.from('factory_scores').insert(scoreInserts);
          await supabase.rpc('recalculate_factory_score', { p_factory_id: data.id });
        }
      }

      toast({ title: '공장이 추가되었습니다' });
      navigate(`/factories/${data.id}`);
    } catch (err: any) {
      toast({ title: '추가 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const hasExtractedData = form.name.length > 0;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Add Vendor</h1>
      <p className="text-sm text-muted-foreground mb-8">URL을 입력하면 AI Agent가 자동으로 정보를 수집합니다</p>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* URL Input */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" />
              AI Agent 크롤링
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input placeholder="https://www.1688.com/... 또는 alibaba.com/..." value={url} onChange={(e) => handleUrlChange(e.target.value)} className="h-10" />
              <Button type="button" onClick={() => handleCrawl(false)} disabled={!url || crawling} variant="outline" className="h-10 shrink-0 text-xs uppercase tracking-wider">
                {crawling && !screenshotBase64 ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Bot className="w-3.5 h-3.5 mr-2" />}
                {crawling ? 'Agent 실행 중...' : 'Agent 실행'}
              </Button>
            </div>

            {form.source_platform && (
              <p className="text-xs text-muted-foreground">Platform: <span className="font-medium text-foreground uppercase">{form.source_platform}</span></p>
            )}

            {/* Agent Steps Progress */}
            {agentSteps.length > 0 && (
              <div className="rounded-lg border bg-card p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Bot className="w-3 h-3" />
                  Agent 진행 상황
                </p>
                {agentSteps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {s.status === 'running' && <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />}
                    {s.status === 'success' && <CheckCircle2 className="w-3 h-3 text-primary shrink-0" />}
                    {(s.status === 'blocked' || s.status === 'failed') && <XCircle className="w-3 h-3 text-destructive shrink-0" />}
                    <span className={s.status === 'success' ? 'text-foreground' : s.status === 'running' ? 'text-primary' : 'text-muted-foreground'}>
                      {(STEP_LABELS[detectedPlatform]?.[s.step] || STEP_LABELS['default'][s.step] || s.step)}
                    </span>
                    {s.detail && <span className="text-muted-foreground ml-1">· {s.detail}</span>}
                  </div>
                ))}

                {/* Screenshot thumbnails */}
                {capturedScreenshots.length > 0 && (
                  <div className="mt-2 pt-2 border-t space-y-1.5">
                    <p className="text-xs text-muted-foreground font-medium">📸 캡처된 페이지</p>
                    <div className="grid grid-cols-3 gap-2">
                      {capturedScreenshots.map((ss, i) => (
                        <div key={i} className="relative group">
                          <img
                            src={ss.url}
                            alt={ss.label}
                            className="w-full h-20 object-cover object-top rounded border bg-muted"
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded-b">
                            <p className="text-[10px] font-medium text-foreground truncate">{ss.label}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dataSource && (
                  <div className="flex items-center gap-1.5 text-xs text-primary mt-1 pt-1 border-t">
                    {dataSource === 'search' ? <Globe className="w-3 h-3" /> : dataSource === 'screenshot' ? <ImageIcon className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    데이터 소스: {dataSource === 'search' ? '웹 검색 결과' : dataSource === 'screenshot' ? '스크린샷 분석' : '직접 크롤링'}
                    {detectedPlatform !== 'default' && <span className="ml-1 uppercase font-medium">({detectedPlatform})</span>}
                  </div>
                )}
              </div>
            )}

            {/* CAPTCHA blocked */}
            {captchaBlocked && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">⚠️ 모든 자동 수집 실패</p>
                <p className="text-xs text-muted-foreground">
                  직접 크롤링과 웹 검색 모두 차단되었습니다. 해당 페이지의 <strong>스크린샷</strong>을 업로드하면 AI가 정보를 추출합니다.
                </p>
              </div>
            )}

            {/* Screenshot upload */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5" />
                페이지 스크린샷 {captchaBlocked ? '(필요)' : '(선택)'}
              </Label>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleScreenshotUpload} className="hidden" />
              {screenshotPreview ? (
                <div className="relative">
                  <img src={screenshotPreview} alt="Screenshot preview" className="w-full max-h-48 object-cover rounded-md border" />
                  <Button type="button" variant="destructive" size="icon" className="absolute top-2 right-2 h-6 w-6" onClick={clearScreenshot}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="w-full h-16 border-dashed text-xs text-muted-foreground" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  스크린샷 업로드
                </Button>
              )}
              {screenshotBase64 && (
                <Button type="button" onClick={() => handleCrawl(true)} disabled={crawling} className="w-full h-10 text-xs uppercase tracking-wider">
                  {crawling ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5 mr-2" />}
                  {crawling ? 'AI 분석 중...' : '스크린샷으로 자동입력'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

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
              <Input value={form.name} onChange={(e) => updateField('name', e.target.value)} required className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">국가</Label>
              <Input value={form.country} onChange={(e) => updateField('country', e.target.value)} placeholder="China" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">도시</Label>
              <Input value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="Guangzhou" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">주요 제품 (쉼표 구분)</Label>
              <Input value={form.main_products} onChange={(e) => updateField('main_products', e.target.value)} placeholder="원피스, 블라우스, 니트" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">MOQ</Label>
              <Input value={form.moq} onChange={(e) => updateField('moq', e.target.value)} placeholder="100pcs" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">리드타임</Label>
              <Input value={form.lead_time} onChange={(e) => updateField('lead_time', e.target.value)} placeholder="15-20일" className="h-10" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">설명</Label>
              <Textarea value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
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
