import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Logo from '@/components/Logo';
import { VendorKPIBar } from '@/components/VendorKPIBar';
import {
  LayoutDashboard, Plus, BarChart3, ShoppingBag, LogOut, List, Menu,
  ScanSearch, Sparkles, Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import LanguageSwitcher from '@/components/LanguageSwitcher';

const navGroups = [
  {
    label: '개요',
    items: [
      { path: '/', label: '대시보드', icon: LayoutDashboard },
    ],
  },
  {
    label: '① 소싱',
    items: [
      { path: '/ai-search', label: 'AI 상품 탐색', icon: ScanSearch },
      { path: '/factories/new', label: '공장 추가', icon: Plus },
      { path: '/factories', label: '공장 목록', icon: List },
    ],
  },
  {
    label: '② 검증',
    items: [
      { path: '/scoring', label: '스코어링 설정', icon: BarChart3 },
    ],
  },
  {
    label: '③ 매칭 & 등록',
    items: [
      { path: '/ai-vendors', label: 'AI Vendor 피드', icon: Sparkles },
      { path: '/fashiongo', label: 'FashionGo 등록', icon: ShoppingBag },
    ],
  },
  {
    label: '설정',
    items: [
      { path: '/settings/pricing', label: '설정', icon: Settings },
    ],
  },
];

const allNavItems = navGroups.flatMap(g => g.items.map(i => ({ ...i, group: g.label })));

const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  '/': { title: 'Dashboard', description: 'AI Vendor 에이전트 전체 현황' },
  '/ai-search': { title: 'AI 상품 탐색', description: '이미지 기반 벤더 상품 매칭' },
  '/factories/new': { title: '공장 추가', description: '새 공장 / 벤더 수동 등록' },
  '/factories': { title: '공장 목록', description: '등록된 전체 공장 관리' },
  '/scoring': { title: '스코어링', description: '공장 평가 기준 및 가중치 설정' },
  '/ai-vendors': { title: 'AI Vendor 피드', description: 'AI가 매칭한 벤더별 상품 피드' },
  '/fashiongo': { title: 'FashionGo', description: '트렌드 분석 · FG 등록 관리' },
  '/settings/pricing': { title: '가격 설정', description: '환율 · 마진율 · 기본가격 정책' },
};

const SidebarNav = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-3 border-b border-border">
        <Link to="/" onClick={onNavigate}>
          <Logo />
        </Link>
      </div>

      <nav className="flex-1 py-3 px-2.5 overflow-auto space-y-4">
        {navGroups.map((group) => {
          const isActive = group.items.some(i => location.pathname === i.path);
          return (
            <div key={group.label}>
              <p className={cn(
                'text-[10px] uppercase tracking-[0.15em] font-semibold px-2.5 mb-1.5',
                isActive ? 'text-primary' : 'text-muted-foreground/60'
              )}>
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map(({ path, label, icon: Icon }) => (
                  <Link key={path} to={path} onClick={onNavigate}>
                    <div
                      className={cn(
                        'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-colors',
                        location.pathname === path
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                      )}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      {label}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-border">
        <div className="flex items-center justify-between px-2.5 py-1.5">
          <span className="text-[11px] text-muted-foreground truncate flex-1">
            {user?.email}
          </span>
          <LanguageSwitcher />
        </div>
        <button
          onClick={() => { onNavigate?.(); signOut(); }}
          className="flex items-center gap-2 px-2.5 py-2 text-[13px] text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-secondary transition-colors"
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
  const navItem = allNavItems.find(i => i.path === location.pathname);

  if (!pageInfo) return null;

  return (
    <div className="flex items-center gap-3 mb-1">
      {navItem && (
        <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
          {navItem.group}
        </span>
      )}
      <div>
        <h1 className="text-lg font-bold tracking-tight leading-tight">{pageInfo.title}</h1>
        <p className="text-[12px] text-muted-foreground leading-tight">{pageInfo.description}</p>
      </div>
    </div>
  );
};

const AppLayout = ({ children }: { children: ReactNode }) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 border-b border-border bg-background">
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
            <Link to="/">
              <Logo size="sm" />
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <VendorKPIBar />
              <LanguageSwitcher />
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
    );
  }

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-56 border-r border-border flex flex-col shrink-0 bg-background">
        <SidebarNav />
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Global top bar – agent status only */}
        <header className="border-b border-border bg-background flex items-center px-6 shrink-0" style={{ height: '4.375rem' }}>
          <VendorKPIBar />
        </header>

        <main className="flex-1 overflow-auto bg-secondary/30">
          <div className="p-6 max-w-6xl mx-auto space-y-4">
            <PageHeader />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
