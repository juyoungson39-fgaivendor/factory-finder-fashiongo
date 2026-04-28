import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Trash2, Check } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type TeamMember = {
  id: string;
  name: string;
  color: string | null;
  emoji: string | null;
  role: string | null;
  display_order: number | null;
  created_at: string;
};

const DEFAULT_COLOR = '#534AB7';
const PRESET_COLORS = ['#534AB7', '#1D9E75', '#D5A24F', '#C75450', '#3B82F6', '#EC4899', '#8B5CF6', '#0EA5E9'];

export function useTeamMembers() {
  return useQuery({
    queryKey: ['progress', 'team_members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members').select('*').order('display_order').order('created_at');
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
  });
}

/* ---------- AssigneeBadge ---------- */
export function AssigneeBadge({
  member, size = 'sm', empty = false, onClick, title,
}: {
  member?: TeamMember | null;
  size?: 'sm' | 'md' | 'lg';
  empty?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  title?: string;
}) {
  const dim = size === 'lg' ? 48 : size === 'md' ? 28 : 18;
  const fontSize = size === 'lg' ? 20 : size === 'md' ? 13 : 10;
  const color = member?.color || DEFAULT_COLOR;
  const text = member?.emoji || (member?.name ? member.name.charAt(0).toUpperCase() : '');

  if (empty || !member) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title || '담당자 지정'}
        className="inline-flex items-center justify-center rounded-full transition-all hover:scale-110 hover:bg-[#F0EDE5]"
        style={{
          width: dim,
          height: dim,
          border: '1px dashed #C7C2B4',
          color: '#B7B2A4',
        }}
      >
        <Plus size={Math.max(10, dim - 10)} strokeWidth={2} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={title || `${member.name}${member.role ? ' · ' + member.role : ''}`}
      className="inline-flex items-center justify-center rounded-full transition-all hover:scale-110 select-none shrink-0"
      style={{
        width: dim,
        height: dim,
        background: color,
        color: '#fff',
        fontSize,
        fontWeight: 700,
        boxShadow: '0 0 0 1.5px #fff',
      }}
    >
      {text}
    </button>
  );
}

/* ---------- AssigneePicker (popover trigger) ---------- */
export function AssigneePicker({
  value, onChange, size = 'sm',
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  size?: 'sm' | 'md' | 'lg';
}) {
  const { data: members = [] } = useTeamMembers();
  const [open, setOpen] = useState(false);
  const current = members.find((m) => m.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span className="inline-block">
          <AssigneeBadge member={current} size={size} empty={!current} />
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5 max-h-72 overflow-auto" align="end">
        <button
          onClick={() => { onChange(null); setOpen(false); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F4F1E8] text-left text-[13px]"
        >
          <span className="w-[22px] h-[22px] rounded-full border border-dashed border-[#C7C2B4] flex items-center justify-center text-[#B7B2A4]">
            <X size={11} />
          </span>
          <span className="text-[#6B6B6B]">담당자 없음</span>
          {!value && <Check size={13} className="ml-auto text-[#1D9E75]" />}
        </button>
        <div className="h-px bg-[#E5E2DA] my-1" />
        {members.length === 0 && (
          <div className="px-2 py-3 text-[12px] text-[#8C8778] text-center">팀원이 없습니다</div>
        )}
        {members.map((m) => (
          <button
            key={m.id}
            onClick={() => { onChange(m.id); setOpen(false); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[#F4F1E8] text-left text-[13px]"
          >
            <AssigneeBadge member={m} size="sm" />
            <span className="truncate">{m.name}</span>
            {m.role && <span className="text-[10px] text-[#8C8778] truncate">{m.role}</span>}
            {value === m.id && <Check size={13} className="ml-auto text-[#1D9E75]" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Stack of assignees for a project ---------- */
export function AssigneeStack({ members, max = 3 }: { members: TeamMember[]; max?: number }) {
  const visible = members.slice(0, max);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((m) => (
        <AssigneeBadge key={m.id} member={m} size="sm" />
      ))}
      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full text-[9px] font-bold"
          style={{
            width: 18, height: 18,
            background: '#E5E2DA', color: '#6B6B6B',
            boxShadow: '0 0 0 1.5px #fff',
          }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}

/* ---------- TeamManageModal ---------- */
export function TeamManageModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: members = [], refetch } = useTeamMembers();
  const qc = useQueryClient();
  const [draftName, setDraftName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<TeamMember | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['progress', 'team_members'] });
    refetch();
  };

  const addMember = async () => {
    const name = draftName.trim();
    if (!name) return;
    if (members.some((m) => m.name === name)) {
      toast.error('이미 같은 이름의 팀원이 있습니다');
      return;
    }
    const nextOrder = members.reduce((m, x) => Math.max(m, x.display_order || 0), 0) + 1;
    const color = PRESET_COLORS[members.length % PRESET_COLORS.length];
    const { error } = await supabase.from('team_members').insert({
      name, color, display_order: nextOrder,
    });
    if (error) toast.error('추가 실패: ' + error.message);
    else { setDraftName(''); invalidate(); }
  };

  const updateMember = async (id: string, patch: Partial<TeamMember>) => {
    const { error } = await supabase.from('team_members').update(patch).eq('id', id);
    if (error) toast.error('저장 실패');
    else invalidate();
  };

  const removeMember = async () => {
    if (!pendingDelete) return;
    const { error } = await supabase.from('team_members').delete().eq('id', pendingDelete.id);
    setPendingDelete(null);
    if (error) toast.error('삭제 실패: ' + error.message);
    else { toast.success('팀원 삭제됨'); invalidate(); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>팀원 관리</DialogTitle>
          </DialogHeader>

          <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
            {members.length === 0 && (
              <div className="text-center text-[13px] text-[#8C8778] py-6">아직 팀원이 없습니다</div>
            )}
            {members.map((m) => (
              <MemberRow key={m.id} member={m} onUpdate={updateMember} onDelete={() => setPendingDelete(m)} />
            ))}
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Input
              placeholder="팀원 이름"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMember(); } }}
            />
            <Button onClick={addMember}><Plus size={14} className="mr-1" /> 추가</Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>팀원 삭제</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-[#6B6B6B]">
            "{pendingDelete?.name}"을(를) 삭제합니다. 연결된 항목의 담당자는 자동으로 비워집니다.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>취소</Button>
            <Button variant="destructive" onClick={removeMember}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemberRow({
  member, onUpdate, onDelete,
}: {
  member: TeamMember;
  onUpdate: (id: string, patch: Partial<TeamMember>) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(member.name);
  const [emoji, setEmoji] = useState(member.emoji || '');
  const [role, setRole] = useState(member.role || '');
  const [color, setColor] = useState(member.color || DEFAULT_COLOR);

  return (
    <div className="flex items-center gap-2 p-2 rounded-lg border bg-white" style={{ borderColor: '#E5E2DA' }}>
      <Popover>
        <PopoverTrigger asChild>
          <button
            className="rounded-full shrink-0 hover:scale-110 transition"
            style={{ width: 36, height: 36, background: color, color: '#fff', fontWeight: 700, fontSize: 15 }}
          >
            {emoji || name.charAt(0).toUpperCase()}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-2" align="start">
          <div className="grid grid-cols-4 gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => { setColor(c); onUpdate(member.id, { color: c }); }}
                className="w-7 h-7 rounded-full hover:scale-110 transition"
                style={{ background: c, boxShadow: c === color ? '0 0 0 2px #1A1A1A' : 'none' }}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name !== member.name && name.trim() && onUpdate(member.id, { name: name.trim() })}
        className="h-8 text-[13px] flex-1"
        placeholder="이름"
      />
      <Input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value.slice(0, 2))}
        onBlur={() => emoji !== (member.emoji || '') && onUpdate(member.id, { emoji: emoji || null })}
        className="h-8 text-[13px] w-14 text-center"
        placeholder="🙂"
      />
      <Input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        onBlur={() => role !== (member.role || '') && onUpdate(member.id, { role: role || null })}
        className="h-8 text-[13px] w-24"
        placeholder="역할"
      />
      <button
        onClick={onDelete}
        className="p-1.5 text-[#8C8778] hover:text-[#C75450]"
        title="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
