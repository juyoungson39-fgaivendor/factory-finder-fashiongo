import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, AlertCircle, Plus, Pencil, Trash2, FolderKanban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  AssigneeBadge, TeamManageModal, useTeamMembers,
} from '@/components/progress/assignee';

type Project = {
  id: string;
  display_order: number;
  number_label: string | null;
  name: string;
  owner_id: string | null;
  progress: number | null;
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

export default function ProgressPeople() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [teamOpen, setTeamOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const { data: members = [], isLoading: loadingM } = useTeamMembers();

  const projectsQ = useQuery({
    queryKey: ['progress', 'projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('projects').select('id,display_order,number_label,name,owner_id,progress').order('display_order');
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

  // Per-member aggregates
  const memberData = useMemo(() => {
    return members.map((m) => {
      const ownItems = items.filter((i) => i.assignee_id === m.id);
      const ownedProjectIds = projects.filter((p) => p.owner_id === m.id).map((p) => p.id);
      const seen = new Set(ownItems.map((i) => i.id));
      const projectItems = items.filter((i) => ownedProjectIds.includes(i.project_id) && !seen.has(i.id));
      const all = [...ownItems, ...projectItems];

      const done = all.filter((i) => i.category === 'done').length;
      const blocker = all.filter((i) => i.category === 'blocker').length;
      const next = all.filter((i) => i.category === 'next').length;

      // unique projects this member touches
      const projectIds = new Set<string>([
        ...ownedProjectIds,
        ...all.map((i) => i.project_id),
      ]);
      const projectCount = projectIds.size;
      const avgProgress = projectCount === 0 ? 0 : Math.round(
        Array.from(projectIds).reduce((sum, pid) => sum + (projectMap.get(pid)?.progress ?? 0), 0) / projectCount
      );

      const byProject = new Map<string, ProjectItem[]>();
      all.forEach((it) => {
        if (!byProject.has(it.project_id)) byProject.set(it.project_id, []);
        byProject.get(it.project_id)!.push(it);
      });
      return { member: m, all, done, blocker, next, byProject, projectCount, avgProgress };
    });
  }, [members, items, projects, projectMap]);

  const unassigned = items.filter((i) => !i.assignee_id);
  const loading = loadingM || projectsQ.isLoading || itemsQ.isLoading;

  const goToProject = (projectId: string) => navigate(`/progress#project-${projectId}`);

  const selected = memberData.find((d) => d.member.id === selectedId);

  const deleteMember = async (id: string, name: string) => {
    if (!confirm(`팀원 "${name}"을(를) 삭제할까요? 배정된 항목의 담당자는 해제됩니다.`)) return;
    const { error } = await supabase.from('team_members').delete().eq('id', id);
    if (error) {
      toast.error('삭제 실패: ' + error.message);
      return;
    }
    toast.success(`${name} 삭제됨`);
    if (selectedId === id) setSelectedId(null);
    qc.invalidateQueries({ queryKey: ['progress', 'team_members'] });
    qc.invalidateQueries({ queryKey: ['progress', 'items'] });
  };

  return (
    <div className="min-h-screen -m-6 p-6 md:p-8" style={{ background: '#FAF9F6' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-[24px] font-bold text-[#1A1A1A] tracking-tight">담당자별 진척도</h1>
            <p className="text-[13px] text-[#6B6B6B] mt-1">
              Factory Finder · Angel Program — 팀원별 워크로드와 진행 현황
            </p>
          </div>
          <Button onClick={() => setTeamOpen(true)} className="shrink-0 bg-[#1A1A1A] hover:bg-[#333] text-white">
            <Plus size={14} className="mr-1" /> 팀원 추가
          </Button>
        </div>

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[160px] rounded-xl" />)}
          </div>
        )}

        {!loading && members.length === 0 && (
          <div className="bg-white border rounded-xl p-12 text-center" style={{ borderColor: '#E5E2DA' }}>
            <div className="text-[40px] mb-3">👥</div>
            <h3 className="text-[16px] font-bold text-[#1A1A1A] mb-1">먼저 팀원을 추가해 주세요</h3>
            <p className="text-[13px] text-[#6B6B6B] mb-4">팀원을 추가하면 담당자별 워크로드가 여기 표시됩니다.</p>
            <Button onClick={() => setTeamOpen(true)}>
              <Plus size={14} className="mr-1" /> 팀원 추가
            </Button>
          </div>
        )}

        {!loading && members.length > 0 && (
          <>
            {/* Top: horizontal grid of member summary cards + unassigned warning */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
              {/* Unassigned warning card — first slot */}
              {unassigned.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setShowUnassigned(true); setSelectedId(null); }}
                  className="text-left bg-[#FBE3E1] border rounded-xl p-4 transition-all hover:shadow-md"
                  style={{
                    borderColor: showUnassigned ? '#C75450' : '#F0C9C5',
                    boxShadow: showUnassigned ? '0 0 0 2px #C7545033' : undefined,
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="text-[#C75450]" />
                    <span className="text-[12px] font-bold text-[#C75450] uppercase tracking-wider">미지정</span>
                  </div>
                  <div className="text-[28px] font-bold text-[#C75450] leading-none mb-1">{unassigned.length}<span className="text-[14px] ml-1">건</span></div>
                  <div className="text-[11px] text-[#8C5450]">담당자 없는 항목 — 클릭해서 보기</div>
                </button>
              )}

              {memberData.map(({ member, all, done, blocker, next, projectCount, avgProgress }) => {
                const active = selectedId === member.id;
                return (
                  <div
                    key={member.id}
                    className="group relative bg-white border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md"
                    style={{
                      borderColor: active ? member.color : '#E5E2DA',
                      boxShadow: active ? `0 0 0 2px ${member.color}33` : undefined,
                    }}
                    onClick={() => { setSelectedId(member.id); setShowUnassigned(false); }}
                  >
                    {/* hover edit/delete */}
                    <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setTeamOpen(true); }}
                        title="편집"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white/90 border hover:bg-white"
                        style={{ borderColor: '#E5E2DA' }}
                      >
                        <Pencil size={11} className="text-[#6B6B6B]" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); deleteMember(member.id, member.name); }}
                        title="삭제"
                        className="w-6 h-6 inline-flex items-center justify-center rounded-md bg-white/90 border hover:bg-[#FBE3E1]"
                        style={{ borderColor: '#E5E2DA' }}
                      >
                        <Trash2 size={11} className="text-[#C75450]" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2.5 mb-3">
                      <AssigneeBadge member={member} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold text-[#1A1A1A] truncate">{member.name}</div>
                        {member.role && <div className="text-[11px] text-[#8C8778] truncate">{member.role}</div>}
                      </div>
                    </div>

                    <div className="text-[22px] font-bold text-[#1A1A1A] leading-none mb-2">
                      {all.length}<span className="text-[12px] text-[#8C8778] font-medium ml-1">항목</span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] mb-2.5">
                      <span className="text-[#1D9E75] font-semibold">완료 {done}</span>
                      {blocker > 0 && (
                        <span className="text-[#C75450] font-semibold flex items-center gap-0.5">
                          <AlertCircle size={10} />막힘 {blocker}
                        </span>
                      )}
                      <span className="text-[#534AB7] font-semibold">다음 {next}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] pt-2.5 border-t" style={{ borderColor: '#F0EDE5' }}>
                      <span className="flex items-center gap-1 text-[#6B6B6B]">
                        <FolderKanban size={11} /> {projectCount}개 프로젝트
                      </span>
                      <span className="text-[#6B6B6B]">평균 <span className="font-semibold text-[#1A1A1A]">{avgProgress}%</span></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom: detail panel */}
            {!selected && !showUnassigned && (
              <div className="bg-white border rounded-xl p-8 text-center" style={{ borderColor: '#E5E2DA' }}>
                <div className="text-[13px] text-[#8C8778]">위 카드를 선택하면 그 팀원이 담당하는 항목이 프로젝트별로 표시됩니다.</div>
              </div>
            )}

            {selected && (
              <div className="bg-white border rounded-xl p-6" style={{ borderColor: '#E5E2DA' }}>
                <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: '#F0EDE5' }}>
                  <AssigneeBadge member={selected.member} size="lg" />
                  <div className="flex-1">
                    <div className="text-[18px] font-bold text-[#1A1A1A]">{selected.member.name}의 담당 항목</div>
                    <div className="text-[12px] text-[#6B6B6B] mt-0.5">총 {selected.all.length}개 · {selected.projectCount}개 프로젝트 · 평균 진행률 {selected.avgProgress}%</div>
                  </div>
                </div>

                {selected.all.length === 0 ? (
                  <div className="text-center text-[13px] text-[#8C8778] py-8">아직 배정된 항목이 없습니다.</div>
                ) : (
                  <div className="space-y-4">
                    {Array.from(selected.byProject.entries()).map(([pid, list]) => {
                      const proj = projectMap.get(pid);
                      if (!proj) return null;
                      return (
                        <div key={pid}>
                          <button
                            type="button"
                            onClick={() => goToProject(pid)}
                            className="flex items-center gap-2 mb-2 text-left hover:opacity-70 transition-opacity"
                          >
                            <span className="text-[11px] font-semibold text-[#8C8778] uppercase tracking-wider">{proj.number_label}</span>
                            <span className="text-[14px] font-bold text-[#1A1A1A]">{proj.name}</span>
                            <span className="text-[11px] text-[#B7B2A4]">· {list.length}개</span>
                          </button>
                          <ul className="space-y-1">
                            {list.map((it) => {
                              const cat = CAT_COLOR[it.category];
                              return (
                                <li
                                  key={it.id}
                                  onClick={() => goToProject(pid)}
                                  className="flex items-center gap-2 text-[13px] text-[#1A1A1A] cursor-pointer hover:bg-[#F4F1E8] rounded px-2 py-1.5 transition-colors"
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
                )}
              </div>
            )}

            {showUnassigned && (
              <div className="bg-white border rounded-xl p-6" style={{ borderColor: '#F0C9C5' }}>
                <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: '#F0EDE5' }}>
                  <span
                    className="inline-flex items-center justify-center rounded-full"
                    style={{ width: 40, height: 40, border: '1.5px dashed #C75450', color: '#C75450', fontSize: 16, fontWeight: 700 }}
                  >?</span>
                  <div className="flex-1">
                    <div className="text-[18px] font-bold text-[#C75450]">미지정 항목 {unassigned.length}건</div>
                    <div className="text-[12px] text-[#6B6B6B] mt-0.5">아래 항목을 클릭해 해당 프로젝트로 이동한 뒤 담당자를 지정하세요.</div>
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
                        className="flex items-center gap-2 text-[13px] text-[#6B6B6B] cursor-pointer hover:bg-[#F4F1E8] rounded px-2 py-1.5 transition-colors"
                      >
                        <span className="text-[10px] font-semibold text-[#8C8778] shrink-0 w-12">{proj?.number_label}</span>
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
          </>
        )}
      </div>

      <TeamManageModal open={teamOpen} onOpenChange={setTeamOpen} />
    </div>
  );
}
