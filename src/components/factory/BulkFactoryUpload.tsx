import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import {
  Loader2, Plus, Trash2, Play, CheckCircle2, XCircle, Clock,
  Upload, ListPlus, Bot, FileSpreadsheet, Download,
} from 'lucide-react';

interface BulkItem {
  id: string;
  name: string;
  url: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  factoryId?: string;
}

const detectPlatform = (url: string): string => {
  if (url.includes('alibaba.com')) return 'alibaba';
  if (url.includes('1688.com')) return '1688';
  return 'other';
};

export default function BulkFactoryUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<BulkItem[]>([
    { id: crypto.randomUUID(), name: '', url: '', status: 'pending' },
  ]);
  const [processing, setProcessing] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const abortRef = useRef(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast.error('CSV에 데이터가 없습니다'); return; }

      // Parse headers
      const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());

      // Auto-detect name column
      const nameIdx = headers.findIndex(h =>
        ['name', 'factory_name', 'factory', '공장명', '공장이름', '이름', 'company', 'supplier'].includes(h)
      );
      // Auto-detect URL column
      const urlIdx = headers.findIndex(h =>
        ['url', 'source_url', 'link', '링크', 'website', 'homepage', 'source'].includes(h)
      );

      if (nameIdx === -1 && urlIdx === -1) {
        toast.error("CSV에서 공장명/URL 컬럼을 찾을 수 없습니다. 컬럼명: name, url, factory_name 등을 사용하세요.");
        return;
      }

      const newItems: BulkItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Simple CSV parse respecting quotes
        const row: string[] = [];
        let cur = '', inQ = false;
        for (const ch of lines[i]) {
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { row.push(cur.trim()); cur = ''; }
          else { cur += ch; }
        }
        row.push(cur.trim());

        const name = nameIdx >= 0 ? (row[nameIdx] || '') : '';
        const url = urlIdx >= 0 ? (row[urlIdx] || '') : '';
        if (!name && !url) continue;
        newItems.push({ id: crypto.randomUUID(), name, url, status: 'pending' });
      }

      if (newItems.length === 0) { toast.error('유효한 행이 없습니다'); return; }
      setItems(prev => [...prev.filter(i => i.name || i.url), ...newItems]);
      toast.success(`CSV에서 ${newItems.length}개 항목 추가됨 (이름컬럼: ${nameIdx >= 0 ? headers[nameIdx] : '없음'}, URL컬럼: ${urlIdx >= 0 ? headers[urlIdx] : '없음'})`);
    };
    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  };

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const addRow = () => {
    setItems(prev => [...prev, { id: crypto.randomUUID(), name: '', url: '', status: 'pending' }]);
  };

  const removeRow = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const updateRow = (id: string, field: 'name' | 'url', value: string) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const parsePasteText = () => {
    const lines = pasteText.trim().split('\n').filter(l => l.trim());
    const newItems: BulkItem[] = lines.map(line => {
      const parts = line.split(/[\t,|]/).map(s => s.trim());
      const urlPart = parts.find(p => p.startsWith('http'));
      const namePart = parts.find(p => p && !p.startsWith('http')) || '';
      return {
        id: crypto.randomUUID(),
        name: namePart,
        url: urlPart || '',
        status: 'pending' as const,
      };
    }).filter(item => item.name || item.url);

    if (newItems.length === 0) {
      toast.error('파싱할 데이터가 없습니다');
      return;
    }

    setItems(prev => [...prev.filter(i => i.name || i.url), ...newItems]);
    setPasteText('');
    setPasteMode(false);
    toast.success(`${newItems.length}개 항목이 추가되었습니다`);
  };

  const validItems = items.filter(i => i.name.trim() || i.url.trim());
  const completedCount = items.filter(i => i.status === 'success' || i.status === 'error').length;
  const successCount = items.filter(i => i.status === 'success').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const progressPct = validItems.length > 0 ? Math.round((completedCount / validItems.length) * 100) : 0;

  const handleStart = useCallback(async () => {
    if (!user) return;
    const toProcess = items.filter(i => (i.name.trim() || i.url.trim()) && i.status !== 'success');
    if (toProcess.length === 0) {
      toast.error('처리할 항목이 없습니다');
      return;
    }

    setProcessing(true);
    abortRef.current = false;

    // Reset non-success items
    setItems(prev => prev.map(item =>
      item.status !== 'success' ? { ...item, status: 'pending' as const, message: undefined } : item
    ));

    for (const item of toProcess) {
      if (abortRef.current) break;

      setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'running' } : i));

      try {
        let extractedData: any = null;

        // If URL exists, run scrape-factory
        if (item.url.trim()) {
          const body: any = {
            url: item.url.trim(),
            agent_mode: true,
            scoring_criteria: criteria.length > 0
              ? criteria.map(c => ({ id: c.id, name: c.name, description: c.description, max_score: c.max_score }))
              : undefined,
          };

          const { data, error } = await supabase.functions.invoke('scrape-factory', { body });
          if (error) throw error;
          if (data?.error && data.error !== 'CAPTCHA_BLOCKED') throw new Error(data.error);
          extractedData = data?.data || {};
        }

        const factoryName = extractedData?.name || item.name.trim() || 'Unnamed Factory';
        const platform = item.url ? detectPlatform(item.url) : null;

        const { data: inserted, error: insertErr } = await supabase
          .from('factories')
          .insert({
            user_id: user.id,
            shop_id: deriveShopId(item.url),
            name: factoryName,
            source_url: item.url.trim() || null,
            source_platform: platform,
            country: extractedData?.country || null,
            city: extractedData?.city || null,
            description: extractedData?.description || null,
            main_products: extractedData?.main_products
              ? (Array.isArray(extractedData.main_products) ? extractedData.main_products : extractedData.main_products.split(',').map((s: string) => s.trim()))
              : null,
            moq: extractedData?.moq || null,
            lead_time: extractedData?.lead_time || null,
            contact_name: extractedData?.contact_name || null,
            contact_email: extractedData?.contact_email || null,
            contact_phone: extractedData?.contact_phone || null,
            contact_wechat: extractedData?.contact_wechat || null,
            platform_score: extractedData?.platform_score ?? null,
            repurchase_rate: extractedData?.repurchase_rate ?? null,
            years_on_platform: extractedData?.years_on_platform ?? null,
            certifications: extractedData?.certifications
              ? (Array.isArray(extractedData.certifications) ? extractedData.certifications : extractedData.certifications.split(',').map((s: string) => s.trim()))
              : null,
            fg_category: extractedData?.fg_category || null,
            recommendation_grade: extractedData?.recommendation_grade || null,
            platform_score_detail: extractedData?.platform_score_detail || null,
          })
          .select()
          .single();

        if (insertErr) throw insertErr;

        // Auto-score if crawl returned scores
        if (extractedData?.scores?.length && inserted?.id) {
          const scoreInserts = extractedData.scores
            .filter((s: any) => s.criteria_id && typeof s.score === 'number')
            .map((s: any) => ({
              factory_id: inserted.id,
              criteria_id: s.criteria_id,
              score: Math.min(s.score, 10),
              ai_original_score: Math.min(s.score, 10),
              notes: s.notes || null,
            }));
          if (scoreInserts.length > 0) {
            await supabase.from('factory_scores').insert(scoreInserts);
            await supabase.rpc('recalculate_factory_score', { p_factory_id: inserted.id });
          }
        } else if (inserted?.id) {
          // Fire auto-score in background
          supabase.functions.invoke('auto-score-factory', { body: { factory_id: inserted.id } });
        }

        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'success', message: factoryName, factoryId: inserted?.id } : i
        ));
      } catch (err: any) {
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, status: 'error', message: err.message } : i
        ));
      }

      // Small delay between items
      if (!abortRef.current) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setProcessing(false);
    toast.success('대량 등록 완료');
  }, [items, user, criteria]);

  const handleStop = () => {
    abortRef.current = true;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          <ListPlus className="w-3.5 h-3.5" />
          대량 등록 (이름 + URL → 자동 추출)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input rows */}
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-5 text-right shrink-0">{idx + 1}</span>
              <Input
                placeholder="공장 이름"
                value={item.name}
                onChange={e => updateRow(item.id, 'name', e.target.value)}
                disabled={processing}
                className="h-8 text-xs flex-[2]"
              />
              <Input
                placeholder="URL (1688/Alibaba/기타)"
                value={item.url}
                onChange={e => updateRow(item.id, 'url', e.target.value)}
                disabled={processing}
                className="h-8 text-xs flex-[3]"
              />
              <div className="w-6 shrink-0 flex items-center justify-center">
                {item.status === 'running' && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />}
                {item.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                {item.status === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive" />}
                {item.status === 'pending' && <Clock className="w-3.5 h-3.5 text-muted-foreground/40" />}
              </div>
              {!processing && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => removeRow(item.id)}
                  disabled={items.length <= 1}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Status messages for error/success */}
        {items.some(i => i.message) && (
          <ScrollArea className="max-h-32 border rounded-md p-2">
            {items.filter(i => i.message).map(i => (
              <div key={i.id} className={`text-[11px] py-0.5 ${i.status === 'error' ? 'text-destructive' : 'text-emerald-600'}`}>
                {i.status === 'success' ? '✅' : '❌'} {i.name || i.url} — {i.message}
              </div>
            ))}
          </ScrollArea>
        )}

        {/* Progress */}
        {processing && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{completedCount} / {validItems.length}</span>
              <span>{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-1.5" />
            <div className="flex gap-3 text-xs">
              <span>✅ {successCount}</span>
              <span>❌ {errorCount}</span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!processing ? (
            <>
              <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={addRow}>
                <Plus className="w-3 h-3 mr-1" /> 행 추가
              </Button>
              <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => setPasteMode(!pasteMode)}>
                <Upload className="w-3 h-3 mr-1" /> 붙여넣기
              </Button>
              <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
              <Button type="button" variant="outline" size="sm" className="text-xs h-8" onClick={() => csvInputRef.current?.click()}>
                <FileSpreadsheet className="w-3 h-3 mr-1" /> CSV 업로드
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-8 text-muted-foreground" onClick={() => {
                const csv = '\uFEFFname,url\n샘플공장A,https://shop1234.1688.com\n샘플공장B,https://sample-factory.en.alibaba.com\n이름만등록,';
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'factory_bulk_template.csv'; a.click(); URL.revokeObjectURL(a.href);
              }}>
                <Download className="w-3 h-3 mr-1" /> 템플릿
              </Button>
              <div className="flex-1" />
              <Button
                type="button"
                size="sm"
                className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={handleStart}
                disabled={validItems.length === 0}
              >
                <Bot className="w-3 h-3 mr-1" /> {validItems.length}개 일괄 등록 시작
              </Button>
            </>
          ) : (
            <Button type="button" variant="destructive" size="sm" className="text-xs h-8" onClick={handleStop}>
              중지
            </Button>
          )}
        </div>

        {/* Paste mode */}
        {pasteMode && !processing && (
          <div className="space-y-2 border rounded-md p-3 bg-muted/30">
            <Label className="text-xs text-muted-foreground">
              공장명과 URL을 한 줄씩 입력 (탭/쉼표/파이프로 구분)
            </Label>
            <Textarea
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={5}
              placeholder={`광저우패션, https://shop1234.1688.com\n심천의류, https://shenzhen-garment.en.alibaba.com\nhttps://another-factory.1688.com`}
              className="text-xs font-mono"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" className="text-xs h-7" onClick={parsePasteText}>
                추가
              </Button>
              <Button type="button" variant="ghost" size="sm" className="text-xs h-7" onClick={() => { setPasteMode(false); setPasteText(''); }}>
                취소
              </Button>
            </div>
          </div>
        )}

        {/* Done summary */}
        {!processing && successCount > 0 && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/50 p-3">
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              ✅ {successCount}개 공장이 등록되었습니다. AI 스코어링이 자동 실행됩니다.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
              onClick={() => navigate('/factories')}
            >
              공장 목록 보기
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
