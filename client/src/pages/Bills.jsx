import { useEffect, useState, useCallback } from "react";
import api, { errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Spinner, Alert, statusBadge, inr, monthName, Modal, Field } from "../components/ui";

export default function Bills() {
  const { user } = useAuth();
  return user.role === "ADMIN" ? <AdminBills /> : <MemberBills />;
}

function MemberBills() {
  const { user } = useAuth();
  const [bills, setBills] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [razorpayActive, setRazorpayActive] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(() => {
    api.get("/bills").then((res) => setBills(res.data.bills)).catch((e) => setError(errMsg(e)));
  }, []);

  useEffect(() => {
    api.get("/config").then((res) => setRazorpayActive(res.data.razorpayConfigured)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  const pending = bills?.filter((b) => b.status === "PENDING" || b.status === "OVERDUE") || [];
  const selectedPending = bills?.filter((b) => selected.has(b.id)) || [];
  const selectedTotal = selectedPending.reduce((s, b) => s + (b.totalAmount || b.amount), 0);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === pending.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pending.map((b) => b.id)));
    }
  }

  async function paySingle(bill, online) {
    setBusyId(bill.id);
    setError(null);
    try {
      if (online) {
        const res = await api.post("/payments/create-order", { billId: bill.id });
        openRazorpay(res.data, bill, false);
      } else {
        await api.post("/payments/mock", { billId: bill.id });
        alert("Demo payment recorded.");
        load();
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  async function paySelected(online) {
    if (selectedPending.length === 0) return;
    setBusyId("bulk");
    setError(null);
    try {
      const ids = selectedPending.map((b) => b.id);
      if (online) {
        const res = await api.post("/payments/create-bulk-order", { billIds: ids });
        openRazorpay(res.data, null, true);
      } else {
        await api.post("/payments/mock-bulk", { billIds: ids });
        alert("Demo payment recorded for all selected bills.");
        setSelected(new Set());
        load();
      }
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  }

  function loadRazorpaySdk() {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) return resolve();
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Could not load Razorpay SDK."));
      document.body.appendChild(script);
    });
  }

  async function openRazorpay(order, bill, isBulk) {
    setError(null);
    try {
      await loadRazorpaySdk();
    } catch (e) {
      setError(e.message);
      setBusyId(null);
      return;
    }
    try {
      const description = isBulk
        ? `Neev Plaza - ${order.months || "Multiple months"}`
        : `Maintenance ${bill.month}/${bill.year}`;

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        name: "Neev Plaza Society",
        description,
        order_id: order.orderId,
        prefill: { name: user?.name, contact: user?.phone },
        handler: async (response) => {
          try {
            if (isBulk) {
              await api.post("/payments/verify-bulk", {
                billIds: selectedPending.map((b) => b.id),
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              alert(`Payment successful! ${selectedPending.length} bills paid.`);
              setSelected(new Set());
            } else {
              await api.post("/payments/verify", {
                billId: bill.id,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              });
              alert("Payment successful!");
            }
            load();
          } catch (e) {
            setError(errMsg(e));
          }
        },
        modal: { ondismiss: () => setBusyId(null) },
      });
      rzp.on("payment.failed", (r) => setError(`Payment failed: ${r.error?.description || "Unknown"}`));
      rzp.open();
    } catch (e) {
      setError(`Payment window could not open: ${e.message || "Unknown error"}`);
      setBusyId(null);
    }
  }

  if (error) return <Alert msg={error} />;
  if (!bills) return <Spinner />;

  const current = new Date();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">My Maintenance Bills</h1>
      <p className="text-sm text-slate-500 mb-6">
        {pending.length > 0 ? `You owe ${inr(pending.reduce((s, b) => s + (b.totalAmount || b.amount), 0))} in pending dues` : "All dues cleared"}
      </p>

      {selected.size > 0 && (
        <div className="mb-4 p-3 bg-brand-50 border border-brand-200 rounded-lg flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <b>{selected.size}</b> bill{selected.size > 1 ? "s" : ""} selected &mdash; Total: <b className="text-brand-700">{inr(selectedTotal)}</b>
          </div>
          <div className="flex gap-2">
            <button className="btn-primary !py-1.5" disabled={busyId === "bulk"} onClick={() => paySelected(true)}>
              {busyId === "bulk" ? "Processing..." : "Pay Selected"}
            </button>
            {!razorpayActive && (
              <button className="btn-outline !py-1.5" disabled={busyId === "bulk"} onClick={() => paySelected(false)}>
                Demo Pay All
              </button>
            )}
            <button className="text-xs text-slate-500 hover:text-slate-700 px-2" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              {pending.length > 0 && (
                <th className="py-2 pr-2 w-8">
                  <input type="checkbox" checked={selected.size === pending.length && pending.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
              )}
              <th className="py-2 pr-4">Period</th>
              <th className="py-2 pr-4">Maintenance</th>
              <th className="py-2 pr-4">Late Fee</th>
              <th className="py-2 pr-4">Total Due</th>
              <th className="py-2 pr-4">Due Date</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400">No bills generated yet.</td></tr>
            )}
            {bills.map((b) => {
              const isDue = b.status === "PENDING" || b.status === "OVERDUE";
              const isCurrent = b.month === current.getMonth() + 1 && b.year === current.getFullYear();
              const lateFee = b.lateFee || 0;
              return (
                <tr key={b.id} className={`border-b border-slate-100 ${selected.has(b.id) ? "bg-brand-50" : ""}`}>
                  {pending.length > 0 && (
                    <td className="py-3 pr-2">
                      {isDue && (
                        <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelect(b.id)} className="rounded" />
                      )}
                    </td>
                  )}
                  <td className="py-3 pr-4 font-medium">{monthName(b.month)} {b.year}</td>
                  <td className="py-3 pr-4">{inr(b.amount)}</td>
                  <td className="py-3 pr-4">
                    {lateFee > 0 ? <span className="text-amber-600">+{inr(lateFee)}</span> : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-3 pr-4 font-semibold">{inr(b.totalAmount || b.amount)}</td>
                  <td className="py-3 pr-4 text-slate-500">
                    {new Date(b.dueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                  </td>
                  <td className="py-3 pr-4">{statusBadge(b.status)}</td>
                  <td className="py-3">
                    {isDue ? (
                      <div className="flex gap-2">
                        <button className="btn-primary !py-1.5" disabled={busyId === b.id || busyId === "bulk"} onClick={() => paySingle(b, true)}>
                          {busyId === b.id ? "..." : `Pay ${isCurrent ? "Now" : ""}`}
                        </button>
                        {!razorpayActive && (
                          <button className="btn-outline !py-1.5" disabled={busyId === b.id || busyId === "bulk"} onClick={() => paySingle(b, false)}>
                            Demo Pay
                          </button>
                        )}
                      </div>
                    ) : (
                      <a className="text-brand-600 text-xs font-medium hover:underline" href={`/api/invoices/${b.id}`} target="_blank" rel="noreferrer">
                        Download Invoice
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Payments after the <b>15th</b> of each month attract a late fee of <b>Rs. 1 per day</b>, added automatically to your total.
        Select multiple pending bills to pay them all at once. Each bill gets its own invoice.
      </p>
    </div>
  );
}

function AdminBills() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [payModal, setPayModal] = useState(null);
  const [configModal, setConfigModal] = useState(false);
  const [form, setForm] = useState({ amount: "", method: "CASH" });
  const [config, setConfig] = useState(null);
  const [cfg, setCfg] = useState({ name: "", amount1bhk: "", amount2bhk: "", lateFeePerDay: "", dueDay: 15 });

  function load() {
    api.get("/bills/month/" + month + "/" + year).then((res) => setData(res.data)).catch((e) => setError(errMsg(e)));
  }
  useEffect(load, [month, year]);

  function openConfig() {
    api.get("/bills/config").then((res) => {
      const c = res.data.config;
      setCfg({
        name: c.name,
        amount1bhk: c.amount1bhk,
        amount2bhk: c.amount2bhk,
        lateFeePerDay: c.lateFeePerDay,
        dueDay: c.dueDay,
      });
      setConfig(c);
      setConfigModal(true);
    }).catch((e) => setError(errMsg(e)));
  }

  async function saveConfig(e) {
    e.preventDefault();
    try {
      await api.post("/bills/config", {
        name: cfg.name,
        amount1bhk: Number(cfg.amount1bhk),
        amount2bhk: Number(cfg.amount2bhk),
        lateFeePerDay: Number(cfg.lateFeePerDay),
        dueDay: Number(cfg.dueDay),
      });
      setConfigModal(false);
      alert("Maintenance settings saved.");
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  async function generate() {
    if (!confirm(`Generate maintenance bills for ${monthName(month)} ${year} for all units?`)) return;
    setError(null);
    try {
      const res = await api.post("/bills/generate", { month, year });
      alert(`${res.data.count} bill(s) created.`);
      load();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function recordOffline(e) {
    e.preventDefault();
    try {
      await api.post("/bills/offline-payment", { billId: payModal.id, amount: Number(form.amount), method: form.method });
      setPayModal(null);
      setForm({ amount: "", method: "CASH" });
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (error) return <Alert msg={error} />;
  if (!data) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Maintenance Bills</h1>
          <p className="text-sm text-slate-500">Track who has paid, month by month</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={openConfig}>Maintenance Settings</button>
          <button className="btn-primary" onClick={generate}>Generate Bills for Month</button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <Field label="Month">
          <select className="input w-44" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <select className="input w-32" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </Field>
        <div className="text-sm bg-white border border-slate-200 rounded-lg px-4 py-2">
          <span className="text-slate-500">Collected </span>
          <b className="text-emerald-600">{inr(data.summary.collected)}</b>
          <span className="text-slate-500 mx-2">· Pending </span>
          <b className="text-red-600">{inr(data.summary.pending)}</b>
          <span className="text-slate-500 mx-2">· {data.summary.paid}/{data.summary.totalBills} paid</span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">Unit</th>
              <th className="py-2 pr-4">Owner</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Maintenance</th>
              <th className="py-2 pr-4">Late Fee</th>
              <th className="py-2 pr-4">Total</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Method</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.bills.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400">No bills for this month. Click "Generate Bills for Month".</td></tr>
            )}
            {data.bills.map((b) => (
              <tr key={b.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 font-medium">Unit {b.unit.unitNo}</td>
                <td className="py-3 pr-4">{b.unit.ownerName}</td>
                <td className="py-3 pr-4 text-slate-500">{b.unit.bhk || "1BHK"}</td>
                <td className="py-3 pr-4">{inr(b.amount)}</td>
                <td className="py-3 pr-4">
                  {(b.lateFee || 0) > 0 ? <span className="text-amber-600">+{inr(b.lateFee)}</span> : <span className="text-slate-300">—</span>}
                </td>
                <td className="py-3 pr-4 font-semibold">{inr(b.totalAmount || b.amount)}</td>
                <td className="py-3 pr-4">{statusBadge(b.status)}</td>
                <td className="py-3 pr-4 text-slate-500">{b.paymentMethod || "—"}</td>
                <td className="py-3">
                  {b.status === "PAID" ? (
                    <a className="text-brand-600 text-xs font-medium hover:underline" href={`/api/invoices/${b.id}`} target="_blank" rel="noreferrer">
                      Invoice
                    </a>
                  ) : (
                    <button className="text-brand-600 text-xs font-medium hover:underline" onClick={() => { setPayModal(b); setForm({ amount: b.totalAmount || b.amount, method: "CASH" }); }}>
                      Record Offline Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!payModal} onClose={() => setPayModal(null)} title={`Offline Payment - Unit ${payModal?.unit?.unitNo || ""}`}>
        <form onSubmit={recordOffline}>
          {payModal && (payModal.lateFee || 0) > 0 && (
            <p className="text-xs text-amber-700 mb-2">
              Maintenance {inr(payModal.amount)} + late fee {inr(payModal.lateFee)} = <b>{inr(payModal.totalAmount)}</b>
            </p>
          )}
          <Field label="Amount Received (Rs.)">
            <input className="input" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
          <Field label="Method">
            <select className="input" value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {["CASH", "CHEQUE", "UPI", "BANK_TRANSFER", "OTHER"].map((m) => <option key={m}>{m}</option>)}
            </select>
          </Field>
          <button className="btn-primary w-full mt-2">Record Payment</button>
        </form>
      </Modal>

      <Modal open={configModal} onClose={() => setConfigModal(false)} title="Maintenance Settings">
        <form onSubmit={saveConfig} className="space-y-3">
          <Field label="Config Name">
            <input className="input" value={cfg.name} onChange={(e) => setCfg({ ...cfg, name: e.target.value })} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="1 BHK Maintenance (Rs.)">
              <input className="input" type="number" min="0" step="0.01" value={cfg.amount1bhk} onChange={(e) => setCfg({ ...cfg, amount1bhk: e.target.value })} required />
            </Field>
            <Field label="2 BHK Maintenance (Rs.)">
              <input className="input" type="number" min="0" step="0.01" value={cfg.amount2bhk} onChange={(e) => setCfg({ ...cfg, amount2bhk: e.target.value })} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Late Fee Per Day (Rs.)">
              <input className="input" type="number" min="0" step="0.01" value={cfg.lateFeePerDay} onChange={(e) => setCfg({ ...cfg, lateFeePerDay: e.target.value })} required />
            </Field>
            <Field label="Due Day of Month">
              <input className="input" type="number" min="1" max="28" value={cfg.dueDay} onChange={(e) => setCfg({ ...cfg, dueDay: e.target.value })} required />
            </Field>
          </div>
          <p className="text-xs text-slate-400">
            Bills are generated on the selected month with the maintenance amount based on each unit's type.
            A late fee of Rs.1/day applies from the day after the due date.
          </p>
          <button className="btn-primary w-full">Save Settings</button>
        </form>
      </Modal>
    </div>
  );
}
