import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles } from 'lucide-react';

export default function AlibabaQuickAddCard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    const isUrl = /^https?:\/\//i.test(v);
    setLoading(true);
    try {
      const body = isUrl
        ? { alibaba_url: v }
        : { supplier_id: v.toLowerCase().replace(/[^a-z0-9_-]/g, '') };
      const { data, error } = await supabase.functions.invoke('crawl-alibaba-supplier', { body });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.reason || 'crawl_failed');
      toast({
        title: `✅ ${data.name || data.supplier_id} 등록됨`,
        description: `평균 ${data.avg}/10 · 별점 ${data.parsed_summary?.review_score ?? '–'} · 응답 ${data.parsed_summary?.response_time_hours ?? '–'}h`,
      });
      navigate(`/factories/${data.factory_id}`);
    } catch (err: any) {
      toast({ title: '실패', description: String(err.message || err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-primary/30 bg-primary/[0.02]">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          Alibaba.com 공급사 자동 등록 (권장)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="laiteclothing 또는 https://laiteclothing.en.alibaba.com/..."
              className="h-10"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} className="h-10 whitespace-nowrap">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🚀'} 등록 + 크롤링
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Alibaba.com supplier_id 또는 회사 URL을 입력하면 별점·응답시간·정시납품·거래량·인증을 자동 수집합니다.
            (1688 URL은 아래 「Quick 1688」 카드 또는 북마클릿 사용)
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
