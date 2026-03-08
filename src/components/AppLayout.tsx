import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo';
import {
  LayoutDashboard, Plus, Tags, BarChart3, ShoppingBag, LogOut, ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: '대시보드', icon: LayoutDashboard },
  { path: '/factories/new', label: '공장 추가', icon: Plus },
  { path: '/tags', label: '태그 관리', icon: Tags },
  { path: '/scoring', label: '스코어링', icon: BarChart3 },
  { path: '/fashiongo', label: 'FashionGo', icon: ShoppingBag },
];

const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border flex flex-col shrink-0">
        <div className="p-5 border-b border-border">
          <Link to="/">
            <Logo />
          </Link>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-0.5">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link key={path} to={path}>
              <div
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors',
                  location.pathname === path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <div className="px-3 py-2 text-[11px] text-muted-foreground truncate">
            {user?.email}
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 px-3 py-2 text-[13px] text-muted-foreground hover:text-foreground w-full rounded-md hover:bg-secondary transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            로그아웃
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto bg-secondary/30">
        <div className="p-8 max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
