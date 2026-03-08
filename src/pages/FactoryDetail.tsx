import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ExternalLink, MapPin, Phone, Mail, MessageSquare,
  Camera, FileText, BarChart3, Trash2, Plus, Upload, Save
} from 'lucide-react';
import ScoreBadge from '@/components/ScoreBadge';
import StatusBadge from '@/components/StatusBadge';

const statusOptions = ['new', 'contacted', 'sampling', 'approved', 'rejected'];
const noteTypes = ['general', 'meeting', 'sample', 'negotiation', 'quality'];
const noteTypeLabels: Record<string, string> = {
  general: '일반', meeting: '미팅', sample: '샘플', negotiation: '협상', quality: '품질',
};
const photoTypes = ['product', 'factory', 'sample', 'defect'];
const photoTypeLabels: Record<string, string> = {
  product: '제품', factory: '공장', sample: '샘플', defect: '불량',
};

const FactoryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoType, setPhotoType] = useState('product');

  // Fetch factory
  const { data: factory, isLoading } = useQuery({
    queryKey: ['factory', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch notes
  const { data: notes = [] } = useQuery({
    queryKey: ['factory-notes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factory_notes')
        .select('*')
        .eq('factory_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch photos
  const { data: photos = [] } = useQuery({
    queryKey: ['factory-photos', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factory_photos')
        .select('*')
        .eq('factory_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch scoring criteria & scores
  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scoring_criteria')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['factory-scores', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('factory_scores')
        .select('*')
        .eq('factory_id', id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Update status
  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from('factories').update({ status }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory', id] });
      toast({ title: '상태가 업데이트되었습니다' });
    },
  });

  // Add note
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('factory_notes').insert({
        factory_id: id!,
        user_id: user!.id,
        content: noteContent,
        note_type: noteType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory-notes', id] });
      setNoteContent('');
      toast({ title: '메모가 추가되었습니다' });
    },
  });

  // Upload photo
  const uploadPhoto = async (file: File) => {
    if (!user || !id) return;
    const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('factory-photos').upload(filePath, file);
    if (uploadError) {
      toast({ title: '업로드 실패', description: uploadError.message, variant: 'destructive' });
      return;
    }
    const { error: dbError } = await supabase.from('factory_photos').insert({
      factory_id: id,
      user_id: user.id,
      storage_path: filePath,
      caption: photoCaption || null,
      photo_type: photoType,
    });
    if (dbError) {
      toast({ title: '저장 실패', description: dbError.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['factory-photos', id] });
    setPhotoCaption('');
    toast({ title: '사진이 업로드되었습니다' });
  };

  // Update score
  const updateScore = useMutation({
    mutationFn: async ({ criteriaId, score }: { criteriaId: string; score: number }) => {
      const { error } = await supabase.from('factory_scores').upsert(
        { factory_id: id!, criteria_id: criteriaId, score },
        { onConflict: 'factory_id,criteria_id' }
      );
      if (error) throw error;
      // Recalculate overall score
      await supabase.rpc('recalculate_factory_score', { p_factory_id: id! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory-scores', id] });
      queryClient.invalidateQueries({ queryKey: ['factory', id] });
    },
  });

  // Delete factory
  const deleteFactory = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('factories').delete().eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '공장이 삭제되었습니다' });
      navigate('/');
    },
  });

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('factory-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  if (isLoading) return <div className="text-center py-12 text-muted-foreground">로딩 중...</div>;
  if (!factory) return <div className="text-center py-12 text-muted-foreground">공장을 찾을 수 없습니다</div>;

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="w-4 h-4" />
        대시보드로 돌아가기
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <ScoreBadge score={factory.overall_score ?? 0} size="lg" />
          <div>
            <h1 className="text-3xl font-heading font-bold">{factory.name}</h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              {factory.source_platform && <Badge variant="secondary" className="capitalize">{factory.source_platform}</Badge>}
              {factory.country && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{factory.country}{factory.city && `, ${factory.city}`}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={factory.status ?? 'new'} onValueChange={(v) => updateStatus.mutate(v)}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {factory.source_url && (
            <a href={factory.source_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon"><ExternalLink className="w-4 h-4" /></Button>
            </a>
          )}
          <Button variant="destructive" size="icon" onClick={() => deleteFactory.mutate()}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {factory.main_products?.length ? (
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">주요 제품</p>
              <div className="flex flex-wrap gap-1">
                {factory.main_products.map((p, i) => (
                  <Badge key={i} variant="secondary">{p}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}
        {(factory.contact_name || factory.contact_email) && (
          <Card>
            <CardContent className="pt-4 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">연락처</p>
              {factory.contact_name && <p className="text-sm font-medium">{factory.contact_name}</p>}
              {factory.contact_email && (
                <p className="text-sm text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" />{factory.contact_email}</p>
              )}
              {factory.contact_phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{factory.contact_phone}</p>
              )}
              {factory.contact_wechat && (
                <p className="text-sm text-muted-foreground flex items-center gap-1"><MessageSquare className="w-3 h-3" />{factory.contact_wechat}</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">
            <FileText className="w-4 h-4 mr-1" />
            메모 ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="photos">
            <Camera className="w-4 h-4 mr-1" />
            사진 ({photos.length})
          </TabsTrigger>
          <TabsTrigger value="scoring">
            <BarChart3 className="w-4 h-4 mr-1" />
            스코어링
          </TabsTrigger>
        </TabsList>

        {/* Notes Tab */}
        <TabsContent value="notes" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3 mb-3">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {noteTypes.map((t) => (
                      <SelectItem key={t} value={t}>{noteTypeLabels[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                placeholder="미팅 내용, 샘플 결과, 협상 내용 등을 기록하세요..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={3}
              />
              <Button className="mt-3" onClick={() => addNote.mutate()} disabled={!noteContent.trim()}>
                <Plus className="w-4 h-4 mr-2" />
                메모 추가
              </Button>
            </CardContent>
          </Card>
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">{noteTypeLabels[note.note_type ?? 'general']}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(note.created_at).toLocaleString('ko-KR')}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Photos Tab */}
        <TabsContent value="photos" className="mt-4 space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <Label>캡션</Label>
                  <Input
                    placeholder="사진 설명..."
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                  />
                </div>
                <Select value={photoType} onValueChange={setPhotoType}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {photoTypes.map((t) => (
                      <SelectItem key={t} value={t}>{photoTypeLabels[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadPhoto(file);
                  }}
                />
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  업로드
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photo) => (
              <Card key={photo.id} className="overflow-hidden">
                <img
                  src={getPhotoUrl(photo.storage_path)}
                  alt={photo.caption ?? ''}
                  className="w-full h-48 object-cover"
                />
                <CardContent className="pt-3">
                  <Badge variant="outline" className="mb-1">{photoTypeLabels[photo.photo_type ?? 'product']}</Badge>
                  {photo.caption && <p className="text-sm text-muted-foreground">{photo.caption}</p>}
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(photo.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Scoring Tab */}
        <TabsContent value="scoring" className="mt-4 space-y-4">
          {criteria.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <BarChart3 className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-muted-foreground mb-2">스코어링 기준이 설정되지 않았습니다</p>
                <Link to="/scoring">
                  <Button variant="outline">스코어링 기준 설정하기</Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            criteria.map((c) => {
              const currentScore = scores.find((s) => s.criteria_id === c.id);
              return (
                <Card key={c.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-medium">{c.name}</p>
                        {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-heading font-bold">
                          {currentScore?.score ?? 0}
                        </span>
                        <span className="text-sm text-muted-foreground">/{c.max_score}</span>
                        <span className="text-xs text-muted-foreground ml-2">(가중치: {c.weight})</span>
                      </div>
                    </div>
                    <Slider
                      value={[Number(currentScore?.score ?? 0)]}
                      max={c.max_score ?? 10}
                      step={0.5}
                      onValueCommit={(v) => updateScore.mutate({ criteriaId: c.id, score: v[0] })}
                    />
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FactoryDetail;
