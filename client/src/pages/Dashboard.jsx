import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Stat, Spinner, Alert, statusBadge, inr, fmtDate } from "../components/ui";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const isAdmin = user.role === "ADMIN";

  useEffect(() => {
    if (!isAdmin) return;
    api
      .get("/reports/dashboard")
      .then((res) => setData(res.data))
      .catch((e) => setError(errMsg(e)));
  }, [isAdmin]);

  if (!isAdmin) return <MemberDashboard />;

  if (error) return <Alert msg={error} />;
  if (!data) return <Spinner />;

  const { annual, monthly, recentPayments, recentExpenses } = data;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Society Dashboard</h1>
      <p className="text-sm text-slate-500 mb-6">Overview for the current financial year</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Collected (FY)" value={inr(annual.totalCollected)} sub={`${annual.collectionRate}% collection rate`} tone="green" />
        <Stat label="Total Spent" value={inr(annual.totalSpent)} sub={`${annual.expenseCount} expense entries`} tone="red" />
        <Stat label="Outstanding Dues" value={inr(annual.outstanding)} sub="Unpaid maintenance" tone="amber" />
        <Stat label="Net Surplus" value={inr(annual.net)} tone="brand" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Payments</h2>
            <Link to="/bills" className="text-xs text-brand-600 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {recentPayments.length === 0 && <p className="text-sm text-slate-400">No payments yet</p>}
            {recentPayments.map((b) => (
              <div key={b.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                <div>
                  <span className="font-medium">Unit {b.unit.unitNo}</span>
                  <span className="text-slate-400 text-xs ml-2">Month {b.month}/{b.year}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-emerald-600 font-medium">{inr(b.amount)}</span>
                  <span className="text-xs text-slate-400">{fmtDate(b.paidAt)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Recent Expenses</h2>
            <Link to="/expenses" className="text-xs text-brand-600 font-medium">View all</Link>
          </div>
          <div className="space-y-2">
            {recentExpenses.length === 0 && <p className="text-sm text-slate-400">No expenses yet</p>}
            {recentExpenses.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
                <div>
                  <span className="font-medium">{e.vendor}</span>
                  <span className="text-slate-400 text-xs ml-2">{e.category.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-red-600 font-medium">{inr(e.amount)}</span>
                  <span className="text-xs text-slate-400">{fmtDate(e.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Stat label="Members" value={data.memberCount} />
        <Stat label="Units" value={data.unitCount} />
        <Stat label="Open Complaints" value={data.openComplaints} tone="red" />
        <Stat label="This Month Spent" value={inr(monthly.expenses.spent)} />
      </div>
    </div>
  );
}

function MemberDashboard() {
  const { user } = useAuth();
  const [bills, setBills] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [notices, setNotices] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([api.get("/bills"), api.get("/complaints"), api.get("/notices")])
      .then(([b, c, n]) => {
        setBills(b.data.bills);
        setComplaints(c.data.complaints);
        setNotices(n.data.notices);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  if (error) return <Alert msg={error} />;
  if (!bills) return <Spinner />;

  const pending = bills.filter((b) => b.status === "PENDING" || b.status === "OVERDUE");
  const paid = bills.filter((b) => b.status === "PAID");
  const due = pending.reduce((s, b) => s + b.amount, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Welcome, {user.name}</h1>
      <p className="text-sm text-slate-500 mb-6">Unit {user.unit?.unitNo || "—"} · Owner: {user.unit?.ownerName || "—"}</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <Stat label="Outstanding Dues" value={inr(due)} sub={`${pending.length} unpaid month(s)`} tone={due > 0 ? "red" : "green"} />
        <Stat label="Paid this year" value={inr(paid.reduce((s, b) => s + b.amount, 0))} sub={`${paid.length} month(s) paid`} tone="green" />
        <Stat label="Open Complaints" value={complaints.filter((c) => c.status !== "CLOSED" && c.status !== "RESOLVED").length} />
      </div>

      {pending.length > 0 && (
        <div className="card mb-6 border-amber-200 bg-amber-50">
          <h2 className="font-semibold text-amber-800 mb-2">Payment Due</h2>
          <p className="text-sm text-amber-700 mb-4">
            You have outstanding maintenance of <b>{inr(due)}</b>. Please clear your dues to keep the society running smoothly.
          </p>
          <Link to="/bills" className="btn-primary">Pay Now</Link>
        </div>
      )}

      <div className="card mb-6">
        <h2 className="font-semibold mb-3">Recent Bills</h2>
        <div className="space-y-2">
          {bills.slice(0, 6).map((b) => (
            <div key={b.id} className="flex items-center justify-between text-sm border-b border-slate-100 pb-2">
              <div>
                <span className="font-medium">{b.month}/{b.year}</span>
                <span className="text-slate-400 ml-2">{inr(b.amount)}</span>
              </div>
              {statusBadge(b.status)}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Society Notices</h2>
        {notices.length === 0 && <p className="text-sm text-slate-400">No notices</p>}
        {notices.map((n) => (
          <div key={n.id} className="border-b border-slate-100 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0">
            <p className="font-medium text-sm">{n.title}</p>
            <p className="text-sm text-slate-600 mt-1">{n.body}</p>
            <p className="text-xs text-slate-400 mt-1">{fmtDate(n.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
