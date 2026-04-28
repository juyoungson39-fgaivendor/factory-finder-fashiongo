import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AssigneeBadge, TeamManageModal, useTeamMembers, type TeamMember,
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

  // realtime
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

  // For each member: items they own (item-level) OR they own a project (project-level via owner_id)
  const memberData = useMemo(() => {
    return members.map((m) => {
      const ownItems = items.filter((i) => i.assignee_id === m.id && passesFilter(i));
      const ownedProjectIds = projects.filter((p) => p.owner_id === m.id).map((p) => p.id);
      // Combine: items assigned + items in projects this member owns (without dup)
      const seen = new Set(ownItems.map((i) => i.id));
      const projectItems = items.filter((i) => ownedProjectIds.includes(i.project_id) && !seen.has(i.id) && passesFilter(i));
      const all = [...ownItems, ...projectItems];

      const done = all.filter((i) => i.category === 'done').length;
      const blocker = all.filter((i) => i.category === 'blocker').length;
      const next = all.filter((i) => i.category === 'next').length;

      // Group by project
      const byProject = new Map<string, ProjectItem[]>();
      all.forEach((it) => {
        if (!byProject.has(it.project_id)) byProject.set(it.project_id, []);
        byProject.get(it.project_id)!.push(it);
      });
      return { member: m, all, done, blocker, next, byProject };
    });
  }, [members, items, projects, filter]);

  const totalItems = items.length;
  const unassigned = items.filter((i) => !i.assignee_id && passesFilter(i));
  const loading = loadingM || projectsQ.isLoading || itemsQ.isLoading;

  const goToProject = (projectId: string) => {
    navigate(`/progress#project-${projectId}`);
  };

  return (
    <div className="min-h-screen -m-6 p-6 md:p-8" style={{ background: '#FAF9F6' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">담당자별 진척도</h1>
            <p className="text-[13px] text-[#6B6B6B] mt-1">
              Factory Finder · Angel Program — 팀원별 워크로드와 진행 현황
            </p>
          </div>
          <Button variant="outline" onClick={() => setTeamOpen(true)} className="shrink-0">
            <Users size={14} className="mr-1" /> 팀원 관리
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

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[180px] rounded-xl" />)}
          </div>
        )}

        {/* Empty state */}
        {!loading && members.length === 0 && (
          <div
            className="bg-white border rounded-xl p-12 text-center"
            style={{ borderColor: '#E5E2DA' }}
          >
            <div className="text-[40px] mb-3">👥</div>
            <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-1">먼저 팀원을 추가해 주세요</h3>
            <p className="text-[13px] text-[#6B6B6B] mb-4">팀원을 추가하면 담당자별 워크로드가 여기 표시됩니다.</p>
            <Button onClick={() => setTeamOpen(true)}>
              <Users size={14} className="mr-1" /> 팀원 추가
            </Button>
          </div>
        )}

        {/* Member cards */}
        {!loading && members.length > 0 && (
          <div className="space-y-3">
            {memberData.map(({ member, all, done, blocker, next, byProject }) => {
              const totalForBar = done + blocker + next;
              const pct = (n: number) => totalForBar === 0 ? 0 : (n / totalForBar) * 100;
              const sharePct = totalItems === 0 ? 0 : Math.round((all.length / totalItems) * 100);

              return (
                <div
                  key={member.id}
                  className="bg-white border rounded-xl p-5"
                  style={{ borderColor: '#E5E2DA' }}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <AssigneeBadge member={member} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-bold text-[#1A1A1A]">{member.name}</div>
                      {member.role && <div className="text-[12px] text-[#8C8778] mt-0.5">{member.role}</div>}
                    </div>
                    <div className="text-right text-[12px] text-[#6B6B6B] flex items-center gap-3 shrink-0">
                      {blocker > 0 && (
                        <span className="flex items-center gap-1 text-[#C75450]">
                          <AlertCircle size={12} /> 막힘 {blocker}
                        </span>
                      )}
                      <span><span className="text-[#1D9E75] font-semibold">{done}</span> 완료</span>
                      <span><span className="text-[#534AB7] font-semibold">{next}</span> 다음</span>
                      <span className="text-[#1A1A1A] font-bold">합계 {all.length}</span>
                    </div>
                  </div>

                  {/* Segmented bar */}
                  <div className="rounded-full overflow-hidden flex mb-4" style={{ height: 6, background: '#F0EDE5' }}>
                    {done > 0 && <div style={{ width: `${pct(done)}%`, background: '#1D9E75' }} />}
                    {blocker > 0 && <div style={{ width: `${pct(blocker)}%`, background: '#C75450' }} />}
                    {next > 0 && <div style={{ width: `${pct(next)}%`, background: '#534AB7' }} />}
                  </div>

                  {all.length === 0 && (
                    <div className="text-center text-[12px] text-[#8C8778] py-4">현재 필터에서 배정된 항목이 없습니다</div>
                  )}

                  {/* Items grouped by project */}
                  <div className="space-y-3">
                    {Array.from(byProject.entries()).map(([pid, list]) => {
                      const proj = projectMap.get(pid);
                      if (!proj) return null;
                      return (
                        <div key={pid}>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8C8778] uppercase tracking-wider mb-1.5">
                            <span>{proj.number_label}</span>
                            <span className="text-[#1A1A1A] normal-case tracking-normal">{proj.name}</span>
                            <span className="text-[#B7B2A4]">· {list.length}개</span>
                          </div>
                          <ul className="space-y-1">
                            {list.map((it) => {
                              const cat = CAT_COLOR[it.category];
                              return (
                                <li
                                  key={it.id}
                                  onClick={() => goToProject(pid)}
                                  className="flex items-center gap-2 text-[13px] text-[#1A1A1A] cursor-pointer hover:bg-[#F4F1E8] rounded px-1.5 py-1 transition-colors"
                                >
                                  <span className="break-words flex-1 min-w-0">{it.content}</span>
                                  <span
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                                    style={{ background: cat.bg, color: cat.color }}
                                  >{cat.label}</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 pt-3 text-[11px] text-[#8C8778] border-t" style={{ borderColor: '#E5E2DA' }}>
                    전체 항목 {totalItems}개 중 이 팀원 비중 <span className="font-semibold text-[#1A1A1A]">{sharePct}%</span>
                  </div>
                </div>
              );
            })}

            {/* Unassigned section */}
            {unassigned.length > 0 && (
              <div
                className="bg-[#F4F1E8] border rounded-xl p-5"
                style={{ borderColor: '#E5E2DA' }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 32, height: 32, border: '1px dashed #C7C2B4', color: '#8C8778', fontSize: 14, fontWeight: 700 }}
                  >?</span>
                  <div>
                    <div className="text-[14px] font-bold text-[#6B6B6B]">미배정 항목</div>
                    <div className="text-[11px] text-[#8C8778]">담당자가 지정되지 않은 항목 {unassigned.length}개</div>
                  </div>
                </div>
                <ul className="space-y-1">
                  {unassigned.map((it) => {
                    const cat = CAT_COLOR[it.category];
                    const proj = projectMap.get(it.project_id);
                    return (
                      <li
                        key={it.id}
                        onClick={() => goToProject(it.project_id)}
                        className="flex items-center gap-2 text-[13px] text-[#6B6B6B] cursor-pointer hover:bg-white/60 rounded px-1.5 py-1 transition-colors"
                      >
                        <span className="text-[10px] text-[#8C8778] shrink-0">{proj?.number_label}</span>
                        <span className="break-words flex-1 min-w-0">{it.content}</span>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: cat.bg, color: cat.color }}
                        >{cat.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <TeamManageModal open={teamOpen} onOpenChange={setTeamOpen} />
    </div>
  );
}
