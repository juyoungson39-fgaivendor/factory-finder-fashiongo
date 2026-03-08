import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Link2, Plus, Loader2, ArrowLeft } from 'lucide-react';
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
    name: '',
    source_platform: '',
    country: '',
    city: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    contact_wechat: '',
    description: '',
    main_products: '',
    moq: '',
    lead_time: '',
  });

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value) {
      const platform = detectPlatform(value);
      setForm((prev) => ({ ...prev, source_platform: platform }));
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
          user_id: user.id,
          name: form.name,
          source_url: url || null,
          source_platform: form.source_platform || null,
          country: form.country || null,
          city: form.city || null,
          contact_name: form.contact_name || null,
          contact_email: form.contact_email || null,
          contact_phone: form.contact_phone || null,
          contact_wechat: form.contact_wechat || null,
          description: form.description || null,
          main_products: form.main_products ? form.main_products.split(',').map((s) => s.trim()) : null,
          moq: form.moq || null,
          lead_time: form.lead_time || null,
        })
        .select()
        .single();

      if (error) throw error;
      toast({ title: '공장이 추가되었습니다' });
      navigate(`/factories/${data.id}`);
    } catch (err: any) {
      toast({ title: '추가 실패', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        대시보드로 돌아가기
      </Link>

      <h1 className="text-3xl font-heading font-bold mb-2">공장 추가</h1>
      <p className="text-muted-foreground mb-8">Alibaba, 1688 URL을 입력하거나 수동으로 정보를 입력하세요</p>

      <form onSubmit={handleSubmit}>
        {/* URL Input */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              소스 URL
            </CardTitle>
            <CardDescription>Alibaba.com 또는 1688.com 공장/상품 URL을 입력하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="https://www.alibaba.com/..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
            {form.source_platform && (
              <p className="text-sm text-accent mt-2">플랫폼 감지: {form.source_platform}</p>
            )}
          </CardContent>
        </Card>

        {/* Basic Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label htmlFor="name">공장 이름 *</Label>
              <Input id="name" value={form.name} onChange={(e) => updateField('name', e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="country">국가</Label>
              <Input id="country" value={form.country} onChange={(e) => updateField('country', e.target.value)} placeholder="China" />
            </div>
            <div>
              <Label htmlFor="city">도시</Label>
              <Input id="city" value={form.city} onChange={(e) => updateField('city', e.target.value)} placeholder="Guangzhou" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="main_products">주요 제품 (쉼표로 구분)</Label>
              <Input id="main_products" value={form.main_products} onChange={(e) => updateField('main_products', e.target.value)} placeholder="원피스, 블라우스, 니트" />
            </div>
            <div>
              <Label htmlFor="moq">MOQ</Label>
              <Input id="moq" value={form.moq} onChange={(e) => updateField('moq', e.target.value)} placeholder="100pcs" />
            </div>
            <div>
              <Label htmlFor="lead_time">리드타임</Label>
              <Input id="lead_time" value={form.lead_time} onChange={(e) => updateField('lead_time', e.target.value)} placeholder="15-20일" />
            </div>
            <div className="col-span-2">
              <Label htmlFor="description">설명</Label>
              <Textarea id="description" value={form.description} onChange={(e) => updateField('description', e.target.value)} rows={3} />
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>연락처</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="contact_name">담당자 이름</Label>
              <Input id="contact_name" value={form.contact_name} onChange={(e) => updateField('contact_name', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="contact_email">이메일</Label>
              <Input id="contact_email" type="email" value={form.contact_email} onChange={(e) => updateField('contact_email', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="contact_phone">전화번호</Label>
              <Input id="contact_phone" value={form.contact_phone} onChange={(e) => updateField('contact_phone', e.target.value)} />
            </div>
            <div>
              <Label htmlFor="contact_wechat">WeChat</Label>
              <Input id="contact_wechat" value={form.contact_wechat} onChange={(e) => updateField('contact_wechat', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" disabled={loading || !form.name}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
            공장 추가
          </Button>
          <Link to="/">
            <Button variant="outline">취소</Button>
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AddFactory;
