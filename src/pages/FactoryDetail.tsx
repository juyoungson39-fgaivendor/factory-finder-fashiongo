import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, ExternalLink, MapPin, Phone, Mail, MessageSquare,
  Trash2, Plus, Upload, Star, Calendar, RotateCcw, ShieldCheck,
  AlertTriangle, CheckCircle2, BookOpen
} from 'lucide-react';

const statusOptions = ['new', 'contacted', 'sampling', 'approved', 'rejected'];
const noteTypes = ['general', 'meeting', 'sample', 'negotiation', 'quality'];
const deleteReasonPresets = [
  '품질 기준 미달',
  'MOQ/납기 조건 부적합',
  '커뮤니케이션 불가',
  'FashionGo 부적합 (사이즈/스타일)',
  '중복 등록',
];
const noteTypeLabels: Record<string, string> = {
  general: '일반', meeting: '미팅', sample: '샘플', negotiation: '협상', quality: '품질',
};
const photoTypes = ['product', 'factory', 'sample', 'defect'];
const photoTypeLabels: Record<string, string> = {
  product: '제품', factory: '공장', sample: '샘플', defect: '불량',
};

const scoreLabels: Record<string, string> = {
  consultation: '구매상담',
  logistics: '물류시효',
  dispute: '분쟁해결',
  quality: '품질체험',
  exchange: '교환체험',
};

const getScoreColor = (val: number) => {
  if (val >= 4.5) return 'text-emerald-600 dark:text-emerald-400';
  if (val >= 4.0) return 'text-blue-600 dark:text-blue-400';
  if (val >= 3.5) return 'text-foreground';
  return 'text-red-600 dark:text-red-400';
};

const getScoreBg = (val: number) => {
  if (val >= 4.5) return 'bg-emerald-100 dark:bg-emerald-900/30';
  if (val >= 4.0) return 'bg-blue-100 dark:bg-blue-900/30';
  if (val >= 3.5) return 'bg-muted';
  return 'bg-red-100 dark:bg-red-900/30';
};

const getBarColor = (val: number) => {
  if (val >= 4.5) return 'hsl(152, 60%, 45%)';
  if (val >= 4.0) return 'hsl(217, 60%, 55%)';
  if (val >= 3.5) return 'hsl(220, 10%, 60%)';
  return 'hsl(0, 60%, 55%)';
};

const FactoryDetail = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const isDev = import.meta.env.DEV;
  const isAdminOrDev = isAdmin || isDev;
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState('general');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoType, setPhotoType] = useState('product');
  const [correctionReasons, setCorrectionReasons] = useState<Record<string, string>>({});
  const [deleteReason, setDeleteReason] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { data: factory, isLoading } = useQuery({
    queryKey: ['factory', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factories').select('*').eq('id', id!).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['factory-notes', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factory_notes').select('*').eq('factory_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: photos = [] } = useQuery({
    queryKey: ['factory-photos', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factory_photos').select('*').eq('factory_id', id!).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: criteria = [] } = useQuery({
    queryKey: ['scoring-criteria', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from('scoring_criteria').select('*').order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: scores = [] } = useQuery({
    queryKey: ['factory-scores', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('factory_scores').select('*').eq('factory_id', id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase.from('factories').update({ status }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory', id] });
      toast({ title: '상태 업데이트 완료' });
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('factory_notes').insert({
        factory_id: id!, user_id: user!.id, content: noteContent, note_type: noteType,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory-notes', id] });
      setNoteContent('');
      toast({ title: '메모 추가 완료' });
    },
  });

  const uploadPhoto = async (file: File) => {
    if (!user || !id) return;
    const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from('factory-photos').upload(filePath, file);
    if (uploadError) { toast({ title: '업로드 실패', variant: 'destructive' }); return; }
    await supabase.from('factory_photos').insert({
      factory_id: id, user_id: user.id, storage_path: filePath,
      caption: photoCaption || null, photo_type: photoType,
    });
    queryClient.invalidateQueries({ queryKey: ['factory-photos', id] });
    setPhotoCaption('');
    toast({ title: '사진 업로드 완료' });
  };

  const updateScore = useMutation({
    mutationFn: async ({ criteriaId, score, correctionReason }: { criteriaId: string; score: number; correctionReason?: string }) => {
      // 1. Fetch existing record
      const { data: existing } = await supabase
        .from('factory_scores')
        .select('score, ai_original_score')
        .eq('factory_id', id!)
        .eq('criteria_id', criteriaId)
        .maybeSingle();

      // 2. Preserve ai_original_score (first time only)
      const aiOriginal = existing?.ai_original_score ?? existing?.score ?? score;

      // 3. Set correction_reason only if score differs from ai_original
      const reason = Number(aiOriginal) !== score ? (correctionReason || null) : null;

      const { error } = await supabase.from('factory_scores').upsert(
        {
          factory_id: id!,
          criteria_id: criteriaId,
          score,
          ai_original_score: aiOriginal,
          correction_reason: reason,
        },
        { onConflict: 'factory_id,criteria_id' }
      );
      if (error) throw error;

      // 5. Recalculate overall
      await supabase.rpc('recalculate_factory_score', { p_factory_id: id! });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory-scores', id] });
      queryClient.invalidateQueries({ queryKey: ['factory', id] });
    },
  });

  const confirmAIScore = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('factories').update({ score_confirmed: true }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factory', id] });
      toast({ title: 'AI 점수 확인 완료' });
    },
  });

  const collectTrainingData = useMutation({
    mutationFn: async ({ criteriaId, criteriaKey, aiScore, correctedScore, reason }: {
      criteriaId: string; criteriaKey: string; aiScore: number; correctedScore: number; reason: string;
    }) => {
      const { error } = await supabase.from('scoring_corrections').insert({
        vendor_id: id!,
        criteria_key: criteriaKey,
        ai_score: Math.round(aiScore),
        corrected_score: Math.round(correctedScore),
        diff: Math.round(correctedScore - aiScore),
        reason,
        collected_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '학습 데이터 수집 완료' });
    },
  });

  const deleteFactory = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.from('factories').update({
        deleted_at: new Date().toISOString(),
        deleted_reason: reason,
      }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: '삭제(소프트) 완료' });
      navigate('/');
    },
  });

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('factory-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  if (isLoading) return <div className="text-center py-16 text-sm text-muted-foreground">Loading...</div>;
  if (!factory) return <div className="text-center py-16 text-sm text-muted-foreground">Vendor not found</div>;

  const detail = factory.platform_score_detail as Record<string, number> | null;
  const barData = detail ? Object.entries(scoreLabels).map(([key, label]) => ({
    name: label,
    value: detail[key] ?? 0,
    key,
  })).filter(d => d.value > 0) : [];

  const radarData = detail ? Object.entries(scoreLabels).map(([key, label]) => ({
    name: label,
    value: detail[key] ?? 0,
    fullMark: 5,
  })).filter(d => d.value > 0) : [];

  return (
    <div>
      <Link to="/factories" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-6 uppercase tracking-wider">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to List
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-5">
          <ScoreBadge score={factory.overall_score ?? 0} size="lg" />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold tracking-tight">{factory.name}</h1>
              <StatusBadge status={factory.status ?? 'new'} />
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {factory.source_platform && (
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">{factory.source_platform}</span>
              )}
              {factory.country && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{factory.country}{factory.city && `, ${factory.city}`}
                </span>
              )}
              {factory.fg_category && (
                <Badge className="text-[10px] font-semibold">{factory.fg_category}</Badge>
              )}
              {factory.recommendation_grade && (
                <span className="text-sm font-semibold text-primary">{factory.recommendation_grade}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={factory.status ?? 'new'} onValueChange={(v) => updateStatus.mutate(v)}>
            <SelectTrigger className="w-32 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {statusOptions.map((s) => (
                <SelectItem key={s} value={s} className="text-xs uppercase">{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {factory.source_url && (
            <a href={factory.source_url} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="icon" className="h-9 w-9"><ExternalLink className="w-3.5 h-3.5" /></Button>
            </a>
          )}
          <Button variant="outline" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {factory.platform_score != null && (
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Star className="w-5 h-5 mx-auto mb-1 text-amber-500" />
              <p className="text-2xl font-bold">{factory.platform_score}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">1688 종합점수</p>
            </CardContent>
          </Card>
        )}
        {factory.repurchase_rate != null && (
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <RotateCcw className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <p className="text-2xl font-bold">{factory.repurchase_rate}%</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">재구매율</p>
            </CardContent>
          </Card>
        )}
        {factory.years_on_platform != null && (
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <Calendar className="w-5 h-5 mx-auto mb-1 text-emerald-500" />
              <p className="text-2xl font-bold">{factory.years_on_platform}년</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">입주 기간</p>
            </CardContent>
          </Card>
        )}
        {factory.certifications?.length ? (
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <ShieldCheck className="w-5 h-5 mx-auto mb-1 text-primary" />
              <p className="text-sm font-bold">{factory.certifications.join(', ')}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">인증</p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* 1688 Platform Score Detail */}
      {barData.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">1688 세부 평가 점수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Bar Chart */}
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={barData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis type="category" dataKey="name" width={60} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                    {barData.map((entry, i) => (
                      <Cell key={i} fill={getBarColor(entry.value)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Radar Chart */}
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickCount={6} />
                  <Radar name="점수" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-md">
                        <p className="text-xs font-medium">{d.name}</p>
                        <p className="text-xs text-muted-foreground">{d.value} / 5.0</p>
                      </div>
                    );
                  }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Score Chips */}
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
              {barData.map(({ name, value, key }) => (
                <div key={key} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getScoreBg(value)}`}>
                  <span className="text-xs text-muted-foreground">{name}</span>
                  <span className={`text-sm font-bold ${getScoreColor(value)}`}>{value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Products */}
        {factory.main_products?.length ? (
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">주요 제품</p>
              <div className="flex flex-wrap gap-1.5">
                {factory.main_products.map((p, i) => (
                  <Badge key={i} variant="secondary" className="text-xs font-normal">{p}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Contact */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">연락처</p>
            {factory.contact_name && <p className="text-sm font-medium">{factory.contact_name}</p>}
            {factory.contact_email && <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1"><Mail className="w-3 h-3" />{factory.contact_email}</p>}
            {factory.contact_phone && <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><Phone className="w-3 h-3" />{factory.contact_phone}</p>}
            {factory.contact_wechat && <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5"><MessageSquare className="w-3 h-3" />{factory.contact_wechat}</p>}
            {!factory.contact_name && !factory.contact_email && !factory.contact_phone && (
              <p className="text-xs text-muted-foreground">연락처 미등록</p>
            )}
          </CardContent>
        </Card>

        {/* MOQ & Lead Time */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">생산 조건</p>
            <div className="space-y-1.5 text-sm">
              {factory.moq && <p><span className="text-muted-foreground text-xs">MOQ:</span> <span className="font-medium">{factory.moq}</span></p>}
              {factory.lead_time && <p><span className="text-muted-foreground text-xs">리드타임:</span> <span className="font-medium">{factory.lead_time}</span></p>}
            </div>
          </CardContent>
        </Card>

        {/* Description / Notes */}
        {factory.description && (
          <Card>
            <CardContent className="pt-4 pb-3">
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">특이사항 / 메모</p>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{factory.description}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="scoring">
        <TabsList className="bg-secondary">
          <TabsTrigger value="scoring" className="text-xs uppercase tracking-wider">Scoring</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs uppercase tracking-wider">Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="photos" className="text-xs uppercase tracking-wider">Photos ({photos.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="mt-6 space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3 mb-3">
                <Select value={noteType} onValueChange={setNoteType}>
                  <SelectTrigger className="w-28 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {noteTypes.map((t) => <SelectItem key={t} value={t} className="text-xs">{noteTypeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Textarea placeholder="미팅 내용, 샘플 결과, 협상 내용 등을 기록하세요..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} rows={3} />
              <Button size="sm" className="mt-3 h-8 text-xs uppercase tracking-wider" onClick={() => addNote.mutate()} disabled={!noteContent.trim()}>
                <Plus className="w-3 h-3 mr-1.5" />Add Note
              </Button>
            </CardContent>
          </Card>
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{noteTypeLabels[note.note_type ?? 'general']}</Badge>
                  <span className="text-[11px] text-muted-foreground">{new Date(note.created_at).toLocaleString('ko-KR')}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{note.content}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="photos" className="mt-6 space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Caption</Label>
                  <Input placeholder="사진 설명..." value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} className="h-9" />
                </div>
                <Select value={photoType} onValueChange={setPhotoType}>
                  <SelectTrigger className="w-24 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {photoTypes.map((t) => <SelectItem key={t} value={t} className="text-xs">{photoTypeLabels[t]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                <Button size="sm" className="h-9 text-xs uppercase tracking-wider" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-3 h-3 mr-1.5" />Upload
                </Button>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-3 gap-4">
            {photos.map((photo) => (
              <Card key={photo.id} className="overflow-hidden">
                <img src={getPhotoUrl(photo.storage_path)} alt={photo.caption ?? ''} className="w-full h-44 object-cover" />
                <CardContent className="pt-3 pb-2">
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider mb-1">{photoTypeLabels[photo.photo_type ?? 'product']}</Badge>
                  {photo.caption && <p className="text-xs text-muted-foreground">{photo.caption}</p>}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="scoring" className="mt-6 space-y-6">
          {criteria.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-12">
                <p className="text-sm text-muted-foreground mb-3">스코어링 기준이 설정되지 않았습니다</p>
                <Link to="/scoring"><Button variant="outline" size="sm" className="text-xs uppercase tracking-wider">Set up scoring</Button></Link>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Scoring Header */}
              {(() => {
                const modifiedCount = scores.filter(s => s.ai_original_score != null && Number(s.ai_original_score) !== Number(s.score)).length;
                const totalAiScore = scores.reduce((sum, s) => sum + Number(s.ai_original_score ?? s.score), 0);
                const totalCurrentScore = scores.reduce((sum, s) => sum + Number(s.score), 0);
                return (
                  <Card>
                    <CardContent className="pt-4 pb-3">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                          <div className="text-sm">
                            <span className="text-muted-foreground">AI 점수</span>{' '}
                            <span className="font-bold">{Math.round(totalAiScore)}</span>
                            <span className="text-muted-foreground mx-1">→</span>
                            <span className="font-bold text-primary">{Math.round(totalCurrentScore)}</span>
                          </div>
                          {modifiedCount > 0 && (
                            <Badge variant="secondary" className="text-[10px] bg-warning/10 text-warning border-warning/20">
                              ✏️ 수정됨 — {modifiedCount}개 항목 변경
                            </Badge>
                          )}
                          {factory.score_confirmed && (
                            <Badge variant="secondary" className="text-[10px] bg-success/10 text-success border-success/20">
                              ✓ 확인됨
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!factory.score_confirmed && (isAdmin || isDev) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs"
                              onClick={() => confirmAIScore.mutate()}
                              disabled={confirmAIScore.isPending}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              AI 점수 확인
                            </Button>
                          )}
                        </div>
                      </div>
                      {(isAdmin || isDev) && (
                        <div className="mt-3 pt-3 border-t border-border">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <BookOpen className="w-3.5 h-3.5" />
                            학습 데이터 진행률
                          </div>
                          <Progress value={Math.min(100, ((factory.score_confirmed ? 1 : 0) + modifiedCount) / 100 * 100)} className="mt-2 h-2" />
                          <p className="text-[10px] text-muted-foreground mt-1">
                            확인 {factory.score_confirmed ? 1 : 0} / 수정 {modifiedCount} / Fine-tuning까지 100건 필요
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* Radar Chart */}
              {scores.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Score Overview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={350}>
                      <RadarChart
                        data={criteria.map((c) => {
                          const s = scores.find((sc) => sc.criteria_id === c.id);
                          const maxScore = c.max_score ?? 10;
                          return {
                            name: c.name.length > 8 ? c.name.slice(0, 8) + '…' : c.name,
                            fullName: c.name,
                            score: Number(s?.score ?? 0),
                            maxScore,
                            pct: maxScore > 0 ? (Number(s?.score ?? 0) / maxScore) * 100 : 0,
                          };
                        })}
                        outerRadius="75%"
                      >
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickCount={5} />
                        <Radar name="Score" dataKey="pct" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                        <Tooltip content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0].payload;
                          return (
                            <div className="bg-popover border border-border rounded-md px-3 py-2 shadow-md">
                              <p className="text-xs font-medium">{d.fullName}</p>
                              <p className="text-xs text-muted-foreground">{d.score} / {d.maxScore} ({Math.round(d.pct)}%)</p>
                            </div>
                          );
                        }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}

              {/* Criteria Cards */}
              <div className="space-y-3">
                {criteria.map((c) => {
                  const currentScore = scores.find((s) => s.criteria_id === c.id);
                  const aiOriginal = currentScore?.ai_original_score != null ? Number(currentScore.ai_original_score) : null;
                  const score = Number(currentScore?.score ?? 0);
                  const isModified = aiOriginal != null && aiOriginal !== score;
                  const isConfirmed = factory.score_confirmed;
                  const isPending = aiOriginal == null && !isConfirmed;
                  const canEdit = isAdmin || isDev;

                  // getScoreStatus
                  const statusKey = aiOriginal == null
                    ? 'no-ai'
                    : isModified
                      ? 'modified'
                      : isConfirmed
                        ? 'confirmed'
                        : 'pending';
                  const statusConfig: Record<string, { label: string; className: string }> = {
                    'no-ai': { label: '수동', className: 'bg-muted text-muted-foreground' },
                    'modified': { label: '수정됨', className: 'bg-warning/10 text-warning border-warning/20' },
                    'confirmed': { label: '✓ 확인됨', className: 'bg-success/10 text-success border-success/20' },
                    'pending': { label: '미확인', className: 'bg-muted text-muted-foreground' },
                  };

                  return (
                    <Card key={c.id}>
                      <CardContent className="pt-4 pb-3">
                        {/* Header: name + badge + score */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{c.name}</p>
                              <Badge variant="outline" className={`text-[10px] ${statusConfig[statusKey].className}`}>
                                {statusConfig[statusKey].label}
                              </Badge>
                            </div>
                            {c.description && <p className="text-[11px] text-muted-foreground">{c.description}</p>}
                            {/* AI reasoning */}
                            {currentScore?.notes && (
                              <p className="text-[11px] text-primary/70 mt-1">AI: {currentScore.notes}</p>
                            )}
                          </div>
                          <div className="text-right">
                            {isModified && (
                              <div className="text-[10px] text-muted-foreground mb-0.5">
                                AI {aiOriginal} → {score} /{c.max_score}
                              </div>
                            )}
                            <span className="text-lg font-bold">{score}</span>
                            <span className="text-xs text-muted-foreground">/{c.max_score}</span>
                            <span className="text-[10px] text-muted-foreground ml-1.5">(×{c.weight})</span>
                          </div>
                        </div>

                        {/* Slider with AI marker */}
                        <div className="relative">
                          <Slider
                            value={[score]}
                            max={c.max_score ?? 10}
                            step={0.5}
                            disabled={!canEdit}
                            onValueCommit={(v) => updateScore.mutate({ criteriaId: c.id, score: v[0] })}
                          />
                          {aiOriginal != null && (
                            <div
                              className="absolute top-0 w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-primary pointer-events-none"
                              style={{ left: `${(aiOriginal / (c.max_score ?? 10)) * 100}%`, transform: 'translateX(-50%)' }}
                              title={`AI 원본: ${aiOriginal}`}
                            />
                          )}
                        </div>

                        {/* Modified warning + correction reason */}
                        {isModified && canEdit && (
                          <div className="mt-3 space-y-2">
                            <p className="text-[11px] text-warning flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              AI 점수({aiOriginal})에서 수정됨
                            </p>
                            <Textarea
                              placeholder="수정 사유를 입력하세요 (5자 이상)..."
                              value={correctionReasons[c.id] || currentScore?.correction_reason || ''}
                              onChange={(e) => setCorrectionReasons(prev => ({ ...prev, [c.id]: e.target.value }))}
                              rows={2}
                              className="text-xs"
                            />
                            <p className="text-[10px] text-muted-foreground">수정 사유는 AI 학습에 활용됩니다</p>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[11px]"
                                disabled={
                                  (correctionReasons[c.id] || currentScore?.correction_reason || '').length < 5
                                }
                                onClick={() => {
                                  const reason = correctionReasons[c.id] || currentScore?.correction_reason || '';
                                  updateScore.mutate({ criteriaId: c.id, score, correctionReason: reason });
                                }}
                              >
                                사유 저장
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-[11px]"
                                disabled={
                                  (correctionReasons[c.id] || currentScore?.correction_reason || '').length < 5
                                }
                                onClick={() => {
                                  const reason = correctionReasons[c.id] || currentScore?.correction_reason || '';
                                  collectTrainingData.mutate({
                                    criteriaId: c.id,
                                    criteriaKey: c.name,
                                    aiScore: aiOriginal!,
                                    correctedScore: score,
                                    reason,
                                  });
                                }}
                              >
                                학습 데이터로 수집
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="text-base">공장 삭제 (소프트 삭제)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">삭제 사유를 선택하거나 직접 입력하세요.</p>
              <div className="flex flex-wrap gap-1.5">
                {deleteReasonPresets.map((preset) => (
                  <Badge
                    key={preset}
                    variant={deleteReason === preset ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setDeleteReason(preset)}
                  >
                    {preset}
                  </Badge>
                ))}
              </div>
              <Textarea
                placeholder="삭제 사유를 직접 입력..."
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                rows={2}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowDeleteDialog(false)}>취소</Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!deleteReason.trim() || deleteFactory.isPending}
                  onClick={() => deleteFactory.mutate(deleteReason)}
                >
                  삭제
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default FactoryDetail;
