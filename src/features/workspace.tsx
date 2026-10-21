'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  CalendarCheck2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Brand, ErrorState, Spinner } from '@/components/ui';
import type { UserDto } from '@/contracts';
import { Login } from './auth/login';
import { ApiError, api } from './shared/api';
import { WorkspaceProvider, useWorkspace } from './shared/workspace';
import { Shifts } from './shifts/shifts';
import { Credentials } from './credentials/credentials';
import { Timesheets } from './timesheets/timesheets';
import { Audit, Notifications, Overview } from './admin/admin';
type View =
  'shifts' | 'mine' | 'credentials' | 'timesheets' | 'overview' | 'audit' | 'notifications';
const navigation = [
  { view: 'overview' as const, title: 'Overview', icon: LayoutDashboard, roles: ['admin'] },
  {
    view: 'shifts' as const,
    title: 'Shift marketplace',
    icon: CalendarDays,
    roles: ['nurse', 'agency'],
  },
  { view: 'mine' as const, title: 'My shifts', icon: CalendarCheck2, roles: ['nurse'] },
  {
    view: 'credentials' as const,
    title: 'Credentials',
    icon: FileCheck2,
    roles: ['nurse', 'admin'],
  },
  {
    view: 'timesheets' as const,
    title: 'Timesheets',
    icon: ClipboardList,
    roles: ['nurse', 'agency', 'admin'],
  },
  { view: 'audit' as const, title: 'Audit trail', icon: Activity, roles: ['admin'] },
  { view: 'notifications' as const, title: 'Notifications', icon: Mail, roles: ['admin'] },
];
export function Workspace() {
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api<{ user: UserDto }>('/api/auth/me'),
    retry: false,
  });
  if (session.isPending)
    return (
      <div className="initial-loading">
        <Brand />
        <Spinner />
      </div>
    );
  if (session.error)
    return session.error instanceof ApiError && session.error.status === 401 ? (
      <Login />
    ) : (
      <main className="initial-loading">
        <Brand />
        <ErrorState error={session.error} retry={() => void session.refetch()} />
      </main>
    );
  return (
    <WorkspaceProvider user={session.data.user}>
      <Shell key={session.data.user.id} user={session.data.user} />
    </WorkspaceProvider>
  );
}
function Shell({ user }: { user: UserDto }) {
  const [view, setView] = useState<View>(user.role === 'admin' ? 'overview' : 'shifts');
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const client = useQueryClient();
  const { notify } = useWorkspace();
  async function logout() {
    setSigningOut(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      await client.cancelQueries();
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
      await client.resetQueries({ queryKey: ['session'] });
    } catch (err) {
      notify({ type: 'error', text: err instanceof Error ? err.message : 'Unable to sign out' });
      setSigningOut(false);
    }
  }
  const currentTitle = navigation.find((item) => item.view === view)?.title;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <strong>
              {user.role === 'admin'
                ? 'Operations workspace'
                : user.role === 'agency'
                  ? 'Agency workspace'
                  : 'Nurse workspace'}
            </strong>
            <small>ShiftPatch network</small>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {navigation
            .filter((item) => item.roles.includes(user.role))
            .map(({ view: itemView, title, icon: Icon }) => (
              <button
                key={itemView}
                className={`nav-item ${view === itemView ? 'active' : ''}`}
                aria-current={view === itemView ? 'page' : undefined}
                onClick={() => {
                  setView(itemView);
                  setMenuOpen(false);
                }}
              >
                <Icon size={19} />
                <span>
                  {title === 'Shift marketplace' && user.role === 'agency'
                    ? 'Agency shifts'
                    : title}
                </span>
                {view === itemView && <span className="nav-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="care-note">
            <span className="mini-icon">
              <ShieldCheck size={20} />
            </span>
            <strong>Connected by care.</strong>
            <p>
              One shared workspace.
              <br />A stronger care team.
            </p>
            <span className="care-note-line" />
          </div>
          <div className="user-card">
            <span className="avatar">
              {user.name
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user.name}</strong>
              <small>{user.role === 'admin' ? 'Administrator' : user.role}</small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              title="Sign out"
              disabled={signingOut}
              onClick={() => void logout()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>
              {currentTitle === 'Shift marketplace' && user.role === 'agency'
                ? 'Agency shifts'
                : currentTitle}
            </strong>
          </div>
          <span className="demo-badge">
            DEMO WORKSPACE <ArrowUpRight size={13} />
          </span>
        </header>
        <main id="main-content" tabIndex={-1} className="main-content">
          {view === 'shifts' && <Shifts />}
          {view === 'mine' && <Shifts mine />}
          {view === 'credentials' && <Credentials />}
          {view === 'timesheets' && <Timesheets />}
          {view === 'overview' && <Overview />}
          {view === 'audit' && <Audit />}
          {view === 'notifications' && <Notifications />}
          <footer className="workspace-footer">
            <span>ShiftPatch · Care starts with coverage.</span>
            <span>
              <ShieldCheck size={13} />
              Secure workspace
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
