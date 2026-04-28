import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AssigneeBadge, TeamManageModal, useTeamMembers,
} from '@/components/progress/assignee';

type Project = {
  id: string;
  display_order: number;
  number_label: string | null;
  name: string;
  owner_id: string | null;
};

type ProjectItem = {
  id: string;
  project_id: string;
  category: 'done' | 'blocker' | 'next';
  content: string;
  assignee_id: string | null;
  display_order: number;
};

const CAT_COLOR: Record<ProjectItem['category'], { label: string; color: string; bg: string }> = {
  done: { label: '완료', color: '#1D9E75', bg: '#E0F2EA' },
  blocker: { label: '막힘', color: '#C75450', bg: '#FBE3E1' },
  next: { label: '다음', color: '#534AB7', bg: '#EAE7F6' },
};

type Filter = 'all' | 'done' | 'blocker' | 'next';

export default function ProgressPeople() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [teamOpen, setTeamOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const { data: members = [], isLoading: loadingM } = useTeamMembers();

  const projectsQ = useQuery({
    queryKey: ['progress', 'projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id,display_order,number_label,name,owner_id').order('display_order');
      if (error) throw error;
      return (data || []) as Project[];
    },
  });

  const itemsQ = useQuery({
    queryKey: ['progress', 'items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_items').select('id,project_id,category,content,assignee_id,display_order').order('display_order');
      if (error) throw error;
      return (data || []) as ProjectItem[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel('progress-people')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'projects'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_items' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'items'] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members' },
        () => qc.invalidateQueries({ queryKey: ['progress', 'team_members'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const projects = projectsQ.data || [];
  const items = itemsQ.data || [];
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const passesFilter = (it: ProjectItem) => filter === 'all' || it.category === filter;

  const memberData = useMemo(() => {
    return members.map((m) => {
      const ownItems = items.filter((i) => i.assignee_id === m.id && passesFilter(i));
      const ownedProjectIds = projects.filter((p) => p.owner_id === m.id).map((p) => p.id);
      const seen = new Set(ownItems.map((i) => i.id));
      const projectItems = items.filter((i) => ownedProjectIds.includes(i.project_id) && !seen.has(i.id) && passesFilter(i));
      const all = [...ownItems, ...projectItems];

      const done = all.filter((i) => i.category === 'done').length;
      const blocker = all.filter((i) => i.category === 'blocker').length;
      const next = all.filter((i) => i.category === 'next').length;

      return { member: m, all, done, blocker, next };
    });
  }, [members, items, projects, filter]);

  const unassigned = items.filter((i) => !i.assignee_id && passesFilter(i));
  const loading = loadingM || projectsQ.isLoading || itemsQ.isLoading;

  const goToItem = (item: ProjectItem) => {
    navigate(`/progress#item-${item.id}`);
  };

  return (
    <div className="min-h-screen -m-6 p-6 md:p-8" style={{ background: '#FAF9F6' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">담당자별 진척도</h1>
            <p className="text-[13px] text-[#6B6B6B] mt-1">팀원별 담당 항목과 진척률</p>
          </div>
          <Button onClick={() => setTeamOpen(true)} className="shrink-0">
            <Users size={14} className="mr-1" /> + 팀원 추가
          </Button>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 mb-5 p-1 bg-white border rounded-lg w-fit" style={{ borderColor: '#E5E2DA' }}>
          {(['all', 'done', 'blocker', 'next'] as Filter[]).map((f) => {
            const labels: Record<Filter, string> = { all: '전체', done: '완료만', blocker: '막힘만', next: '다음액션만' };
            const colors: Record<Filter, string> = { all: '#1A1A1A', done: '#1D9E75', blocker: '#C75450', next: '#534AB7' };
            const active = filter === f;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="px-3 py-1.5 rounded-md text-[12px] font-medium transition-all"
                style={{
                  background: active ? colors[f] : 'transparent',
                  color: active ? '#fff' : '#6B6B6B',
                }}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>

        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[220px] rounded-xl" />)}
          </div>
        )}

        {!loading && members.length === 0 && (
          <div className="bg-white border rounded-xl p-12 text-center" style={{ borderColor: '#E5E2DA' }}>
            <div className="text-[40px] mb-3">👥</div>
            <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-1">먼저 팀원을 추가해 주세요</h3>
            <p className="text-[13px] text-[#6B6B6B] mb-4">팀원을 추가하면 담당자별 워크로드가 여기 표시됩니다.</p>
            <Button onClick={() => setTeamOpen(true)}>
              <Users size={14} className="mr-1" /> + 팀원 추가
            </Button>
          </div>
        )}

        {!loading && members.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {memberData.map(({ member, all, done, blocker, next }) => {
                const totalForBar = done + blocker + next;
                const pct = (n: number) => totalForBar === 0 ? 0 : (n / totalForBar) * 100;

                return (
                  <div key={member.id} className="bg-white border rounded-xl p-5 flex flex-col" style={{ borderColor: '#E5E2DA' }}>
                    <div className="flex items-start gap-3 mb-3">
                      <AssigneeBadge member={member} size="lg" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-bold text-[#1A1A1A] truncate">{member.name}</div>
                        {member.role && <div className="text-[11px] text-[#8C8778] mt-0.5 truncate">{member.role}</div>}
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-4 gap-1 mb-3 text-center">
                      <Stat label="담당" value={all.length} color="#1A1A1A" />
                      <Stat label="완료" value={done} color="#1D9E75" />
                      <Stat label="막힘" value={blocker} color="#C75450" />
                      <Stat label="다음" value={next} color="#534AB7" />
                    </div>

                    {/* Progress bar */}
                    <div className="rounded-full overflow-hidden flex mb-3" style={{ height: 5, background: '#F0EDE5' }}>
                      {done > 0 && <div style={{ width: `${pct(done)}%`, background: '#1D9E75' }} />}
                      {blocker > 0 && <div style={{ width: `${pct(blocker)}%`, background: '#C75450' }} />}
                      {next > 0 && <div style={{ width: `${pct(next)}%`, background: '#534AB7' }} />}
                    </div>

                    {/* Items list */}
                    <div className="flex-1 min-h-0">
                      {all.length === 0 ? (
                        <div className="text-center text-[12px] text-[#8C8778] py-6 px-2">
                          담당 항목 없음 · 프로젝트별 페이지에서 + 버튼으로 할당
                        </div>
                      ) : (
                        <ul className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
                          {all.map((it) => {
                            const cat = CAT_COLOR[it.category];
                            const proj = projectMap.get(it.project_id);
                            return (
                              <li
                                key={it.id}
                                onClick={() => goToItem(it)}
                                className="flex items-center gap-1.5 text-[12.5px] text-[#1A1A1A] cursor-pointer hover:bg-[#F4F1E8] rounded px-1.5 py-1 transition-colors"
                              >
                                <span
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
                                  style={{ background: '#EFEAE0', color: '#6B6B6B' }}
                                  title={proj?.name}
                                >{proj?.number_label || '?'}</span>
                                <span className="break-words flex-1 min-w-0">{it.content}</span>
                                <span
                                  className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={{ background: cat.bg, color: cat.color }}
                                >{cat.label}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unassigned section */}
            {unassigned.length > 0 && (
              <div className="bg-[#F4F1E8] border rounded-xl p-5 mt-3" style={{ borderColor: '#E5E2DA' }}>
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 32, height: 32, border: '1px dashed #C7C2B4', color: '#8C8778', fontSize: 14, fontWeight: 700 }}
                  >?</span>
                  <div>
                    <div className="text-[14px] font-bold text-[#6B6B6B] flex items-center gap-1.5">
                      <AlertCircle size={14} /> 미할당
                    </div>
                    <div className="text-[11px] text-[#8C8778]">담당자가 지정되지 않은 항목 {unassigned.length}개</div>
                  </div>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {unassigned.map((it) => {
                    const cat = CAT_COLOR[it.category];
                    const proj = projectMap.get(it.project_id);
                    return (
                      <li
                        key={it.id}
                        onClick={() => goToItem(it)}
                        className="flex items-center gap-1.5 text-[12.5px] text-[#6B6B6B] cursor-pointer hover:bg-white/60 rounded px-1.5 py-1 transition-colors"
                      >
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 bg-white text-[#8C8778]" title={proj?.name}>
                          {proj?.number_label || '?'}
                        </span>
                        <span className="break-words flex-1 min-w-0">{it.content}</span>
                        <span
                          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: cat.bg, color: cat.color }}
                        >{cat.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>

      <TeamManageModal open={teamOpen} onOpenChange={setTeamOpen} />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="px-1 py-1.5 rounded bg-[#FAF9F6]">
      <div className="text-[16px] font-bold leading-none" style={{ color }}>{value}</div>
      <div className="text-[10px] text-[#8C8778] mt-1">{label}</div>
    </div>
  );
}
