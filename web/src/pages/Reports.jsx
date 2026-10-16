import { useCallback, useEffect, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { money, monthName, downloadCSV } from '../lib/format.js';
import StatCard from '../components/StatCard.jsx';
import Spinner from '../components/Spinner.jsx';

export default function Reports() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: res } = await api.get('/reports/dashboard', { params: { year } });
      setData(res.annual);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const exportCSV = () => {
    if (!data) return;
    const rows = [
      ['Month', 'Billed', 'Collected', 'Outstanding', 'Expenses'],
      ...data.incomeByMonth.map((row, i) => [
        monthName(row.month),
        row.billed,
        row.collected,
        row.outstanding,
        data.expenseByMonth[i]?.amount || 0,
      ]),
      [],
      ['Total', data.totalBilled, data.totalCollected, data.outstanding, data.totalSpent],
    ];
    downloadCSV(`reports_${year}.csv`, rows);
  };

  const exportPDF = () => {
    window.print();
  };

  const yearOptions = [new Date().getFullYear() - 2, new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  if (loading) return <Spinner label="Loading reports..." />;
  if (error) return <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>;
  if (!data) return null;

  const maxExpenseCat = Math.max(1, ...data.expenseByCategory.map((c) => c.amount));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reports &amp; Audit</h1>
          <p className="text-sm text-slate-400">Financial year {data.year}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn-outline" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="btn-outline" onClick={exportPDF}>
            Export Audit PDF
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Billed" value={data.totalBilled} accent="slate" />
        <StatCard label="Total Collected" value={data.totalCollected} accent="emerald" />
        <StatCard label="Total Spent" value={data.totalSpent} accent="amber" />
        <StatCard label="Net Surplus" value={data.net} accent="brand" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Monthly Detail</h3>
          <ul className="space-y-2 lg:hidden">
            {data.incomeByMonth.map((row, i) => (
              <li key={row.month} className="rounded-lg border border-slate-100 p-3">
                <p className="text-sm font-semibold text-slate-700">{monthName(row.month)}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="text-slate-400">Billed</dt>
                  <dd className="text-right font-medium text-slate-700">{money(row.billed)}</dd>
                  <dt className="text-slate-400">Collected</dt>
                  <dd className="text-right font-medium text-emerald-600">{money(row.collected)}</dd>
                  <dt className="text-slate-400">Outstanding</dt>
                  <dd className="text-right font-medium text-red-500">{money(row.outstanding)}</dd>
                  <dt className="text-slate-400">Expenses</dt>
                  <dd className="text-right font-medium text-slate-700">
                    {money(data.expenseByMonth[i]?.amount || 0)}
                  </dd>
                </dl>
              </li>
            ))}
            <li className="rounded-lg bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">Total</p>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">Billed</dt>
                <dd className="text-right font-medium text-slate-700">{money(data.totalBilled)}</dd>
                <dt className="text-slate-400">Collected</dt>
                <dd className="text-right font-medium text-emerald-700">{money(data.totalCollected)}</dd>
                <dt className="text-slate-400">Outstanding</dt>
                <dd className="text-right font-medium text-red-600">{money(data.outstanding)}</dd>
                <dt className="text-slate-400">Expenses</dt>
                <dd className="text-right font-medium text-slate-700">{money(data.totalSpent)}</dd>
              </dl>
            </li>
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Month</th>
                  <th className="th">Billed</th>
                  <th className="th">Collected</th>
                  <th className="th">Outstanding</th>
                  <th className="th">Expenses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.incomeByMonth.map((row, i) => (
                  <tr key={row.month}>
                    <td className="td font-medium">{monthName(row.month)}</td>
                    <td className="td">{money(row.billed)}</td>
                    <td className="td text-emerald-600">{money(row.collected)}</td>
                    <td className="td text-red-500">{money(row.outstanding)}</td>
                    <td className="td">{money(data.expenseByMonth[i]?.amount || 0)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className="td">Total</td>
                  <td className="td">{money(data.totalBilled)}</td>
                  <td className="td text-emerald-700">{money(data.totalCollected)}</td>
                  <td className="td text-red-600">{money(data.outstanding)}</td>
                  <td className="td">{money(data.totalSpent)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-700">Expense Breakdown</h3>
          {data.expenseByCategory.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No expenses recorded.</p>
          ) : (
            <ul className="space-y-3">
              {data.expenseByCategory
                .sort((a, b) => b.amount - a.amount)
                .map((c) => (
                  <li key={c.category}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{c.category}</span>
                      <span className="font-semibold text-slate-700">{money(c.amount)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-amber-400" style={{ width: `${(c.amount / maxExpenseCat) * 100}%` }} />
                    </div>
                  </li>
                ))}
            </ul>
          )}

          <div className="mt-5 rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500">Collection rate</span>
              <span className="font-bold text-brand-700">{data.collectionRate}%</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${data.collectionRate}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
