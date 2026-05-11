import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

const CATEGORIES = ['Dress', 'Top', 'Pants', 'Set', 'Skirt', 'Shoes', 'Bag', 'Outerwear', 'Other'];
const STYLE_TAGS = ['Streetwear', 'Minimal', 'Y2K', 'Bohemian', 'Coastal', 'Quiet Luxury', 'Cottagecore', 'Athleisure', 'Old Money', 'Coquette'];

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editTarget: any | null;
  onSaved: () => void;
};

export default function TargetProductFormModal({ open, onOpenChange, editTarget, onSaved }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [trendKeywordsInput, setTrendKeywordsInput] = useState('');
  const [category, setCategory] = useState('');
  const [styleTagsSelected, setStyleTagsSelected] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [moqMax, setMoqMax] = useState('');
  const [refImagesInput, setRefImagesInput] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [saving, setSaving] = useState(false);

  // Stage 4 트렌드 키워드 자동완성 후보 (trend_analyses)
  const { data: suggestedKeywords = [] } = useQuery({
    queryKey: ['recent-trend-keywords-for-target'],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from('trend_analyses')
          .select('trend_keywords')
          .order('created_at', { ascending: false })
          .limit(50);
        const set = new Set<string>();
        (data || []).forEach((r: any) => (r.trend_keywords || []).forEach((k: string) => set.add(k)));
        return Array.from(set).slice(0, 60);
      } catch {
        return [];
      }
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    if (editTarget) {
      setName(editTarget.name || '');
      setTrendKeywordsInput((editTarget.trend_keywords || []).join(', '));
      setCategory(editTarget.category || '');
      setStyleTagsSelected(editTarget.style_tags || []);
      setPriceMin(editTarget.price_min_usd?.toString() || '');
      setPriceMax(editTarget.price_max_usd?.toString() || '');
      setMoqMax(editTarget.moq_max?.toString() || '');
      setRefImagesInput((editTarget.reference_image_urls || []).join('\n'));
      setValidUntil(editTarget.valid_until?.split('T')[0] || '');
    } else {
      setName('');
      setTrendKeywordsInput('');
      setCategory('');
      setStyleTagsSelected([]);
      setPriceMin('');
      setPriceMax('');
      setMoqMax('');
      setRefImagesInput('');
      const d = new Date();
      d.setDate(d.getDate() + 56);
      setValidUntil(d.toISOString().split('T')[0]);
    }
  }, [editTarget, open]);

  const toggleStyleTag = (tag: string) => {
    setStyleTagsSelected((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: '이름 필수', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payload: any = {
        name: name.trim(),
        trend_keywords: trendKeywordsInput.split(',').map((s) => s.trim()).filter(Boolean),
        category: category || null,
        style_tags: styleTagsSelected.length > 0 ? styleTagsSelected : null,
        price_min_usd: priceMin ? parseFloat(priceMin) : null,
        price_max_usd: priceMax ? parseFloat(priceMax) : null,
        moq_max: moqMax ? parseInt(moqMax) : null,
        reference_image_urls: refImagesInput.split('\n').map((s) => s.trim()).filter(Boolean),
        valid_until: validUntil ? new Date(validUntil).toISOString() : null,
        status: 'active',
      };
      if (editTarget) {
        const { error } = await supabase.from('target_products').update(payload).eq('id', editTarget.id);
        if (error) throw error;
      } else {
        payload.user_id = user?.id;
        payload.source = 'manual';
        const { error } = await supabase.from('target_products').insert(payload);
        if (error) throw error;
      }
      toast({ title: editTarget ? '✅ 수정됨' : '✅ 신규 타깃 추가됨' });
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editTarget ? '타깃 편집' : '신규 타깃 정의'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: Y2K Barrel Jeans 2026 봄여름" />
          </div>

          <div className="space-y-1.5">
            <Label>트렌드 키워드 (쉼표 구분)</Label>
            <Input
              value={trendKeywordsInput}
              onChange={(e) => setTrendKeywordsInput(e.target.value)}
              placeholder="barrel jeans, y2k, denim"
              list="trend-keyword-list"
            />
            <datalist id="trend-keyword-list">
              {suggestedKeywords.map((k: string) => <option key={k} value={k} />)}
            </datalist>
            {suggestedKeywords.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                💡 Stage 4 트렌드 키워드 {suggestedKeywords.length}개 자동완성 가능
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>카테고리</Label>
              <select
                className="w-full h-9 px-3 rounded-lg border border-input bg-background text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">(선택)</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>유효기한</Label>
              <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>스타일 태그</Label>
            <div className="flex flex-wrap gap-1.5">
              {STYLE_TAGS.map((tag) => (
                <Badge
                  key={tag}
                  variant={styleTagsSelected.includes(tag) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleStyleTag(tag)}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>가격 min ($)</Label>
              <Input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} placeholder="8" />
            </div>
            <div className="space-y-1.5">
              <Label>가격 max ($)</Label>
              <Input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} placeholder="25" />
            </div>
            <div className="space-y-1.5">
              <Label>MOQ 한도</Label>
              <Input type="number" value={moqMax} onChange={(e) => setMoqMax(e.target.value)} placeholder="50" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>참고 이미지 URL (줄바꿈)</Label>
            <Textarea
              rows={3}
              value={refImagesInput}
              onChange={(e) => setRefImagesInput(e.target.value)}
              placeholder="https://alibaba.com/... or Other Factory URL"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : editTarget ? '수정' : '추가'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
