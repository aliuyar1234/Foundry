/**
 * App Layout Component
 * Main application layout with navigation
 */

import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  GitBranch,
  Users,
  FileText,
  ClipboardCheck,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  Bell,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore, useUser } from '@/stores/authStore';

interface AppLayoutProps {
  children: ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard className="h-5 w-5" />,
  },
  {
    label: 'Data Sources',
    href: '/connectors',
    icon: <Database className="h-5 w-5" />,
  },
  {
    label: 'Discovery',
    href: '/discovery',
    icon: <GitBranch className="h-5 w-5" />,
    children: [
      { label: 'Processes', href: '/discovery/processes', icon: null },
      { label: 'Network', href: '/discovery/network', icon: null },
      { label: 'Insights', href: '/discovery/insights', icon: null },
    ],
  },
  {
    label: 'Preparation',
    href: '/preparation',
    icon: <Users className="h-5 w-5" />,
    children: [
      { label: 'Entity Records', href: '/preparation/entities', icon: null },
      { label: 'Duplicates', href: '/preparation/duplicates', icon: null },
    ],
  },
  {
    label: 'SOPs',
    href: '/sops',
    icon: <FileText className="h-5 w-5" />,
  },
  {
    label: 'Assessments',
    href: '/assessments',
    icon: <ClipboardCheck className="h-5 w-5" />,
  },
];

export function AppLayout({ children }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const logout = useAuthStore((state) => state.logout);

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (href: string) => location.pathname.startsWith(href);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 transform bg-card shadow-lg transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-16 items-center justify-between border-b px-4">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary" />
              <span className="text-lg font-semibold">EAIF</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(false)}
              className="rounded-lg p-1 hover:bg-muted lg:hidden"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-1">
              {navigation.map((item) => (
                <li key={item.label}>
                  {item.children ? (
                    <div>
                      <button
                        onClick={() => toggleExpanded(item.label)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive(item.href)
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <span className="flex items-center gap-3">
                          {item.icon}
                          {item.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 transition-transform',
                            expandedItems.includes(item.label) && 'rotate-180'
                          )}
                        />
                      </button>
                      {expandedItems.includes(item.label) && (
                        <ul className="ml-8 mt-1 space-y-1">
                          {item.children.map((child) => (
                            <li key={child.href}>
                              <Link
                                to={child.href}
                                className={cn(
                                  'block rounded-lg px-3 py-2 text-sm transition-colors',
                                  location.pathname === child.href
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                )}
                              >
                                {child.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive(item.href)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>

          {/* Settings & Logout */}
          <div className="border-t p-4">
            <Link
              to="/settings"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="h-5 w-5" />
              Settings
            </Link>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <LogOut className="h-5 w-5" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 hover:bg-muted lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4">
            <button className="relative rounded-lg p-2 hover:bg-muted">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
            </button>

            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="hidden sm:block">
                <p className="text-sm font-medium">{user?.name || user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
