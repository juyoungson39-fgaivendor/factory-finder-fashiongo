import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AssigneePicker, useTeamMembers,
} from '@/components/progress/assignee';

/* ---------- Types ---------- */
type Stage = {
  id: string;
  stage_no: number;
  week_label: string;
  title: string;
  current_state: string | null;
  progress_pct: number | null;
  status: 'pending' | 'in_progress' | 'done' | 'blocked' | 'paused' | 'cancelled';
  owner_id: string | null;
  sort_order: number;
  track_id: string | null;
  intra_track_order: number | null;
};

type Track = {
  id: string;
  track_key: string;
  title: string;
  owner_id: string | null;
  color: string;
  sort_order: number;
};

type StageItem = {
  id: string;
  stage_id: string;
  kind: 'gap' | 'action' | 'deliverable';
  content: string;
  done: boolean | null;
  owner_id: string | null;
  sort_order: number;
};

type Kpi = {
  id: string;
  metric_key: string;
  label: string;
  target_value: number;
  current_value: number;
  unit: string;
  direction: 'higher_better' | 'lower_better';
  sort_order: number;
};

/* ---------- Status options (대기/진행중/중단/취소/완료) ---------- */
const STATUS_OPTIONS: { value: Stage['status']; label: string; dot: string; border: string }[] = [
  { value: 'pending',     label: '대기',   dot: '#B7B2A4', border: '#E5E2DA' },
  { value: 'in_progress', label: '진행중', dot: '#D5A24F', border: '#D5A24F' },
  { value: 'paused',      label: '중단',   dot: '#C75450', border: '#C75450' },
  { value: 'cancelled',   label: '취소',   dot: '#8C8778', border: '#C7C2B4' },
  { value: 'done',        label: '완료',   dot: '#1D9E75', border: '#1D9E75' },
  // Legacy alias: blocked → 중단
  { value: 'blocked',     label: '중단',   dot: '#C75450', border: '#C75450' },
];

const STATUS_META = (s: Stage['status']) =>
  STATUS_OPTIONS.find((o) => o.value === s) || STATUS_OPTIONS[0];

const STATUS_BORDER = (s: Stage['status']) => STATUS_META(s).border;
const STATUS_DOT    = (s: Stage['status']) => STATUS_META(s).dot;
const STATUS_LABEL  = (s: Stage['status']) => STATUS_META(s).label;

const KIND_INFO: Record<StageItem['kind'], { label: string; icon: string; color: string }> = {
  gap: { label: '갭', icon: '🚧', color: '#C75450' },
  action: { label: '액션', icon: '✅', color: '#1D9E75' },
  deliverable: { label: '산출물', icon: '📦', color: '#534AB7' },
};

/* ---------- Helpers ---------- */
function kpiSatisfied(k: Kpi) {
  return k.direction === 'higher_better'
    ? k.current_value >= k.target_value
    : k.current_value > 0 && k.current_value <= k.target_value;
}

/* ---------- Inline editable text ---------- */
function InlineText({
  value, onSave, placeholder, className, style, multiline,
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  multiline?: boolean;
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
    else if (e.key === 'Enter' && !multiline) { e.preventDefault(); commit(); }
  };

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        className={`w-full text-[13px] border rounded px-2 py-1 ${className || ''}`}
        style={style}
        rows={2}
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

/* ---------- Stage Item Row ---------- */
function StageItemRow({
  item, refetch, onProgressMaybeChanged,
}: {
  item: StageItem;
  refetch: () => void;
  onProgressMaybeChanged: () => void;
}) {
  const info = KIND_INFO[item.kind];
  const [pending, setPending] = useState(false);

  const toggleDone = async () => {
    if (pending) return;
    setPending(true);
    const { error } = await supabase
      .from('e2e_stage_items').update({ done: !item.done }).eq('id', item.id);
    setPending(false);
    if (error) toast.error('저장 실패');
    else { refetch(); onProgressMaybeChanged(); }
  };

  const updateContent = async (v: string) => {
    const { error } = await supabase
      .from('e2e_stage_items').update({ content: v }).eq('id', item.id);
    if (error) throw error;
    refetch();
  };

  const setAssignee = async (id: string | null) => {
    const { error } = await supabase
      .from('e2e_stage_items').update({ owner_id: id }).eq('id', item.id);
    if (error) toast.error('담당자 저장 실패');
    else refetch();
  };

  const remove = async () => {
    const { error } = await supabase.from('e2e_stage_items').delete().eq('id', item.id);
    if (error) toast.error('삭제 실패');
    else { refetch(); onProgressMaybeChanged(); }
  };

  const showCheckbox = item.kind === 'action';

  return (
    <li className="group flex items-start gap-2 text-[13px] leading-snug py-0.5">
      {showCheckbox ? (
        <button
          onClick={toggleDone}
          className="mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
          style={{
            borderColor: item.done ? '#1D9E75' : '#C7C2B4',
            background: item.done ? '#1D9E75' : '#fff',
          }}
          aria-label="완료 토글"
        >
          {item.done && <Check size={11} className="text-white" strokeWidth={3} />}
        </button>
      ) : (
        <span
          className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: info.color }}
        />
      )}
      <div className="flex-1 min-w-0">
        <InlineText
          value={item.content}
          onSave={updateContent}
          className="break-words"
          style={item.done ? { textDecoration: 'line-through', color: '#B7B2A4' } : undefined}
        />
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <AssigneePicker
          value={item.owner_id}
          onChange={setAssignee}
          size="sm"
        />
        <button
          onClick={remove}
          className="opacity-0 group-hover:opacity-100 text-[#B7B2A4] hover:text-[#C75450] transition-opacity"
          aria-label="삭제"
        >
          <X size={12} />
        </button>
      </div>
    </li>
  );
}

/* ---------- Add item button ---------- */
function AddItemRow({ stageId, kind, refetch, nextOrder }: {
  stageId: string;
  kind: StageItem['kind'];
  refetch: () => void;
  nextOrder: number;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);

  const add = async () => {
    const c = draft.trim();
    setAdding(false);
    setDraft('');
    if (!c) return;
    const { error } = await supabase.from('e2e_stage_items').insert({
      stage_id: stageId, kind, content: c, sort_order: nextOrder, done: false,
    });
    if (error) toast.error('추가 실패: ' + error.message);
    else refetch();
  };

  if (adding) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); add(); }
          if (e.key === 'Escape') { setDraft(''); setAdding(false); }
        }}
        className="h-7 text-[13px] mt-1 ml-6"
        placeholder="내용 입력 후 Enter"
      />
    );
  }
  return (
    <button
      onClick={() => setAdding(true)}
      className="ml-6 mt-1 text-[11px] text-[#8C8778] hover:text-[#1A1A1A] flex items-center gap-1 transition-colors"
    >
      <Plus size={11} /> 추가
    </button>
  );
}

/* ---------- Stage Card ---------- */
function StageCard({
  stage, items, refetch, onProgressMaybeChanged,
}: {
  stage: Stage;
  items: StageItem[];
  refetch: () => void;
  onProgressMaybeChanged: (stageId: string) => void;
}) {
  const borderColor = STATUS_BORDER(stage.status);
  const showSideBar = ['in_progress', 'blocked', 'paused', 'cancelled'].includes(stage.status);
  const dotColor = STATUS_DOT(stage.status);
  const [statusOpen, setStatusOpen] = useState(false);

  const updateStage = async (patch: Partial<Stage>) => {
    const { error } = await supabase.from('e2e_stages').update(patch).eq('id', stage.id);
    if (error) toast.error('저장 실패');
    else refetch();
  };

  const deleteStage = async () => {
    if (!confirm(`"${stage.title}" 단계를 삭제할까요?\n하위 항목(갭/액션/산출물)도 함께 삭제됩니다.`)) return;
    await supabase.from('e2e_stage_items').delete().eq('stage_id', stage.id);
    const { error } = await supabase.from('e2e_stages').delete().eq('id', stage.id);
    if (error) toast.error('삭제 실패: ' + error.message);
    else {
      toast.success('단계 삭제됨');
      refetch();
    }
  };

  const setStatus = async (next: Stage['status']) => {
    setStatusOpen(false);
    if (next === stage.status) return;
    await updateStage({ status: next });
  };

  const grouped = useMemo(() => {
    const g: Record<StageItem['kind'], StageItem[]> = { gap: [], action: [], deliverable: [] };
    items.forEach((it) => g[it.kind].push(it));
    (Object.keys(g) as StageItem['kind'][]).forEach((k) =>
      g[k].sort((a, b) => a.sort_order - b.sort_order));
    return g;
  }, [items]);

  const progress = stage.progress_pct ?? 0;

  return (
    <div
      id={`stage-${stage.id}`}
      className="bg-white border rounded-xl overflow-hidden"
      style={{
        borderColor: '#E5E2DA',
        borderLeft: showSideBar ? `4px solid ${borderColor}` : '1px solid #E5E2DA',
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 p-4 border-b" style={{ borderColor: '#F0EDE5' }}>
        <div
          className="shrink-0 inline-flex items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold tracking-wider"
          style={{ background: '#F4F1E8', color: '#6B6B6B' }}
        >
          {stage.week_label}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#1A1A1A] leading-snug">
            <InlineText value={stage.title} onSave={(v) => updateStage({ title: v })} />
          </div>
          <div className="text-[12px] text-[#6B6B6B] mt-1.5 leading-relaxed">
            <InlineText
              value={stage.current_state || ''}
              onSave={(v) => updateStage({ current_state: v || null })}
              placeholder="+ 소제목 추가"
              multiline
            />
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border transition-all hover:bg-[#F4F1E8]"
                style={{ borderColor: '#E5E2DA', color: '#1A1A1A' }}
                title="상태 변경"
              >
                <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
                {STATUS_LABEL(stage.status)}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-36 p-1" align="end">
              {STATUS_OPTIONS.filter((o) => o.value !== 'blocked').map((o) => (
                <button
                  key={o.value}
                  onClick={() => setStatus(o.value)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F4F1E8] text-left text-[13px]"
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: o.dot }} />
                  <span className="flex-1">{o.label}</span>
                  {(stage.status === o.value ||
                    (o.value === 'paused' && stage.status === 'blocked')) && (
                    <Check size={13} className="text-[#1D9E75]" />
                  )}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <AssigneePicker value={stage.owner_id} onChange={(v) => updateStage({ owner_id: v })} size="sm" />
          <button
            type="button"
            onClick={deleteStage}
            className="text-[#B7B2A4] hover:text-[#C75450] p-1 rounded transition-colors"
            title="단계 삭제"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE5' }}>
            <div
              className="h-full transition-all"
              style={{ width: `${progress}%`, background: dotColor }}
            />
          </div>
          <span className="text-[11px] font-semibold text-[#6B6B6B] tabular-nums shrink-0">
            {progress}%
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {(['gap', 'action', 'deliverable'] as const).map((kind) => {
          const list = grouped[kind];
          const info = KIND_INFO[kind];
          if (list.length === 0 && kind === 'deliverable') {
            // Allow add even when empty
          }
          const nextOrder = (list.reduce((m, x) => Math.max(m, x.sort_order), 0)) + 1;
          return (
            <div key={kind}>
              <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5" style={{ color: info.color }}>
                <span>{info.icon}</span>
                <span>{info.label}</span>
                {list.length > 0 && <span className="text-[#B7B2A4] font-normal">{list.length}</span>}
              </div>
              <ul className="space-y-0.5">
                {list.map((it) => (
                  <StageItemRow
                    key={it.id}
                    item={it}
                    refetch={refetch}
                    onProgressMaybeChanged={() => onProgressMaybeChanged(stage.id)}
                  />
                ))}
              </ul>
              <AddItemRow stageId={stage.id} kind={kind} refetch={refetch} nextOrder={nextOrder} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Track Column ---------- */
function TrackColumn({
  track, stages, itemsByStage, refetchItems, onProgressMaybeChanged, onUpdateTrack, onAddStage, onCascadeOwner, onDeleteTrack,
}: {
  track: Track;
  stages: Stage[];
  itemsByStage: Record<string, StageItem[]>;
  refetchItems: () => void;
  onProgressMaybeChanged: (stageId: string) => void;
  onUpdateTrack: (id: string, patch: Partial<Track>) => Promise<void>;
  onAddStage: (trackId: string, nextOrder: number) => Promise<void>;
  onCascadeOwner: (trackId: string, ownerId: string | null) => Promise<void>;
  onDeleteTrack?: (trackId: string, title: string) => Promise<void>;
}) {
  const sorted = useMemo(
    () => [...stages].sort((a, b) => (a.intra_track_order ?? 999) - (b.intra_track_order ?? 999)),
    [stages]
  );
  const avgProgress = sorted.length === 0 ? 0
    : Math.round(sorted.reduce((s, x) => s + (x.progress_pct ?? 0), 0) / sorted.length);
  const nextOrder = (sorted.reduce((m, x) => Math.max(m, x.intra_track_order ?? 0), 0)) + 1;
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [pendingOwner, setPendingOwner] = useState<string | null>(null);

  return (
    <div
      className="bg-white border rounded-xl overflow-hidden flex flex-col"
      style={{ borderColor: '#E5E2DA', borderLeft: `4px solid ${track.color}` }}
    >
      {/* Track header */}
      <div className="p-3 border-b" style={{ borderColor: '#F0EDE5', background: '#FBFAF6' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-[13px] font-bold text-[#1A1A1A] flex-1 truncate">
            <InlineText value={track.title} onSave={(v) => onUpdateTrack(track.id, { title: v })} />
          </div>
          <button
            onClick={() => onAddStage(track.id, nextOrder)}
            className="text-[#8C8778] hover:text-[#1A1A1A] p-0.5"
            title="이 트랙에 단계 추가"
          >
            <Plus size={14} />
          </button>
          {onDeleteTrack && (
            <button
              onClick={() => onDeleteTrack(track.id, track.title)}
              className="text-[#B7B2A4] hover:text-[#C75450] p-0.5"
              title="트랙 삭제"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8C8778]">담당</span>
          <AssigneePicker
            value={track.owner_id}
            onChange={(v) => {
              setPendingOwner(v);
              setCascadeOpen(true);
              onUpdateTrack(track.id, { owner_id: v });
            }}
            size="sm"
          />
          <div className="ml-auto flex items-center gap-1.5 min-w-0">
            <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE5' }}>
              <div className="h-full" style={{ width: `${avgProgress}%`, background: track.color }} />
            </div>
            <span className="text-[11px] font-semibold text-[#6B6B6B] tabular-nums">{avgProgress}%</span>
          </div>
        </div>
        {cascadeOpen && (
          <div className="mt-2 p-2 rounded border text-[11px] flex items-center gap-2"
            style={{ borderColor: '#E5E2DA', background: '#fff' }}>
            <span className="flex-1 text-[#6B6B6B]">트랙 내 모든 단계에도 적용?</span>
            <button
              onClick={async () => { await onCascadeOwner(track.id, pendingOwner); setCascadeOpen(false); }}
              className="px-2 py-0.5 rounded bg-[#1A1A1A] text-white text-[10px] font-semibold"
            >적용</button>
            <button onClick={() => setCascadeOpen(false)} className="text-[#8C8778] hover:text-[#1A1A1A]">
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Stage cards */}
      <div className="p-2 space-y-2 flex-1">
        {sorted.length === 0 && (
          <div className="text-[11px] text-[#B7B2A4] text-center py-6">단계 없음</div>
        )}
        {sorted.map((s, idx) => (
          <div key={s.id}>
            <StageCard
              stage={s}
              items={itemsByStage[s.id] || []}
              refetch={refetchItems}
              onProgressMaybeChanged={onProgressMaybeChanged}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function ProgressE2ERoadmap() {
  const qc = useQueryClient();

  const stagesQ = useQuery({
    queryKey: ['e2e', 'stages'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('e2e_stages').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as Stage[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ['e2e', 'stage_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('e2e_stage_items').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as StageItem[];
    },
  });

  const kpisQ = useQuery({
    queryKey: ['e2e', 'kpi'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('e2e_kpi').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as Kpi[];
    },
  });

  const tracksQ = useQuery({
    queryKey: ['e2e', 'tracks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('e2e_tracks').select('*').order('sort_order');
      if (error) throw error;
      return (data || []) as Track[];
    },
  });
  const factoryStatsQ = useQuery({
    queryKey: ['e2e', 'factory_stats'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const [{ count }, { data: lastScored }] = await Promise.all([
        supabase.from('factories').select('*', { count: 'exact', head: true }).is('deleted_at', null),
        supabase.from('factories').select('ai_scored_at').not('ai_scored_at', 'is', null)
          .order('ai_scored_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      return {
        count: count || 0,
        lastScoredAt: (lastScored as any)?.ai_scored_at as string | null,
      };
    },
  });

  // Realtime subscriptions
  useEffect(() => {
    const ch = supabase
      .channel('e2e-roadmap')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'e2e_stages' },
        () => qc.invalidateQueries({ queryKey: ['e2e', 'stages'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'e2e_stage_items' },
        () => qc.invalidateQueries({ queryKey: ['e2e', 'stage_items'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'e2e_kpi' },
        () => qc.invalidateQueries({ queryKey: ['e2e', 'kpi'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'factories' },
        () => qc.invalidateQueries({ queryKey: ['e2e', 'factory_stats'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'e2e_tracks' },
        () => qc.invalidateQueries({ queryKey: ['e2e', 'tracks'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const factoryStats = factoryStatsQ.data;

  // Inject live prefix into Stage 1 current_state without persisting to DB
  const stagesRaw = stagesQ.data || [];
  const stages = useMemo(() => {
    if (!factoryStats) return stagesRaw;
    return stagesRaw.map((s) => {
      if (s.stage_no !== 1) return s;
      const daysAgo = factoryStats.lastScoredAt
        ? Math.floor((Date.now() - new Date(factoryStats.lastScoredAt).getTime()) / 86400000)
        : null;
      const prefix = `factories ${factoryStats.count}건 · 마지막 스코어링: ${
        daysAgo === null ? '없음' : daysAgo === 0 ? '오늘' : `${daysAgo}일 전`
      } · `;
      // Strip any previous prefix we may have added (idempotent)
      const baseText = (s.current_state || '').replace(/^factories \d+건 · 마지막 스코어링: [^·]+ · /, '');
      return { ...s, current_state: prefix + baseText };
    });
  }, [stagesRaw, factoryStats]);

  const items = itemsQ.data || [];
  const kpis = kpisQ.data || [];

  const itemsByStage = useMemo(() => {
    const m: Record<string, StageItem[]> = {};
    items.forEach((it) => {
      (m[it.stage_id] = m[it.stage_id] || []).push(it);
    });
    return m;
  }, [items]);

  // Recompute stage.progress_pct from action items (action only)
  const recomputeStageProgress = async (stageId: string) => {
    const all = (itemsByStage[stageId] || []).filter((i) => i.kind === 'action');
    if (all.length === 0) return;
    const done = all.filter((i) => i.done).length;
    const pct = Math.round((done / all.length) * 100);
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || stage.progress_pct === pct) return;
    await supabase.from('e2e_stages').update({ progress_pct: pct }).eq('id', stageId);
    qc.invalidateQueries({ queryKey: ['e2e', 'stages'] });
  };

  const tracks = tracksQ.data || [];

  const stagesByTrack = useMemo(() => {
    const m: Record<string, Stage[]> = {};
    stages.forEach((s) => {
      const k = s.track_id || '__none__';
      (m[k] = m[k] || []).push(s);
    });
    return m;
  }, [stages]);

  // Overall = weighted equally across 4 tracks (track avg)
  const overallPct = useMemo(() => {
    if (tracks.length === 0) {
      if (stages.length === 0) return 0;
      return Math.round(stages.reduce((s, x) => s + (x.progress_pct ?? 0), 0) / stages.length);
    }
    const trackAvgs = tracks.map((t) => {
      const ss = stagesByTrack[t.id] || [];
      if (ss.length === 0) return 0;
      return ss.reduce((s, x) => s + (x.progress_pct ?? 0), 0) / ss.length;
    });
    return Math.round(trackAvgs.reduce((s, x) => s + x, 0) / tracks.length);
  }, [tracks, stagesByTrack, stages]);

  const phase0Closed = kpis.length > 0 && kpis.every(kpiSatisfied);

  const updateTrack = async (id: string, patch: Partial<Track>) => {
    const { error } = await supabase.from('e2e_tracks').update(patch).eq('id', id);
    if (error) { toast.error('트랙 저장 실패'); throw error; }
    qc.invalidateQueries({ queryKey: ['e2e', 'tracks'] });
  };

  const cascadeOwnerToStages = async (trackId: string, ownerId: string | null) => {
    const { error } = await supabase.from('e2e_stages')
      .update({ owner_id: ownerId }).eq('track_id', trackId);
    if (error) toast.error('일괄 적용 실패');
    else {
      qc.invalidateQueries({ queryKey: ['e2e', 'stages'] });
      toast.success('트랙 내 모든 단계에 담당자 적용됨');
    }
  };

  const addStageToTrack = async (trackId: string, nextOrder: number) => {
    const maxStageNo = stages.reduce((m, s) => Math.max(m, s.stage_no), 0);
    const { error } = await supabase.from('e2e_stages').insert({
      stage_no: maxStageNo + 1,
      week_label: `+${maxStageNo + 1}`,
      title: '새 단계',
      current_state: '',
      progress_pct: 0,
      status: 'pending',
      sort_order: maxStageNo + 1,
      track_id: trackId,
      intra_track_order: nextOrder,
    });
    if (error) toast.error('추가 실패: ' + error.message);
    else qc.invalidateQueries({ queryKey: ['e2e', 'stages'] });
  };

  const addTrack = async () => {
    const title = window.prompt('새 트랙 이름을 입력하세요', '새 트랙');
    if (!title) return;
    const palette = ['#10B981', '#534AB7', '#E0A340', '#3B82F6', '#EC4899', '#06B6D4'];
    const nextSort = (tracks.reduce((m, t) => Math.max(m, t.sort_order ?? 0), 0)) + 1;
    const { error } = await supabase.from('e2e_tracks').insert({
      track_key: `track_${Date.now()}`,
      title,
      color: palette[nextSort % palette.length],
      sort_order: nextSort,
    });
    if (error) toast.error('트랙 추가 실패: ' + error.message);
    else {
      qc.invalidateQueries({ queryKey: ['e2e', 'tracks'] });
      toast.success('트랙이 추가되었습니다');
    }
  };

  const deleteTrack = async (trackId: string, title: string) => {
    if (!window.confirm(`"${title}" 트랙을 삭제하시겠습니까?\n트랙 내 모든 단계와 항목도 함께 삭제됩니다.`)) return;
    const trackStages = (stagesByTrack[trackId] || []);
    for (const s of trackStages) {
      await supabase.from('e2e_stage_items').delete().eq('stage_id', s.id);
    }
    await supabase.from('e2e_stages').delete().eq('track_id', trackId);
    const { error } = await supabase.from('e2e_tracks').delete().eq('id', trackId);
    if (error) toast.error('트랙 삭제 실패: ' + error.message);
    else {
      qc.invalidateQueries({ queryKey: ['e2e', 'tracks'] });
      qc.invalidateQueries({ queryKey: ['e2e', 'stages'] });
      toast.success('트랙이 삭제되었습니다');
    }
  };

  const refetchItems = () => qc.invalidateQueries({ queryKey: ['e2e', 'stage_items'] });

  const loading = stagesQ.isLoading || itemsQ.isLoading || kpisQ.isLoading || tracksQ.isLoading;

  return (
    <div className="min-h-screen -m-6 px-6 lg:px-8 py-6 md:py-8" style={{ background: '#FAF9F6' }}>
      <div className="w-full">
        {/* Page header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">E2E 8주 PoC 로드맵</h1>
            <p className="text-[13px] text-[#6B6B6B] mt-1">1사이클 자동화 PoC — Stage 1~8 / W1~W8</p>
            {phase0Closed && (
              <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-full text-[11px] font-semibold"
                style={{ background: '#E0F2EA', color: '#1D9E75' }}>
                <Check size={12} /> Phase 0 닫힘
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={addTrack}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-[12px] font-semibold text-[#1A1A1A] hover:bg-[#F5F2EA] transition-colors"
              style={{ borderColor: '#E5E2DA', background: '#fff' }}
            >
              <Plus size={14} /> 트랙 추가
            </button>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-[#8C8778]">전체 자동화율</div>
              <div className="text-[36px] font-bold leading-none mt-1" style={{ color: '#1A1A1A' }}>
                {overallPct}<span className="text-[20px] text-[#8C8778]">%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 전체 End to end 자동화 진척도 */}
        <div
          className="mb-4 px-4 py-3 rounded-lg border bg-white"
          style={{ borderColor: '#E5E2DA' }}
        >
          <div className="flex items-center justify-between gap-2 text-[12px] mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-[#1A1A1A] truncate">
                전체 End to end 자동화 진척도
              </span>
              <span className="text-[#8C8778]">·</span>
              <span className="text-[#6B6B6B] truncate">
                Stage 1~8 평균
                {factoryStats && (
                  <>
                    {' · '}factories {factoryStats.count}건
                    {factoryStats.lastScoredAt && (
                      <>
                        {' · '}마지막 스코어링{' '}
                        {Math.floor(
                          (Date.now() - new Date(factoryStats.lastScoredAt).getTime()) / 86400000
                        )}
                        일 전
                      </>
                    )}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-[#6B6B6B]">{stages.length}/8 단계</span>
              <span className="font-bold text-[#1A1A1A] text-[14px]">{overallPct}%</span>
            </div>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#F0EDE5' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${overallPct}%`,
                background: overallPct >= 100 ? '#3FA66A' : '#534AB7',
              }}
            />
          </div>
        </div>

        {/* 8-stage overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2 mb-6">
          {loading && stages.length === 0
            ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[108px] rounded-xl" />)
            : stages.map((stage) => {
              const progress = stage.progress_pct ?? 0;
              const stageItems = itemsByStage[stage.id] || [];
              const doneActions = stageItems.filter((item) => item.kind === 'action' && item.done).length;
              const totalActions = stageItems.filter((item) => item.kind === 'action').length;
              const statusColor = STATUS_DOT(stage.status);

              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`stage-${stage.id}`);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="bg-white border rounded-xl p-3 text-left transition-shadow hover:shadow-sm min-h-[108px]"
                  style={{ borderColor: '#E5E2DA' }}
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] font-bold text-[#1A1A1A]">Stage {stage.stage_no}</span>
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: statusColor }} />
                  </div>
                  <div className="text-[11px] text-[#8C8778] mb-1">{stage.week_label} · {STATUS_LABEL(stage.status)}</div>
                  <div className="text-[12px] font-semibold text-[#1A1A1A] leading-tight line-clamp-2 min-h-[32px]">
                    {stage.title}
                  </div>
                  <div className="flex items-center justify-between mt-3 mb-1">
                    <span className="text-[16px] font-bold tabular-nums text-[#1A1A1A]">{progress}%</span>
                    <span className="text-[10px] text-[#8C8778]">{doneActions}/{totalActions || 0}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE5' }}>
                    <div className="h-full transition-all" style={{ width: `${progress}%`, background: statusColor }} />
                  </div>
                </button>
              );
            })}
        </div>

        {/* Track columns: 등록 변환 트랙(sort_order >= 4)은 매칭·AI 학습(3) 컬럼 아래에 스택 */}
        {(() => {
          const renderTrack = (t: Track) => (
            <TrackColumn
              key={t.id}
              track={t}
              stages={stagesByTrack[t.id] || []}
              itemsByStage={itemsByStage}
              refetchItems={refetchItems}
              onProgressMaybeChanged={recomputeStageProgress}
              onUpdateTrack={updateTrack}
              onAddStage={addStageToTrack}
              onCascadeOwner={cascadeOwnerToStages}
              onDeleteTrack={deleteTrack}
            />
          );
          if (loading && tracks.length === 0) {
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[400px] rounded-xl" />)}
              </div>
            );
          }
          const topTracks = tracks.filter((t) => (t.sort_order ?? 0) <= 3);
          const stackedTracks = tracks.filter((t) => (t.sort_order ?? 0) >= 4);
          // 마지막 컬럼(매칭·AI 학습)에 등록 변환 트랙들을 아래로 쌓는다
          const lastTopTrack = topTracks[topTracks.length - 1];
          const otherTopTracks = topTracks.slice(0, -1);
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {otherTopTracks.map(renderTrack)}
              {lastTopTrack && (
                <div className="flex flex-col gap-4">
                  {renderTrack(lastTopTrack)}
                  {stackedTracks.map(renderTrack)}
                </div>
              )}
              {!lastTopTrack && stackedTracks.map(renderTrack)}
            </div>
          );
        })()}

        {/* Orphan stages (no track assigned) */}
        {(stagesByTrack['__none__'] || []).length > 0 && (
          <div className="mt-6">
            <div className="text-[11px] uppercase tracking-wider text-[#8C8778] mb-2">트랙 미지정</div>
            <div className="space-y-3">
              {stagesByTrack['__none__'].map((s) => (
                <StageCard
                  key={s.id}
                  stage={s}
                  items={itemsByStage[s.id] || []}
                  refetch={refetchItems}
                  onProgressMaybeChanged={recomputeStageProgress}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
