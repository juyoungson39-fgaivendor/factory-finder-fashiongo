import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, X, Check, GripVertical,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';

/* ---------- Types ---------- */
type Project = {
  id: string;
  display_order: number;
  number_label: string | null;
  name: string;
  tag: string | null;
  phase: string | null;
  progress: number | null;
  status_color: string | null;
  deadlines: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ProjectItem = {
  id: string;
  project_id: string;
  category: 'done' | 'blocker' | 'next';
  content: string;
  display_order: number;
  created_at: string;
};

type Meta = {
  id: string;
  meta_key: string;
  label: string | null;
  value: string | null;
  description: string | null;
  color: string | null;
  display_order: number;
};

/* ---------- Color helpers ---------- */
const STATUS_FILL: Record<string, string> = {
  green: '#1D9E75',
  amber: '#D5A24F',
  blue: '#534AB7',
  red: '#C75450',
};

const META_TEXT: Record<string, string> = {
  red: '#C75450',
  green: '#1D9E75',
  blue: '#534AB7',
  default: '#1A1A1A',
};

const TAG_INFO: Record<string, { bg: string; fg: string; label: string }> = {
  core: { bg: '#EAE7F6', fg: '#534AB7', label: '최우선' },
  active: { bg: '#E0F2EA', fg: '#1D9E75', label: '진행중' },
  paused: { bg: '#FBF1DD', fg: '#B17A2D', label: '검토중' },
};

const CAT_INFO: Record<ProjectItem['category'], { label: string; color: string }> = {
  done: { label: '완료', color: '#1D9E75' },
  blocker: { label: '막힘', color: '#C75450' },
  next: { label: '다음 액션', color: '#534AB7' },
};

/* ---------- Time helpers ---------- */
function relativeKo(dateStr?: string | null) {
  if (!dateStr) return '—';
  const d = new Date(dateStr).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금 전';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(dateStr).toLocaleDateString('ko-KR');
}

/* ---------- Inline editable text ---------- */
function InlineText({
  value, onSave, multiline = false, placeholder, className, style,
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = async () => {
    const v = draft.trim();
    setEditing(false);
    if (v !== value) {
      try { await onSave(v); } catch { toast.error('저장 실패'); setDraft(value); }
    }
  };

  if (!editing) {
    return (
      <span
        className={`cursor-text hover:bg-[#F4F1E8] rounded px-0.5 ${className || ''}`}
        style={style}
        onClick={() => setEditing(true)}
      >
        {value || <span className="text-[#B7B2A4]">{placeholder || '클릭해서 편집'}</span>}
      </span>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
    else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
  };

  if (multiline) {
    return (
      <Textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={className}
        style={style}
        rows={3}
      />
    );
  }
  return (
    <Input
      ref={ref as React.RefObject<HTMLInputElement>}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      className={`h-7 ${className || ''}`}
      style={style}
    />
  );
}

/* ---------- Meta Card ---------- */
function MetaCard({ meta, onUpdate }: { meta: Meta; onUpdate: (id: string, patch: Partial<Meta>) => Promise<void> }) {
  const color = META_TEXT[meta.color || 'default'] || META_TEXT.default;
  return (
    <div
      className="bg-white border rounded-xl p-4 transition-shadow hover:shadow-sm"
      style={{ borderColor: '#E5E2DA' }}
    >
      <div className="text-[11px] uppercase tracking-wider text-[#8C8778] mb-2">
        <InlineText value={meta.label || ''} onSave={(v) => onUpdate(meta.id, { label: v })} placeholder="라벨" />
      </div>
      <div className="text-[26px] font-bold leading-none mb-2" style={{ color }}>
        <InlineText value={meta.value || ''} onSave={(v) => onUpdate(meta.id, { value: v })} placeholder="값" />
      </div>
      <div className="text-[12px] text-[#6B6B6B]">
        <InlineText value={meta.description || ''} onSave={(v) => onUpdate(meta.id, { description: v })} placeholder="설명" />
      </div>
    </div>
  );
}

/* ---------- Items column ---------- */
function ItemsColumn({
  projectId, category, items, refetch,
}: {
  projectId: string;
  category: ProjectItem['category'];
  items: ProjectItem[];
  refetch: () => void;
}) {
  const info = CAT_INFO[category];
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ProjectItem | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const addItem = async () => {
    const content = draft.trim();
    setAdding(false);
    setDraft('');
    if (!content) return;
    const maxOrder = items.reduce((m, i) => Math.max(m, i.display_order), 0);
    const { error } = await supabase.from('project_items').insert({
      project_id: projectId, category, content, display_order: maxOrder + 1,
    });
    if (error) toast.error('추가 실패: ' + error.message);
    else refetch();
  };

  const updateItem = async (id: string, content: string) => {
    const { error } = await supabase.from('project_items').update({ content }).eq('id', id);
    if (error) throw error;
    refetch();
  };

  const deleteItem = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('project_items').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) toast.error('삭제 실패');
    else { toast.success('삭제됨'); refetch(); }
  };

  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: info.color }}>
        {info.label} {items.length > 0 && <span className="text-[#B7B2A4] ml-1">{items.length}</span>}
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li
            key={it.id}
            className="group flex items-start gap-1.5 text-[13px] leading-snug"
            style={{ color: info.color }}
          >
            <span className="mt-1.5 w-1 h-1 rounded-full shrink-0" style={{ background: info.color }} />
            <div className="flex-1 min-w-0">
              <InlineText
                value={it.content}
                onSave={(v) => updateItem(it.id, v)}
                className="break-words"
              />
            </div>
            <button
              onClick={() => setPendingDelete(it)}
              className="opacity-0 group-hover:opacity-100 text-[#B7B2A4] hover:text-[#C75450] transition-opacity shrink-0"
              aria-label="삭제"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-2 flex gap-1">
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={addItem}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addItem(); }
              if (e.key === 'Escape') { setDraft(''); setAdding(false); }
            }}
            className="h-7 text-[13px]"
            placeholder="내용 입력 후 Enter"
          />
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="mt-2 text-[11px] text-[#8C8778] hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
        >
          <Plus size={11} /> 추가
        </button>
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>항목 삭제</AlertDialogTitle>
            <AlertDialogDescription>"{pendingDelete?.content}" 항목을 삭제할까요?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={deleteItem}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ---------- Project edit modal ---------- */
function ProjectEditModal({
  open, onOpenChange, project, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: Project | null; // null = create
  onSaved: () => void;
}) {
  const isCreate = !project;
  const [form, setForm] = useState<Partial<Project>>({});

  useEffect(() => {
    if (open) {
      setForm(project ?? {
        number_label: '', name: '', tag: 'active', phase: '',
        progress: 0, status_color: 'amber', deadlines: '',
      });
    }
  }, [open, project]);

  const save = async () => {
    if (!form.name?.trim()) { toast.error('이름은 필수'); return; }
    if (isCreate) {
      const { data: maxRow } = await supabase
        .from('projects').select('display_order').order('display_order', { ascending: false }).limit(1).maybeSingle();
      const nextOrder = (maxRow?.display_order ?? 0) + 1;
      const { error } = await supabase.from('projects').insert({
        display_order: nextOrder,
        number_label: form.number_label || null,
        name: form.name,
        tag: form.tag || null,
        phase: form.phase || null,
        progress: form.progress ?? 0,
        status_color: form.status_color || 'amber',
        deadlines: form.deadlines || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('프로젝트 추가됨');
    } else {
      const { error } = await supabase.from('projects').update({
        number_label: form.number_label || null,
        name: form.name,
        tag: form.tag || null,
        phase: form.phase || null,
        progress: form.progress ?? 0,
        status_color: form.status_color || 'amber',
        deadlines: form.deadlines || null,
      }).eq('id', project!.id);
      if (error) { toast.error(error.message); return; }
      toast.success('저장됨');
    }
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? '프로젝트 추가' : '프로젝트 편집'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[80px_1fr] gap-2">
            <div>
              <label className="text-xs text-muted-foreground">번호</label>
              <Input value={form.number_label || ''} onChange={(e) => setForm({ ...form, number_label: e.target.value })} placeholder="①" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">이름 *</label>
              <Input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">태그</label>
              <Select value={form.tag || 'active'} onValueChange={(v) => setForm({ ...form, tag: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">core (최우선)</SelectItem>
                  <SelectItem value="active">active (진행중)</SelectItem>
                  <SelectItem value="paused">paused (검토중)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">상태 색상</label>
              <Select value={form.status_color || 'amber'} onValueChange={(v) => setForm({ ...form, status_color: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="green">green (순항)</SelectItem>
                  <SelectItem value="amber">amber (지연)</SelectItem>
                  <SelectItem value="blue">blue (최우선)</SelectItem>
                  <SelectItem value="red">red (막힘)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">단계 (phase)</label>
            <Input value={form.phase || ''} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">진행률 ({form.progress ?? 0}%)</label>
            <Slider
              value={[form.progress ?? 0]}
              onValueChange={(v) => setForm({ ...form, progress: v[0] })}
              max={100}
              step={5}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">데드라인 ( | 로 구분)</label>
            <Textarea
              value={form.deadlines || ''}
              onChange={(e) => setForm({ ...form, deadlines: e.target.value })}
              rows={2}
              placeholder="D-45 · 6/12 증빙 | D-10 · 5/8 미팅"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={save}>{isCreate ? '추가' : '저장'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Project Card ---------- */
function ProjectCard({
  project, items, refetch, onEdit, onDelete,
}: {
  project: Project;
  items: ProjectItem[];
  refetch: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tag = project.tag && TAG_INFO[project.tag];
  const fillColor = STATUS_FILL[project.status_color || 'amber'] || STATUS_FILL.amber;
  const progress = project.progress ?? 0;
  const deadlines = (project.deadlines || '').split('|').map((s) => s.trim()).filter(Boolean);

  const byCat = useMemo(() => ({
    done: items.filter((i) => i.category === 'done').sort((a, b) => a.display_order - b.display_order),
    blocker: items.filter((i) => i.category === 'blocker').sort((a, b) => a.display_order - b.display_order),
    next: items.filter((i) => i.category === 'next').sort((a, b) => a.display_order - b.display_order),
  }), [items]);

  return (
    <div
      className="bg-white border rounded-xl p-5 transition-shadow hover:shadow-sm group/card"
      style={{ borderColor: '#E5E2DA' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-1">
        <span className="text-[20px] font-bold text-[#1A1A1A] leading-none mt-0.5">{project.number_label}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-[#1A1A1A]">{project.name}</span>
            {tag && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: tag.bg, color: tag.fg }}
              >
                {tag.label}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[22px] font-bold tabular-nums" style={{ color: fillColor }}>{progress}%</span>
          <div className="opacity-0 group-hover/card:opacity-100 transition-opacity flex items-center gap-1 ml-1">
            <button onClick={onEdit} className="p-1 text-[#8C8778] hover:text-[#1A1A1A]" aria-label="편집">
              <Pencil size={13} />
            </button>
            <button onClick={onDelete} className="p-1 text-[#8C8778] hover:text-[#C75450]" aria-label="삭제">
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Phase */}
      {project.phase && (
        <div className="text-[12.5px] text-[#6B6B6B] mb-3 ml-7">{project.phase}</div>
      )}

      {/* Progress bar */}
      <div className="rounded-full overflow-hidden mb-4" style={{ height: 5, background: '#F0EDE5' }}>
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: fillColor }}
        />
      </div>

      {/* 3 columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <ItemsColumn projectId={project.id} category="done" items={byCat.done} refetch={refetch} />
        <ItemsColumn projectId={project.id} category="blocker" items={byCat.blocker} refetch={refetch} />
        <ItemsColumn projectId={project.id} category="next" items={byCat.next} refetch={refetch} />
      </div>

      {/* Deadlines */}
      {deadlines.length > 0 && (
        <div className="mt-4 pt-3 flex flex-wrap gap-x-5 gap-y-1" style={{ borderTop: '1px dashed #E5E2DA' }}>
          {deadlines.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[11.5px] text-[#6B6B6B]">
              <span className="w-1 h-1 rounded-full bg-[#8C8778]" />
              {d}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Main page ---------- */
export default function Progress() {
  const qc = useQueryClient();
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingProjectDelete, setPendingProjectDelete] = useState<Project | null>(null);

  const projectsQ = useQuery({
    queryKey: ['progress', 'projects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects').select('*').order('display_order');
      if (error) throw error;
      return data as Project[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ['progress', 'items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_items').select('*').order('display_order');
      if (error) throw error;
      return data as ProjectItem[];
    },
  });

  const metaQ = useQuery({
    queryKey: ['progress', 'meta'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_meta').select('*').order('display_order');
      if (error) throw error;
      return data as Meta[];
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase.channel('progress-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'projects'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_items' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'items'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_meta' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'meta'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const refetchAll = () => {
    qc.invalidateQueries({ queryKey: ['progress', 'projects'] });
    qc.invalidateQueries({ queryKey: ['progress', 'items'] });
  };

  const updateMeta = async (id: string, patch: Partial<Meta>) => {
    const { error } = await supabase.from('dashboard_meta').update(patch).eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['progress', 'meta'] });
  };

  const deleteProject = async () => {
    if (!pendingProjectDelete) return;
    const { error } = await supabase.from('projects').delete().eq('id', pendingProjectDelete.id);
    setPendingProjectDelete(null);
    if (error) toast.error('삭제 실패: ' + error.message);
    else { toast.success('프로젝트 삭제됨'); refetchAll(); }
  };

  const projects = projectsQ.data || [];
  const items = itemsQ.data || [];
  const metas = metaQ.data || [];

  const summaries = metas.filter((m) => m.meta_key.startsWith('summary_'));
  const insight = metas.find((m) => m.meta_key === 'insight');
  const lastUpdated = projects.reduce<string | null>((acc, p) => {
    if (!acc || new Date(p.updated_at) > new Date(acc)) return p.updated_at;
    return acc;
  }, null);

  const itemsByProject = useMemo(() => {
    const map = new Map<string, ProjectItem[]>();
    items.forEach((i) => {
      if (!map.has(i.project_id)) map.set(i.project_id, []);
      map.get(i.project_id)!.push(i);
    });
    return map;
  }, [items]);

  const loading = projectsQ.isLoading || itemsQ.isLoading || metaQ.isLoading;

  return (
    <div className="min-h-screen -m-6 p-6 md:p-8" style={{ background: '#FAF9F6' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">프로젝트 진척도 대시보드</h1>
            <p className="text-[13px] text-[#6B6B6B] mt-1">
              전체 통합 정리 · 6/12 딥 스프린톤 증빙을 정점으로 6개 줄기 동시 진행
            </p>
            <p className="text-[11.5px] text-[#8C8778] mt-1">
              마지막 업데이트: {relativeKo(lastUpdated)}
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus size={14} className="mr-1" /> 프로젝트 추가
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
            : summaries.map((m) => <MetaCard key={m.id} meta={m} onUpdate={updateMeta} />)}
        </div>

        {/* Insight */}
        {insight && (
          <div
            className="mb-6 rounded-r-md"
            style={{
              background: '#F4F1E8',
              padding: '14px 18px',
              borderLeft: '3px solid #534AB7',
            }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[#534AB7] mb-1">
              {insight.label || '전체 그림'}
            </div>
            <div className="text-[13px] text-[#1A1A1A] leading-relaxed">
              <InlineText
                value={insight.value || ''}
                onSave={(v) => updateMeta(insight.id, { value: v })}
                multiline
                placeholder="인사이트 입력"
              />
            </div>
          </div>
        )}

        {/* Project cards */}
        <div className="space-y-4">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[280px] rounded-xl" />)
            : projects.map((p) => (
                <ProjectCard
                  key={p.id}
                  project={p}
                  items={itemsByProject.get(p.id) || []}
                  refetch={refetchAll}
                  onEdit={() => setEditingProject(p)}
                  onDelete={() => setPendingProjectDelete(p)}
                />
              ))}
        </div>

        {/* Legend */}
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11.5px] text-[#6B6B6B] justify-center">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#1D9E75' }} /> 순항 (60%+)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#D5A24F' }} /> 지연·부분 (20-60%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#534AB7' }} /> 최우선
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: '#C75450' }} /> 막힘/데드라인
          </span>
        </div>
      </div>

      {/* Edit / Create modals */}
      <ProjectEditModal
        open={!!editingProject}
        onOpenChange={(o) => !o && setEditingProject(null)}
        project={editingProject}
        onSaved={refetchAll}
      />
      <ProjectEditModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        project={null}
        onSaved={refetchAll}
      />

      {/* Delete project confirmation */}
      <AlertDialog open={!!pendingProjectDelete} onOpenChange={(o) => !o && setPendingProjectDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>프로젝트 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              "{pendingProjectDelete?.name}" 프로젝트와 모든 하위 항목이 삭제됩니다. 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProject}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
