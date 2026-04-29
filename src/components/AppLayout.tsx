import { ReactNode, useState } from 'react';
import angelWingsLogo from '@/assets/angel-wings.png';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { VendorKPIBar } from '@/components/VendorKPIBar';
import {
  LogOut, Menu, Bell, LayoutDashboard, Home, SlidersHorizontal,
  GitMerge, Settings, Shield, ChevronDown, ShoppingBag, Package, TrendingUp, Search, Activity, type LucideIcon,
} from 'lucide-react';
import { useIsAdmin } from '@/hooks/useIsAdmin';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { isDevelopmentAccessMode } from '@/lib/runtimeMode';

const GNB_HEIGHT = 56;

type NavEntry =
  | { type: 'single'; path: string; label: string; icon: LucideIcon }
  | { type: 'group'; label: string; icon: LucideIcon; adminOnly?: boolean; children: { path: string; label: string }[] };

const NAV_ITEMS: NavEntry[] = [
  { type: 'single', path: '/', label: '대시보드', icon: LayoutDashboard },
  { type: 'single', path: '/progress', label: '진척도', icon: Activity },
  {
    type: 'group', label: '소싱', icon: Home, children: [
      { path: '/factories/new', label: '공장 추가' },
      { path: '/factories', label: '공장 목록' },
      { path: '/factories/ranking', label: '공장 순위' },
      { path: '/scoring', label: '스코어링 설정' },
    ],
  },
  {
    type: 'group', label: '상품 목록', icon: ShoppingBag, children: [
      { path: '/products/target-fg', label: '타겟상품' },
      { path: '/products/sourceable-agent', label: '소싱가능상품' },
    ],
  },
  {
    type: 'group', label: '상품 탐색', icon: Search, children: [
      { path: '/trend', label: '트렌드 상품 탐색' },
      { path: '/ai-search', label: 'AI 상품 탐색' },
    ],
  },
  {
    type: 'group', label: 'FASHIONGO', icon: GitMerge, children: [
      { path: '/ai-vendors', label: "Angel 's vendor" },
      { path: '/settings/pricing', label: 'Setting' },
      { path: '/settings/alibaba', label: 'Alibaba' },
    ],
  },
  {
    type: 'group', label: '마스터 전용', icon: Shield, adminOnly: true, children: [
      { path: '/admin/ai-training', label: 'AI 학습 관리' },
      { path: '/admin/ai-tools', label: 'AI Tool 연결' },
      { path: '/admin/accounts', label: '계정 관리' },
    ],
  },
];

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  '/ai-search': { title: 'AI 상품 탐색', description: '이미지/텍스트 상품 검색, 트렌드 기반 타겟 상품 찾기 등이 가능합니다.' },
  '/factories/new': { title: '공장 추가', description: 'url을 입력하면 AI Agent가 자동으로 정보를 수집합니다.' },
  '/factories': { title: '공장 목록', description: '등록된 모든 공장 정보를 한눈에 확인하세요.' },
  '/products/target-fg': { title: 'FashionGo 소싱 타깃', description: 'FashionGo에서 가져온 소싱 타깃 상품 목록' },
  '/products/target-other': { title: 'SNS/타 사이트 소싱 타깃', description: 'SNS, 타 사이트에서 수집한 소싱 타깃 상품 목록' },
  '/products/sourceable-agent': { title: 'Agent 추출 상품', description: 'Angel Agent가 검증된 공장에서 자동 추출한 소싱 가능 상품' },
  '/products/sourceable-csv': { title: 'CSV 업로드 상품', description: '유저가 CSV 파일로 직접 등록한 소싱 가능 상품' },
  '/scoring': { title: '스코어링 설정', description: 'AI가 공장을 평가할 때 사용하는 기준과 가중치를 관리합니다.' },
  '/ai-vendors': { title: '', description: '' },
  
  '/settings/pricing': { title: '설정', description: '1688, Alibaba 원가를 FashionGo 판매가로 자동 변환하는 기준을 설정합니다.' },
  '/settings/alibaba': { title: 'Alibaba Connections', description: 'Connect and manage your Alibaba shop accounts for data sync.' },
  '/admin/ai-training': { title: 'AI 학습 관리', description: 'AI 스코어링 모델의 교정 데이터 수집, Fine-tuning, 모델 버전 관리' },
  '/admin/ai-tools': { title: 'AI Tool 연결', description: '각 기능별로 사용할 AI Provider(Gemini, Vertex AI, fal.ai 등)를 관리합니다.' },
  '/admin/accounts': { title: '계정 관리', description: '사용자 역할 관리 및 마스터 계정 설정' },
};

function getUserInitials(email?: string) {
  if (!email) return '??';
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

const GlobalNavBar = () => {
  const { user } = useAuth();
  const { data: latestVersion } = useQuery({
    queryKey: ['latest-model-version-header'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_model_versions')
        .select('internal_version')
        .eq('status', 'ACTIVE')
        .limit(1)
        .maybeSingle();
      if (data?.internal_version) return data.internal_version as string;
      // fallback: get latest by created_at
      const { data: fallback } = await supabase
        .from('ai_model_versions')
        .select('internal_version')
        .not('internal_version', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (fallback?.internal_version as string) || null;
    },
    staleTime: 60_000,
    retry: 3,
  });
  return (
    <header
      className="fixed top-0 left-0 right-0 flex items-center"
      style={{ height: GNB_HEIGHT, background: '#1a1a2e', padding: '0 24px', zIndex: 100 }}
    >
      <div className="flex items-center" style={{ gap: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', letterSpacing: '2px', textTransform: 'uppercase' as const, fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif" }}>
          Angel Program
        </span>
        <span style={{ fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.55)', marginLeft: 12, fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif" }}>
          with FASHIONGO
        </span>
        <img src={angelWingsLogo} alt="Angel Wings" style={{ height: 18, marginLeft: 6, filter: 'invert(1)', opacity: 0.75 }} />
        {latestVersion && (
          <span style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.65)', marginLeft: 12, background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '2px 10px', border: '1px solid rgba(255,255,255,0.1)' }}>
            {latestVersion}
          </span>
        )}
      </div>
      <div className="ml-auto flex items-center" style={{ gap: 10 }}>
        <button
          className="flex items-center justify-center shrink-0"
          style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', transition: 'background 0.15s' }}
        >
          <Bell size={15} color="rgba(255,255,255,0.75)" />
        </button>
        <div
          className="flex items-center justify-center shrink-0 select-none"
          style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', fontSize: 11, fontWeight: 600, color: '#ffffff', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          {getUserInitials(user?.email)}
        </div>
      </div>
    </header>
  );
};

const Divider = () => (
  <div style={{ height: 1, background: 'hsl(210 14% 93%)', margin: '8px 16px' }} />
);

const ICON_DEFAULT = { color: '#8c9196', transition: 'color 0.15s' };
const ICON_ACTIVE = { color: '#2563eb', transition: 'color 0.15s' };
const ICON_OPEN = { color: '#1a1a2e', transition: 'color 0.15s' };

/* ---------- Sub-item (NO icon) ---------- */
const SubNavItem = ({ path, label, isActive, onClick }: { path: string; label: string; isActive: boolean; onClick?: () => void }) => (
  <Link to={path} onClick={onClick}>
    <div
      className="flex items-center text-[13px] rounded-lg"
      style={{
        padding: isActive ? '7px 14px 7px 37px' : '7px 14px 7px 40px',
        borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
        margin: '1px 8px',
        background: isActive ? 'hsl(215 92% 95%)' : 'transparent',
        color: isActive ? '#2563eb' : '#64748b',
        fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'hsl(210 11% 96%)'; e.currentTarget.style.color = '#1e293b'; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; } }}
    >
      {label}
    </div>
  </Link>
);

/* ---------- Group header ---------- */
const GroupHeader = ({ label, icon: Icon, isOpen, isActive, onToggle }: {
  label: string; icon: LucideIcon; isOpen: boolean; isActive: boolean; onToggle: () => void;
}) => (
  <div
    onClick={onToggle}
    className="flex items-center gap-[10px] text-[13px] rounded-lg select-none"
    style={{
      padding: '8px 14px',
      margin: '1px 8px',
      fontWeight: 500,
      color: isOpen || isActive ? '#1e293b' : '#64748b',
      cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = 'hsl(210 11% 96%)';
      e.currentTarget.style.color = '#1e293b';
      const ic = e.currentTarget.querySelector('.nav-icon') as HTMLElement;
      if (ic && !isActive) ic.style.color = '#1e293b';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = isOpen || isActive ? '#1e293b' : '#64748b';
      const ic = e.currentTarget.querySelector('.nav-icon') as HTMLElement;
      if (ic && !isActive) ic.style.color = isOpen ? '#1e293b' : '#8c9196';
    }}
  >
    <Icon size={16} strokeWidth={1.6} className="nav-icon shrink-0" style={isActive ? ICON_ACTIVE : isOpen ? ICON_OPEN : ICON_DEFAULT} />
    <span className="flex-1 text-left">{label}</span>
    <ChevronDown
      size={13}
      strokeWidth={2}
      className="shrink-0 ml-auto"
      style={{
        color: '#cbd5e1',
        transition: 'transform 0.2s ease, color 0.15s',
        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
      }}
    />
  </div>
);

/* ---------- Single item ---------- */
const SingleNavItem = ({ path, label, icon: Icon, isActive, onClick }: {
  path: string; label: string; icon: LucideIcon; isActive: boolean; onClick?: () => void;
}) => (
  <Link to={path} onClick={onClick}>
    <div
      className="flex items-center gap-[10px] rounded-lg text-[13px]"
      style={{
        padding: isActive ? '8px 14px 8px 11px' : '8px 14px',
        borderLeft: isActive ? '3px solid #2563eb' : '3px solid transparent',
        margin: '1px 8px',
        background: isActive ? 'hsl(215 92% 95%)' : 'transparent',
        color: isActive ? '#2563eb' : '#64748b',
        fontWeight: isActive ? 500 : 400,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'hsl(210 11% 96%)';
          e.currentTarget.style.color = '#1e293b';
          const ic = e.currentTarget.querySelector('.nav-icon') as HTMLElement;
          if (ic) ic.style.color = '#1e293b';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#64748b';
          const ic = e.currentTarget.querySelector('.nav-icon') as HTMLElement;
          if (ic) ic.style.color = '#8c9196';
        }
      }}
    >
      <Icon size={16} strokeWidth={1.6} className="nav-icon shrink-0" style={isActive ? ICON_ACTIVE : ICON_DEFAULT} />
      {label}
    </div>
  </Link>
);

/* ---------- Sidebar ---------- */
const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useIsAdmin();

  const getInitialOpen = () => {
    const open: Record<string, boolean> = {};
    NAV_ITEMS.forEach((item) => {
      if (item.type === 'group') {
        open[item.label] = true;
      }
    });
    return open;
  };
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(getInitialOpen);

  const toggleGroup = (label: string, firstChildPath: string) => {
    const willOpen = !openGroups[label];
    setOpenGroups((prev) => ({ ...prev, [label]: willOpen }));
    if (willOpen) {
      navigate(firstChildPath);
      onNavigate?.();
    }
  };

  return (
    <div className="flex flex-col h-full" style={{ width: 240, background: '#ffffff', borderRight: '1px solid hsl(210 14% 91%)', padding: '12px 0', overflowY: 'auto' }}>
      <nav className="flex-1 overflow-auto">
        {NAV_ITEMS.map((item, idx) => {
          if (item.type === 'group' && item.adminOnly && !isAdmin && !isDevelopmentAccessMode) return null;

          const prevItem = NAV_ITEMS[idx - 1];
          const showDivider = idx > 0 && prevItem && !(prevItem.type === 'group' && prevItem.adminOnly && !isAdmin && !isDevelopmentAccessMode);

          if (item.type === 'single') {
            return (
              <div key={item.path}>
                {showDivider && <Divider />}
                <SingleNavItem
                  path={item.path}
                  label={item.label}
                  icon={item.icon}
                  isActive={location.pathname === item.path}
                  onClick={onNavigate}
                />
              </div>
            );
          }

          const isGroupActive = item.children.some((c) => location.pathname === c.path);
          const isOpen = openGroups[item.label] ?? false;

          return (
            <div key={item.label}>
              {showDivider && <Divider />}
              <GroupHeader
                label={item.label}
                icon={item.icon}
                isOpen={isOpen}
                isActive={isGroupActive}
                onToggle={() => toggleGroup(item.label, item.children[0].path)}
              />
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: isOpen ? 300 : 0,
                  transition: 'max-height 0.22s ease',
                }}
              >
                {item.children.map((child) => (
                  <SubNavItem
                    key={child.path}
                    path={child.path}
                    label={child.label}
                    isActive={location.pathname === child.path}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <Divider />
      <div className="px-4">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[11px] truncate flex-1" style={{ color: '#94a3b8' }}>{user?.email}</span>
          <LanguageSwitcher />
        </div>
        <button
          onClick={() => { onNavigate?.(); signOut(); }}
          className="flex items-center gap-2 px-2 py-2 text-[13px] w-full rounded-lg transition-all"
          style={{ color: '#64748b' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'hsl(210 11% 96%)'; e.currentTarget.style.color = '#1e293b'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
        >
          <LogOut className="w-3.5 h-3.5" />
          로그아웃
        </button>
      </div>
    </div>
  );
};

const PageHeader = () => {
  const location = useLocation();
  const pageInfo = PAGE_TITLES[location.pathname];
  if (!pageInfo) return null;
  return (
    <div className="mb-2">
      <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0f172a', marginBottom: 4, letterSpacing: '-0.02em' }}>{pageInfo.title}</h1>
      <p style={{ fontSize: 13, color: '#94a3b8', fontWeight: 400 }}>{pageInfo.description}</p>
    </div>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <GlobalNavBar />
        <div className="flex flex-col flex-1" style={{ paddingTop: GNB_HEIGHT }}>
          <header className="sticky border-b border-border bg-background" style={{ top: GNB_HEIGHT, zIndex: 40 }}>
            <div className="flex items-center gap-3 px-4 h-12">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="shrink-0 -ml-1 h-8 w-8">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 w-72">
                  <SidebarNav onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
              <div className="ml-auto flex items-center gap-2">
                <VendorKPIBar />
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-secondary/30">
            <div className="px-3 py-2 sm:px-4 sm:py-3 max-w-7xl mx-auto space-y-4">
              <PageHeader />
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GlobalNavBar />
      <div className="flex flex-1" style={{ paddingTop: GNB_HEIGHT }}>
        <aside className="shrink-0 sticky" style={{ top: GNB_HEIGHT, height: `calc(100vh - ${GNB_HEIGHT}px)` }}>
          <SidebarNav />
        </aside>
        <div className="flex-1 flex flex-col overflow-auto">
          <main className="flex-1 overflow-auto bg-secondary/30">
            <div className="px-3 py-3 md:px-4 md:py-4 lg:px-5 lg:py-4 xl:px-6 xl:py-5 2xl:px-8 2xl:py-6 max-w-7xl mx-auto space-y-4">
              <PageHeader />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AppLayout;
