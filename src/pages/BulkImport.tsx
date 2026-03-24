import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft, Upload, Download, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Progress } from '@/components/ui/progress';

interface ImportItem {
  url: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  name?: string;
  error?: string;
}

const detectPlatform = (url: string): string => {
  if (url.includes('alibaba.com')) return 'alibaba';
  if (url.includes('1688.com')) return '1688';
  return 'other';
};

const BulkImport = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ImportItem[]>([]);
  const [importing, setImporting] = useState(false);

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order');
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      
      // Skip header if it looks like one
      const startIdx = lines[0]?.toLowerCase().includes('url') ? 1 : 0;
      
      const urls = lines.slice(startIdx).map((line) => {
        // Handle CSV with multiple columns - take the first column that looks like a URL
        const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
        const urlPart = parts.find((p) => p.startsWith('http')) || parts[0];
        return urlPart;
      }).filter((u) => u.startsWith('http'));

      if (urls.length === 0) {
        toast({ title: 'URL을 찾을 수 없습니다', description: 'CSV 파일에 유효한 URL이 포함되어 있는지 확인해주세요', variant: 'destructive' });
        return;
      }

      setItems(urls.map((url) => ({ url, status: 'pending' })));
      toast({ title: `${urls.length}개 URL 로드 완료`, description: '"일괄 크롤링" 버튼을 눌러 시작하세요' });
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleBulkCrawl = async () => {
    if (!user || items.length === 0) return;
    setImporting(true);

    for (let i = 0; i < items.length; i++) {
      setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'processing' } : item));

      try {
        const { data, error } = await supabase.functions.invoke('scrape-factory', {
          body: { 
            url: items[i].url,
            scoring_criteria: criteria.length > 0 ? criteria.map(c => ({ id: c.id, name: c.name, description: c.description, max_score: c.max_score })) : undefined,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const d = data.data;
        const { data: factoryData, error: insertError } = await supabase.from('factories').insert({
          user_id: user.id,
          name: d.name || new URL(items[i].url).hostname,
          source_url: items[i].url,
          source_platform: detectPlatform(items[i].url),
          country: d.country || null,
          city: d.city || null,
          description: d.description || null,
          main_products: d.main_products ? (typeof d.main_products === 'string' ? d.main_products.split(',').map((s: string) => s.trim()) : d.main_products) : null,
          moq: d.moq || null,
          lead_time: d.lead_time || null,
          contact_name: d.contact_name || null,
          contact_email: d.contact_email || null,
          contact_phone: d.contact_phone || null,
          contact_wechat: d.contact_wechat || null,
        }).select().single();

        if (insertError) throw insertError;

        // Save AI scores
        if (d.scores && Array.isArray(d.scores) && factoryData?.id) {
          const scoreInserts = d.scores
            .filter((s: any) => s.criteria_id && typeof s.score === 'number')
            .map((s: any) => ({
              factory_id: factoryData.id,
              criteria_id: s.criteria_id,
              score: Math.min(s.score, 10),
              ai_original_score: Math.min(s.score, 10),
              notes: s.notes || null,
            }));
          if (scoreInserts.length > 0) {
            await supabase.from('factory_scores').insert(scoreInserts);
            await supabase.rpc('recalculate_factory_score', { p_factory_id: factoryData.id });
          }
        } else if (factoryData?.id) {
          // No crawl scores — trigger auto-scoring
          supabase.functions.invoke('auto-score-factory', { body: { factory_id: factoryData.id } });
        }

        setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'done', name: d.name || 'Unnamed' } : item));
      } catch (err: any) {
        setItems((prev) => prev.map((item, idx) => idx === i ? { ...item, status: 'error', error: err.message } : item));
      }
    }

    setImporting(false);
    const doneCount = items.filter((_, idx) => true).length; // will be recalculated from state
    toast({ title: '일괄 크롤링 완료', description: '대시보드에서 결과를 확인하세요' });
  };

  const downloadTemplate = () => {
    const csv = 'url\nhttps://www.alibaba.com/...\nhttps://www.1688.com/...';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'factory_urls_template.csv';
    link.click();
  };

  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const progress = items.length ? ((doneCount + errorCount) / items.length) * 100 : 0;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Bulk Import</h1>
      <p className="text-sm text-muted-foreground mb-8">CSV 파일로 여러 공장 URL을 한번에 크롤링하여 추가합니다</p>

      <div className="max-w-2xl space-y-6">
        {/* Upload Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">CSV Upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 text-xs uppercase tracking-wider flex-1"
                disabled={importing}
              >
                <Upload className="w-3.5 h-3.5 mr-2" />
                CSV 파일 선택
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={downloadTemplate}
                className="h-10 text-xs uppercase tracking-wider"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                템플릿
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              CSV 파일에 URL 열이 포함되어야 합니다. 한 줄에 하나의 URL을 넣어주세요.
            </p>
          </CardContent>
        </Card>

        {/* URL List */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">
                  URLs ({items.length}개)
                </CardTitle>
                {!importing && (
                  <Button
                    onClick={handleBulkCrawl}
                    size="sm"
                    className="h-8 text-xs uppercase tracking-wider"
                  >
                    일괄 크롤링 시작
                  </Button>
                )}
              </div>
              {importing && (
                <div className="mt-3 space-y-2">
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-muted-foreground">
                    {doneCount + errorCount} / {items.length} 완료 · 성공 {doneCount} · 실패 {errorCount}
                  </p>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-md bg-secondary/30 text-sm">
                  {item.status === 'pending' && <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {item.status === 'processing' && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />}
                  {item.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                  {item.status === 'error' && <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs">
                      {item.name && item.status === 'done' ? (
                        <span className="font-medium">{item.name}</span>
                      ) : (
                        item.url
                      )}
                    </p>
                    {item.error && <p className="text-xs text-destructive truncate">{item.error}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Done */}
        {!importing && doneCount > 0 && (
          <div className="flex gap-3">
            <Button onClick={() => navigate('/')} className="h-10 text-xs uppercase tracking-wider">
              대시보드로 이동
            </Button>
            <Button variant="outline" onClick={() => setItems([])} className="h-10 text-xs uppercase tracking-wider">
              초기화
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkImport;
