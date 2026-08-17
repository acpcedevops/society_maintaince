import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { Spinner, Alert, statusBadge, inr, fmtDate, monthName, Badge } from "../components/ui";

export default function FlatDetails() {
  const [units, setUnits] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/units/summary").then((res) => setUnits(res.data.units)).catch((e) => setError(errMsg(e)));
  }, []);

  function selectUnit(id) {
    setSelectedId(id);
    setDetail(null);
    if (!id) return;
    setLoading(true);
    setError(null);
    api.get(`/units/${id}/details`).then((res) => setDetail(res.data)).catch((e) => setError(errMsg(e))).finally(() => setLoading(false));
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Individual Flat Details</h1>
      <p className="text-sm text-slate-500 mb-4">Select a flat to view its complete bill history and payment summary</p>

      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm font-medium text-slate-700">Select Flat</label>
        <select
          className="input w-64"
          value={selectedId}
          onChange={(e) => selectUnit(e.target.value)}
        >
          <option value="">-- Choose a flat --</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              Unit {u.unitNo} — {u.ownerName || "No owner"} {u.pendingCount > 0 ? `(${u.pendingCount} pending)` : "(cleared)"}
            </option>
          ))}
        </select>
      </div>

      {error && <Alert msg={error} />}
      {loading && <Spinner text="Loading flat details..." />}
      {!loading && detail && <DetailView detail={detail} />}
    </div>
  );
}

function DetailView({ detail }) {
  const { unit, bills, summary: s } = detail;
  const paidBills = bills.filter((b) => b.status === "PAID");
  const pendingBills = bills.filter((b) => b.status !== "PAID");

  return (
    <div>
      <div className="card mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold mb-1">Unit {unit.unitNo} — {unit.ownerName}</h2>
            <p className="text-slate-500 text-sm">
              {unit.bhk} &middot; Floor {unit.floor} &middot; {unit.sqft ? unit.sqft + " sq ft" : ""} &middot; {unit.occupants} occupant{unit.occupants !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex gap-3 text-center">
            <div className="bg-emerald-50 rounded-lg px-4 py-2">
              <p className="text-xs text-emerald-600">Collected</p>
              <p className="text-lg font-bold text-emerald-700">{inr(s.totalPaid)}</p>
            </div>
            <div className="bg-red-50 rounded-lg px-4 py-2">
              <p className="text-xs text-red-600">Pending</p>
              <p className="text-lg font-bold text-red-700">{inr(s.totalPending)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Owner / Member Info</h3>
          {unit.members.length === 0 ? (
            <p className="text-sm text-slate-400">No members registered</p>
          ) : (
            <div className="space-y-3">
              {unit.members.map((m) => (
                <div key={m.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                    {m.name?.charAt(0) || "?"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.name} {m.isOwner && <Badge tone="brand">Owner</Badge>}</p>
                    <p className="text-xs text-slate-500">{m.phone}{m.email ? " · " + m.email : ""}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Payment Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-slate-500">Bills generated</span><span className="font-medium">{s.totalBills}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-medium text-emerald-600">{s.paidCount} ({inr(s.totalPaid)})</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Pending</span><span className="font-medium text-red-600">{s.pendingCount} ({inr(s.totalPending)})</span></div>
            <div className="border-t border-slate-100 pt-2 flex justify-between"><span className="text-slate-500">Late fees (paid)</span><span className="font-medium text-amber-600">{inr(s.totalLateFeePaid)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Late fees (accruing)</span><span className="font-medium text-amber-600">{inr(s.totalLateFeePending)}</span></div>
            {unit.amountOverride && (
              <div className="border-t border-slate-100 pt-2 flex justify-between">
                <span className="text-slate-500">Custom maintenance</span>
                <span className="font-medium">{inr(unit.amountOverride)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {pendingBills.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-semibold text-red-700 mb-3">Pending Bills ({pendingBills.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b text-xs">
                  <th className="py-2 pr-4">Period</th>
                  <th className="py-2 pr-4">Maintenance</th>
                  <th className="py-2 pr-4">Late Fee</th>
                  <th className="py-2 pr-4">Total Due</th>
                  <th className="py-2 pr-4">Due Date</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingBills.map((b) => (
                  <tr key={b.id} className="border-b border-slate-50 bg-red-50/30">
                    <td className="py-2.5 pr-4 font-medium">{monthName(b.month)} {b.year}</td>
                    <td className="py-2.5 pr-4">{inr(b.amount)}</td>
                    <td className="py-2.5 pr-4">{b.lateFee > 0 ? <span className="text-amber-600">+{inr(b.lateFee)}</span> : <span className="text-slate-300">—</span>}</td>
                    <td className="py-2.5 pr-4 font-semibold text-red-700">{inr(b.total)}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{fmtDate(b.dueDate)}</td>
                    <td className="py-2.5">{statusBadge(b.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3 className="text-sm font-semibold text-emerald-700 mb-3">Paid Bills ({paidBills.length})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b text-xs">
                <th className="py-2 pr-4">Period</th>
                <th className="py-2 pr-4">Maintenance</th>
                <th className="py-2 pr-4">Late Fee</th>
                <th className="py-2 pr-4">Total Paid</th>
                <th className="py-2 pr-4">Paid On</th>
                <th className="py-2 pr-4">Method</th>
                <th className="py-2">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {paidBills.map((b) => (
                <tr key={b.id} className="border-b border-slate-50">
                  <td className="py-2.5 pr-4 font-medium">{monthName(b.month)} {b.year}</td>
                  <td className="py-2.5 pr-4">{inr(b.amount)}</td>
                  <td className="py-2.5 pr-4">{b.lateFee > 0 ? <span className="text-amber-600">+{inr(b.lateFee)}</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="py-2.5 pr-4 font-semibold text-emerald-700">{inr(b.total)}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{fmtDate(b.paidAt)}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{b.paymentMethod || "—"}</td>
                  <td className="py-2.5">
                    {b.invoiceNo && (
                      <a className="text-brand-600 text-xs font-medium hover:underline" href={`/api/invoices/${b.id}`} target="_blank" rel="noreferrer">
                        {b.invoiceNo}
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {paidBills.length === 0 && (
                <tr><td colSpan={7} className="py-4 text-center text-slate-400 text-sm">No bills paid yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
