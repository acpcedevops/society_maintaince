import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSuperAuth } from '../../context/SuperAuthContext.jsx';
import { Icon, icons } from '../../components/Icon.jsx';

export default function SuperLayout() {
  const { admin, logout } = useSuperAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/super/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 lg:px-6">
          <Link to="/super" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 font-bold">
              P
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold">Platform Admin</p>
              <p className="text-[11px] text-slate-300">Society Management</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-slate-300 sm:inline">{admin?.email}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium transition hover:bg-white/20"
            >
              <Icon path={icons.logout} className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-4 lg:px-6">
          <NavLink
            to="/super"
            end
            className={({ isActive }) =>
              `-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
                isActive ? 'border-white text-white' : 'border-transparent text-slate-300 hover:text-white'
              }`
            }
          >
            Societies
          </NavLink>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 lg:px-6 lg:py-6">
        <Outlet />
      </main>
    </div>
  );
}
