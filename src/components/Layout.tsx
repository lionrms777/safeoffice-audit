import { ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, History, PlusCircle, LogOut, ChevronLeft, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import Logo from './Logo';

interface LayoutProps {
  children: ReactNode;
  title: string;
  showBack?: boolean;
  onLogout?: () => void;
}

export default function Layout({ children, title, showBack, onLogout }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const navItems = [
    { icon: Home, label: 'Dashboard', path: '/' },
    { icon: PlusCircle, label: 'New Audit', path: '/audit/new' },
    { icon: History, label: 'History', path: '/history' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          {showBack ? (
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : (
            <Logo iconOnly className="md:hidden" />
          )}
          <h1 className="font-semibold text-lg truncate">{title}</h1>
        </div>
        
        <div className="flex items-center gap-2">
          <Logo className="hidden md:flex mr-4 scale-90" />
          {onLogout && (
            <button 
              onClick={onLogout}
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 md:pb-6 p-4 md:p-8 max-w-4xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-6 h-20 flex items-center justify-between z-40 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center gap-1 transition-colors",
                isActive ? "text-slate-900" : "text-slate-400"
              )}
            >
              <item.icon className={cn("w-6 h-6", isActive && "fill-slate-900/10")} />
              <span className="text-[10px] font-medium uppercase tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-slate-200 flex-col p-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all",
                  isActive 
                    ? "bg-slate-900 text-white shadow-md" 
                    : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
