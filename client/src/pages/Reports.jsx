import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { Spinner, Alert, inr, monthName } from "../components/ui";

export default function Reports() {
  const year = new Date().getFullYear();
  const [activeYear, setActiveYear] = useState(year);
  const [annual, setAnnual] = useState(null);
  const [dues, setDues] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/reports/annual?year=${activeYear}`).then((r) => setAnnual(r.data)).catch((e) => setError(errMsg(e)));
    api.get(`/reports/dues?year=${activeYear}`).then((r) => setDues(r.data)).catch((e) => setError(errMsg(e)));
  }, [activeYear]);

  useEffect(() => {
    api.get(`/reports/monthly?year=${activeYear}&month=${month}`).then((r) => setMonthly(r.data)).catch((e) => setError(errMsg(e)));
  }, [activeYear, month]);

  if (error) return <Alert msg={error} />;
  if (!annual || !dues || !monthly) return <Spinner />;

  const maxIncome = Math.max(...annual.incomeByMonth.map((r) => r.collected), 1);
  const maxSpent = Math.max(...annual.expenseByMonth.map((r) => r.amount), 1);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Reports & Audit</h1>
          <p className="text-sm text-slate-500">Year-by-year income from members and spending for the society</p>
        </div>
        <div className="flex gap-2">
          <a className="btn-outline" href={`/api/reports/annual?year=${activeYear}&format=csv`}>Export CSV</a>
          <a className="btn-primary" href={`/api/reports/annual?year=${activeYear}&format=pdf`}>Export Audit PDF</a>
        </div>
      </div>

      <div className="flex items-end gap-3 mb-6">
        <div>
          <label className="label">Financial Year</label>
          <select className="input w-40" value={activeYear} onChange={(e) => setActiveYear(Number(e.target.value))}>
            {[year - 2, year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Monthly Detail</label>
          <select className="input w-40" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase">Collected</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{inr(annual.totalCollected)}</p>
          <p className="text-xs text-slate-400 mt-1">Collection rate {annual.collectionRate}%</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase">Spent</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{inr(annual.totalSpent)}</p>
          <p className="text-xs text-slate-400 mt-1">{annual.expenseCount} expense entries</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase">Outstanding</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{inr(annual.outstanding)}</p>
        </div>
        <div className="card">
          <p className="text-xs font-medium text-slate-500 uppercase">Net Surplus</p>
          <p className={`text-2xl font-bold mt-1 ${annual.net >= 0 ? "text-brand-600" : "text-red-600"}`}>{inr(annual.net)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h2 className="font-semibold mb-4">Income by Month</h2>
          {annual.incomeByMonth.map((r) => (
            <div key={r.month} className="mb-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{monthName(r.month)}</span>
                <span>{inr(r.collected)} <span className="text-slate-400">/ {inr(r.billed)}</span></span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${Math.round((r.collected / maxIncome) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <h2 className="font-semibold mb-4">Expenses by Month</h2>
          {annual.expenseByMonth.map((r) => (
            <div key={r.month} className="mb-2">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{monthName(r.month)}</span>
                <span>{inr(r.amount)} <span className="text-slate-400">({r.count} entries)</span></span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-400" style={{ width: `${Math.round((r.amount / maxSpent) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="font-semibold mb-4">Monthly Summary — {monthName(month)} {activeYear}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-slate-500">Collected</p>
            <p className="text-lg font-bold text-emerald-600">{inr(monthly.income.collected)}</p>
            <p className="text-xs text-slate-400">{monthly.income.paidUnits}/{monthly.income.totalUnits} units paid</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Spent</p>
            <p className="text-lg font-bold text-red-600">{inr(monthly.expenses.spent)}</p>
            <p className="text-xs text-slate-400">{monthly.expenses.total} entries</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Net</p>
            <p className={`text-lg font-bold ${monthly.net >= 0 ? "text-brand-600" : "text-red-600"}`}>{inr(monthly.net)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Expense Breakdown</p>
            {Object.entries(monthly.expenses.byCategory).length === 0 && <p className="text-sm text-slate-400">—</p>}
            {Object.entries(monthly.expenses.byCategory).map(([cat, amt]) => (
              <p key={cat} className="text-xs text-slate-600">{cat}: {inr(amt)}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Member Dues — {activeYear}</h2>
          <a className="text-xs text-brand-600 font-medium" href={`/api/reports/dues?year=${activeYear}&format=csv`}>Download CSV</a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 pr-3">Owner</th>
                {Array.from({ length: 12 }, (_, i) => (
                  <th key={i} className="py-2 pr-1 text-center text-xs">{monthName(i + 1).slice(0, 3)}</th>
                ))}
                <th className="py-2 pr-1 text-right">Paid</th>
                <th className="py-2 text-right">Pending</th>
              </tr>
            </thead>
            <tbody>
              {dues.units.map((u) => (
                <tr key={u.unitNo} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-medium">{u.unitNo}</td>
                  <td className="py-2 pr-3">{u.ownerName}</td>
                  {u.months.map((m, i) => (
                    <td key={i} className="py-2 text-center">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full ${m === "PAID" ? "bg-emerald-500" : m === "PARTIAL" ? "bg-purple-400" : "bg-red-400"}`} title={m || "No bill"} />
                    </td>
                  ))}
                  <td className="py-2 text-right text-emerald-600 font-medium">{inr(u.paid)}</td>
                  <td className="py-2 text-right text-red-600 font-medium">{inr(u.pending)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
