import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, monthName, formatDate } from '../lib/format.js';
import StatCard from '../components/StatCard.jsx';
import Badge from '../components/Badge.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

export default function Dashboard() {
  const { isAdmin, user } = useAuth();
  return isAdmin ? <AdminDashboard /> : <MemberDashboard user={user} />;
}

function BarChart({ title, rows, valueKey, color }) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey]));
  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      <div className="flex h-40 items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.month} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t ${color}`}
              style={{ height: `${Math.max(2, (r[valueKey] / max) * 100)}%` }}
              title={`${monthName(r.month)}: ${money(r[valueKey])}`}
            />
            <span className="text-[10px] text-slate-400">{monthName(r.month).slice(0, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [data, setData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/reports/dashboard'), api.get('/expenses')])
      .then(([rep, exp]) => {
        setData(rep.data.annual);
        setExpenses(exp.data.expenses.slice(0, 5));
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Society Dashboard</h1>
        <p className="text-sm text-slate-400">Overview for the current financial year ({data.year})</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected (FY)" value={data.totalCollected} accent="emerald" />
        <StatCard label="Outstanding" value={data.outstanding} accent="red" />
        <StatCard label="Total Spent" value={data.totalSpent} accent="amber" />
        <StatCard label="Net Surplus" value={data.net} accent="brand" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BarChart title="Income by Month (collected)" rows={data.incomeByMonth} valueKey="collected" color="bg-brand-500" />
        <BarChart title="Expenses by Month" rows={data.expenseByMonth} valueKey="amount" color="bg-amber-400" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Billing Snapshot</h3>
            <Link to="/reports" className="text-xs font-semibold text-brand-600">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            <Row label="Total Billed" value={money(data.totalBilled)} />
            <Row label="Total Collected" value={money(data.totalCollected)} />
            <Row label="Outstanding" value={money(data.outstanding)} />
            <Row label="Collection rate" value={`${data.collectionRate}%`} />
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${data.collectionRate}%` }} />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Recent Expenses</h3>
            <Link to="/expenses" className="text-xs font-semibold text-brand-600">
              View all
            </Link>
          </div>
          {expenses.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No expenses yet</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {expenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{e.vendor}</p>
                    <p className="text-xs text-slate-400">
                      {e.category?.name} · {formatDate(e.date)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{money(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function MemberDashboard({ user }) {
  const [bills, setBills] = useState([]);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/bills'), api.get('/notices')])
      .then(([b, n]) => {
        setBills(b.data.bills);
        setNotices(n.data.notices.slice(0, 3));
      })
      .catch((err) => setError(apiError(err)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading your dashboard..." />;
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;

  const unpaid = bills.filter((b) => b.status !== 'PAID');
  const outstanding = unpaid.reduce((s, b) => s + b.totalAmount, 0);
  const paidCount = bills.filter((b) => b.status === 'PAID').length;
  const recent = bills.slice(0, 5);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">My Dashboard</h1>
        <p className="text-sm text-slate-400">
          {user?.unit ? `Unit ${user.unit.unitNo} · Floor ${user.unit.floor} · ${user.unit.bhk}` : 'Resident account'}
        </p>
      </div>

      {outstanding > 0 ? (
        <div className="card border-red-200 bg-red-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-red-700">
            <Icon path={icons.complaints} className="h-5 w-5" />
            You have outstanding maintenance of{' '}
            <span className="font-bold">{money(outstanding)}</span>
          </p>
        </div>
      ) : (
        <div className="card border-emerald-200 bg-emerald-50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Icon path={icons.check} className="h-4 w-4" /> All dues cleared
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Outstanding Dues" value={outstanding} accent="red" />
        <StatCard label="Bills Paid" value={paidCount} accent="emerald" moneyValue={false} hint={`of ${bills.length} bills`} />
        <StatCard label="Pending Bills" value={unpaid.length} accent="amber" moneyValue={false} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Recent Bills</h3>
            <Link to="/bills" className="text-xs font-semibold text-brand-600">
              View all
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No bills generated yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recent.map((b) => (
                <li key={b.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {monthName(b.month)} {b.year}
                    </p>
                    <p className="text-xs text-slate-400">Due {formatDate(b.dueDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-700">{money(b.totalAmount)}</span>
                    <Badge value={b.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Notice Board</h3>
            <Link to="/notices" className="text-xs font-semibold text-brand-600">
              View all
            </Link>
          </div>
          {notices.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No notices posted yet.</p>
          ) : (
            <ul className="space-y-3">
              {notices.map((n) => (
                <li key={n.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">{n.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDate(n.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
