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

function kpiProgress(k: Kpi) {
  if (k.direction === 'higher_better') {
    if (k.target_value <= 0) return 0;
    return Math.max(0, Math.min(100, (k.current_value / k.target_value) * 100));
  }
  // lower_better: 0 current = unknown (0%); else target/current capped 100
  if (k.current_value <= 0) return 0;
  return Math.max(0, Math.min(100, (k.target_value / k.current_value) * 100));
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

/* ---------- KPI Card ---------- */
function KpiCard({ kpi, onUpdate }: { kpi: Kpi; onUpdate: (id: string, patch: Partial<Kpi>) => Promise<void> }) {
  const satisfied = kpiSatisfied(kpi);
  const pct = kpiProgress(kpi);
  const color = kpi.direction === 'higher_better' ? '#1D9E75' : '#D5A24F';
  return (
    <div
      className="bg-white border rounded-xl p-4"
      style={{ borderColor: satisfied ? '#1D9E75' : '#E5E2DA' }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wider text-[#8C8778]">{kpi.label}</div>
        {satisfied && <Check size={14} className="text-[#1D9E75]" />}
      </div>
      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-[24px] font-bold leading-none" style={{ color: '#1A1A1A' }}>
          <InlineText
            value={String(kpi.current_value)}
            onSave={(v) => onUpdate(kpi.id, { current_value: Number(v) || 0 })}
          />
        </span>
        <span className="text-[12px] text-[#8C8778]">{kpi.unit}</span>
        <span className="text-[11px] text-[#B7B2A4] ml-auto">/ 목표 {kpi.target_value}{kpi.unit}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F0EDE5' }}>
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
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
          {stage.current_state !== null && (
            <div className="text-[12px] text-[#6B6B6B] mt-1.5 leading-relaxed">
              <InlineText
                value={stage.current_state || ''}
                onSave={(v) => updateStage({ current_state: v || null })}
                placeholder="현재 상태 입력"
                multiline
              />
            </div>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={cycleStatus}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold border transition-all hover:bg-[#F4F1E8]"
            style={{ borderColor: '#E5E2DA', color: '#1A1A1A' }}
            title="클릭으로 상태 변경"
          >
            <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
            {STATUS_LABEL[stage.status]}
          </button>
          <AssigneePicker value={stage.owner_id} onChange={(v) => updateStage({ owner_id: v })} size="sm" />
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

/* ---------- Mini-map (right side) ---------- */
function MiniMap({ stages, activeStageId }: { stages: Stage[]; activeStageId: string | null }) {
  return (
    <div className="bg-white border rounded-xl p-4 sticky top-4" style={{ borderColor: '#E5E2DA' }}>
      <div className="text-[11px] uppercase tracking-wider text-[#8C8778] mb-3">미니맵</div>
      <ol className="space-y-2.5">
        {stages.map((s) => {
          const active = s.id === activeStageId;
          const isCurrent = s.status === 'in_progress';
          return (
            <li key={s.id} className="flex items-center gap-2.5 text-[12px]">
              <span
                className={`inline-flex items-center justify-center w-6 h-6 rounded-full shrink-0 ${
                  isCurrent ? 'animate-pulse' : ''
                }`}
                style={{
                  background: STATUS_DOT[s.status],
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 10,
                  boxShadow: active ? '0 0 0 2px #1A1A1A' : 'none',
                }}
              >
                {s.stage_no}
              </span>
              <span className="text-[#6B6B6B] shrink-0 font-semibold w-12">{s.week_label}</span>
              <span className="text-[#1A1A1A] tabular-nums">{s.progress_pct ?? 0}%</span>
            </li>
          );
        })}
      </ol>
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

  // Live factory metrics for Stage 1 prefix + top banner
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

  const overallPct = useMemo(() => {
    if (stages.length === 0) return 0;
    const sum = stages.reduce((s, x) => s + (x.progress_pct ?? 0), 0);
    return Math.round(sum / stages.length);
  }, [stages]);

  const phase0Closed = kpis.length > 0 && kpis.every(kpiSatisfied);
  const activeStage = stages.find((s) => s.status === 'in_progress') || null;

  const updateKpi = async (id: string, patch: Partial<Kpi>) => {
    const { error } = await supabase.from('e2e_kpi').update(patch).eq('id', id);
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ['e2e', 'kpi'] });
  };

  const refetchItems = () => qc.invalidateQueries({ queryKey: ['e2e', 'stage_items'] });

  const loading = stagesQ.isLoading || itemsQ.isLoading || kpisQ.isLoading;

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
          <div className="text-right shrink-0">
            <div className="text-[10px] uppercase tracking-wider text-[#8C8778]">전체 자동화율</div>
            <div className="text-[36px] font-bold leading-none mt-1" style={{ color: '#1A1A1A' }}>
              {overallPct}<span className="text-[20px] text-[#8C8778]">%</span>
            </div>
          </div>
        </div>

        {/* Live factories banner */}
        {factoryStats && (
          <div
            className="mb-4 px-4 py-2.5 rounded-lg border flex items-center gap-2 text-[12px]"
            style={{
              borderColor: factoryStats.count === 0 ? '#C75450' : '#E5E2DA',
              background: factoryStats.count === 0 ? '#FCEEEC' : '#FFFFFF',
              color: factoryStats.count === 0 ? '#8B2F2C' : '#1A1A1A',
            }}
          >
            <span className="font-semibold">
              {factoryStats.count === 0 ? '⚠️ factories 0건' : `factories ${factoryStats.count}건 등록됨`}
            </span>
            <span className="text-[#8C8778]">·</span>
            <span className="text-[#6B6B6B]">
              마지막 스코어링:{' '}
              {factoryStats.lastScoredAt
                ? `${Math.floor((Date.now() - new Date(factoryStats.lastScoredAt).getTime()) / 86400000)}일 전`
                : '없음'}
            </span>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {loading && kpis.length === 0
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px] rounded-xl" />)
            : kpis.map((k) => <KpiCard key={k.id} kpi={k} onUpdate={updateKpi} />)}
        </div>

        {/* Main grid: stages + minimap */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
          <div className="space-y-3">
            {loading && stages.length === 0
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[200px] rounded-xl" />)
              : stages.map((s) => (
                <StageCard
                  key={s.id}
                  stage={s}
                  items={itemsByStage[s.id] || []}
                  refetch={refetchItems}
                  onProgressMaybeChanged={recomputeStageProgress}
                />
              ))}
          </div>
          <div className="hidden lg:block">
            <MiniMap stages={stages} activeStageId={activeStage?.id || null} />
          </div>
        </div>
      </div>
    </div>
  );
}
