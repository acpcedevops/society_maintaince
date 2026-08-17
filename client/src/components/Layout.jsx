import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h14V10" },
  { to: "/bills", label: "Bills & Payments", icon: "M9 12h6m-6 4h6m-6-8h6M4 4h16v16H4z" },
  { to: "/expenses", label: "Expenses", admin: true, icon: "M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" },
  { to: "/reports", label: "Reports & Audit", admin: true, icon: "M4 19V5m5 14V9m5 10V3m5 16v-7" },
  { to: "/complaints", label: "Complaints", icon: "M12 8v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" },
  { to: "/notices", label: "Notices", icon: "M3 4h18v12H3zM3 20h18M8 8h8" },
  { to: "/members", label: "Members & Units", admin: true, icon: "M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2m8-11a4 4 0 110-8 4 4 0 010 8zm9 11v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" },
  { to: "/flats", label: "Flat Details", admin: true, icon: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9zM9 22V12h6v10" },
];

function Icon({ d }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
      <path d={d} />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const visible = links.filter((l) => !l.admin || user?.role === "ADMIN");

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 bg-slate-900 text-slate-200 flex flex-col fixed h-full">
        <div className="px-5 py-5 border-b border-slate-800">
          <h1 className="font-bold text-lg text-white">Neev Plaza</h1>
          <p className="text-xs text-slate-400">Society Management</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {visible.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? "bg-brand-600 text-white" : "hover:bg-slate-800"
                }`
              }
            >
              <Icon d={l.icon} />
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-sm font-medium text-white">{user?.name}</p>
          <p className="text-xs text-slate-400 mb-2">{user?.role === "ADMIN" ? "Admin" : `Unit ${user?.unit?.unitNo || "—"}`}</p>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            className="btn-outline w-full !text-slate-200 !border-slate-700 !bg-slate-800 hover:!bg-slate-700"
          >
            Logout
          </button>
        </div>
      </aside>
      <main className="flex-1 ml-60 p-6">
        <Outlet />
      </main>
    </div>
  );
}
