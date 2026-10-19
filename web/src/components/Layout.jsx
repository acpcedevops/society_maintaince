import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { Icon, icons } from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';

const NAV = [
  { to: '/', label: 'Dashboard', icon: icons.dashboard, end: true },
  { to: '/bills', label: 'Bills & Payments', icon: icons.bills },
  { to: '/expenses', label: 'Expenses', icon: icons.expenses, admin: true },
  { to: '/reimbursements', label: 'Reimbursements', icon: icons.check },
  { to: '/reports', label: 'Reports & Audit', icon: icons.reports, admin: true },
  { to: '/complaints', label: 'Complaints', icon: icons.complaints },
  { to: '/notices', label: 'Notices', icon: icons.notices },
  { to: '/members', label: 'Members & Units', icon: icons.members, admin: true },
  { to: '/flats', label: 'Flat Details', icon: icons.flats, admin: true },
];

const GATE_NAV = { to: '/gate', label: 'Gate / Security', icon: icons.shield };

export default function Layout() {
  const { user, isAdmin, isGuard, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const items = isGuard
    ? [GATE_NAV]
    : [NAV[0], GATE_NAV, ...NAV.slice(1)].filter((item) => !item.admin || isAdmin);

  const roleLabel = isAdmin ? 'Administrator' : isGuard ? 'Security Guard' : user?.unit?.unitNo ? `Unit ${user.unit.unitNo}` : 'Member';
  const portalLabel = isAdmin ? 'Admin Portal' : isGuard ? 'Gate Portal' : 'Resident Portal';
  const chipLabel = isAdmin ? 'Admin' : isGuard ? 'Guard' : 'Member';

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-lg font-bold text-white">
          {(user?.society?.name || 'S').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-white">{user?.society?.name || 'Society'}</p>
          <p className="text-xs text-brand-100">Society Management</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? 'bg-white text-brand-700 shadow-sm'
                  : 'text-brand-100 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <Icon path={item.icon} className="h-5 w-5 flex-shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 px-4 py-4">
        <p className="truncate text-sm font-semibold text-white">{user?.name}</p>
        <p className="text-xs text-brand-100">{roleLabel}</p>
        <button
          onClick={handleLogout}
          className="mt-3 flex w-full items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          <Icon path={icons.logout} className="h-4 w-4" />
          Logout
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-shrink-0 bg-gradient-to-b from-brand-700 via-brand-600 to-brand-800 lg:block">
        {sidebar}
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-gradient-to-b from-brand-700 via-brand-600 to-brand-800">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <button className="btn-ghost p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Menu">
              <Icon path="M3 6h18M3 12h18M3 18h18" className="h-5 w-5" />
            </button>
            <div>
              <p className="text-sm font-semibold text-slate-700">Welcome, {user?.name?.split(' ')[0]}</p>
              <p className="text-xs text-slate-400">{portalLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 sm:inline">
              {chipLabel}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-5 lg:px-6 lg:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
