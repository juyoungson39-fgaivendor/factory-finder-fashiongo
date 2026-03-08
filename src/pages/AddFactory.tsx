import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

const detectPlatform = (url: string): string => {
  if (url.includes('alibaba.com')) return 'alibaba';
  if (url.includes('1688.com')) return '1688';
  return 'other';
};

const AddFactory = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [form, setForm] = useState({
    name: '', source_platform: '', country: '', city: '',
    contact_name: '', contact_email: '', contact_phone: '', contact_wechat: '',
    description: '', main_products: '', moq: '', lead_time: '',
  });

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value) setForm((prev) => ({ ...prev, source_platform: detectPlatform(value) }));
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
      toast({ title: '공장이 추가되었습니다' });
      navigate(`/factories/${data.id}`);
    } catch (err: any) {
      toast({ title: '추가 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back
      </Link>

      <h1 className="text-2xl font-bold tracking-tight mb-1">Add Vendor</h1>
      <p className="text-sm text-muted-foreground mb-8">Alibaba, 1688 URL을 입력하거나 수동으로 정보를 입력하세요</p>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        {/* URL */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Source URL</CardTitle>
          </CardHeader>
          <CardContent>
            <Input placeholder="https://www.alibaba.com/..." value={url} onChange={(e) => handleUrlChange(e.target.value)} className="h-10" />
            {form.source_platform && (
              <p className="text-xs text-muted-foreground mt-2">Platform detected: <span className="font-medium text-foreground uppercase">{form.source_platform}</span></p>
            )}
          </CardContent>
        </Card>

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
            Add Vendor
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
