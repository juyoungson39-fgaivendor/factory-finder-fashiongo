import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { VendorKPIBar } from '@/components/VendorKPIBar';
import { LogOut, Menu, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const GNB_HEIGHT = 56;

const navGroups = [
  [{ path: '/', label: '대시보드' }],
  [
    { path: '/factories/new', label: '공장 추가' },
    { path: '/factories', label: '공장 목록' },
    { path: '/products', label: '상품 목록' },
  ],
  [{ path: '/scoring', label: '스코어링 설정' }],
  [
    { path: '/ai-search', label: 'AI 상품 탐색' },
    { path: '/ai-vendors', label: 'AI Vendor 피드' },
    { path: '/fashiongo', label: 'FashionGo 등록' },
  ],
  [{ path: '/settings/pricing', label: '설정' }],
];

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  '/ai-search': { title: 'AI 상품 탐색', description: '이미지 또는 검색어로 AI Vendor 상품 DB에서 매칭 상품 및 공장을 찾습니다.' },
  '/factories/new': { title: '공장 추가', description: 'url을 입력하면 AI Agent가 자동으로 정보를 수집합니다.' },
  '/factories': { title: '공장 목록', description: '등록된 모든 공장 정보를 한눈에 확인하세요.' },
  '/products': { title: '상품 목록', description: '전체 상품 DB 관리 및 필터링' },
  '/scoring': { title: '스코어링 설정', description: 'AI가 공장을 평가할 때 사용하는 기준과 가중치를 관리합니다.' },
  '/ai-vendors': { title: 'AI Vendor 피드', description: 'AI가 선별한 벤더별 상품이 FashionGo 바이어 피드에 자동 연결됩니다.' },
  '/fashiongo': { title: 'FashionGo 등록', description: '트렌드 분석 →  공장 매칭 → 상품 등록까지 자동화' },
  '/settings/pricing': { title: '설정', description: '1688, Alibaba 원가를 FashionGo 판매가로 자동 변환하는 기준을 설정합니다.' },
};

function getUserInitials(email?: string) {
  if (!email) return '??';
  const name = email.split('@')[0];
  return name.slice(0, 2).toUpperCase();
}

const GlobalNavBar = () => {
  const { user } = useAuth();
  return (
    <header
      className="fixed top-0 left-0 right-0 flex items-center"
      style={{ height: GNB_HEIGHT, background: '#202223', padding: '0 20px', zIndex: 100 }}
    >
      <span style={{ fontSize: 14, fontWeight: 500, color: '#ffffff' }}>
        FashionGo AI Vendor
      </span>
      <div className="ml-auto flex items-center" style={{ gap: 8 }}>
        <button
          className="flex items-center justify-center shrink-0"
          style={{ width: 32, height: 32, borderRadius: 4, background: 'rgba(255,255,255,0.10)', border: 'none', cursor: 'pointer' }}
        >
          <Bell size={16} color="rgba(255,255,255,0.8)" />
        </button>
        <div
          className="flex items-center justify-center shrink-0 select-none"
          style={{ width: 32, height: 32, borderRadius: '50%', background: '#b9e3d0', fontSize: 11, fontWeight: 500, color: '#008060' }}
        >
          {getUserInitials(user?.email)}
        </div>
      </div>
    </header>
  );
};

const NavItem = ({ path, label, isActive, onClick }: { path: string; label: string; isActive: boolean; onClick?: () => void }) => (
  <Link to={path} onClick={onClick}>
    <div
      className={cn(
        'flex items-center gap-[10px] mx-1 rounded-[4px] text-[13px] transition-colors',
        isActive ? 'font-medium' : ''
      )}
      style={
        isActive
          ? { background: '#f2f7fe', color: '#2c6ecb', borderLeft: '3px solid #2c6ecb', padding: '8px 12px 8px 9px' }
          : { color: '#6d7175', padding: '8px 12px' }
      }
      onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = '#f1f2f3'; e.currentTarget.style.color = '#202223'; } }}
      onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6d7175'; } }}
    >
      <span
        className="shrink-0 rounded-[2px]"
        style={{ width: 14, height: 14, background: 'currentColor', opacity: isActive ? 1.0 : 0.4 }}
      />
      {label}
    </div>
  </Link>
);

const Divider = () => (
  <div style={{ height: 1, background: '#e1e3e5', margin: '8px 12px' }} />
);

const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="flex flex-col h-full" style={{ width: 220, background: '#ffffff', borderRight: '1px solid #e1e3e5', padding: '12px 0' }}>
      <nav className="flex-1 overflow-auto">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {gi > 0 && <Divider />}
            {group.map(({ path, label }) => (
              <NavItem key={path} path={path} label={label} isActive={location.pathname === path} onClick={onNavigate} />
            ))}
          </div>
        ))}
      </nav>

      <Divider />
      <div className="px-3">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[11px] truncate flex-1" style={{ color: '#6d7175' }}>{user?.email}</span>
          <LanguageSwitcher />
        </div>
        <button
          onClick={() => { onNavigate?.(); signOut(); }}
          className="flex items-center gap-2 px-2 py-2 text-[13px] w-full rounded-[4px] transition-colors"
          style={{ color: '#6d7175' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f2f3'; e.currentTarget.style.color = '#202223'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6d7175'; }}
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
    <div className="mb-1">
      <h1 style={{ fontSize: 20, fontWeight: 500, color: '#202223', marginBottom: 4 }}>{pageInfo.title}</h1>
      <p style={{ fontSize: 12, color: '#6d7175' }}>{pageInfo.description}</p>
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
            <div className="p-4 max-w-6xl mx-auto space-y-4">
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
        <div className="flex-1 flex flex-col overflow-hidden">
          <main className="flex-1 overflow-auto bg-secondary/30">
            <div className="p-6 max-w-6xl mx-auto space-y-4">
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
