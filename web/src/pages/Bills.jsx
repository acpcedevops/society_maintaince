import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, monthName, formatDate, downloadCSV } from '../lib/format.js';
import {
  createOrder,
  createBulkOrder,
  loadRazorpay,
  openRazorpayCheckout,
  verifyPayment,
  verifyBulkPayment,
  mockPay,
  mockPayBulk,
} from '../lib/payments.js';
import Badge from '../components/Badge.jsx';
import Modal from '../components/Modal.jsx';
import StatCard from '../components/StatCard.jsx';
import Spinner from '../components/Spinner.jsx';
import PaymentGateway from '../components/PaymentGateway.jsx';

export default function Bills() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminBills /> : <MemberBills />;
}

function yearOptions() {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1];
}

/* ----------------------------- Admin ----------------------------- */

function AdminBills() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [bills, setBills] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payingBill, setPayingBill] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [b, c] = await Promise.all([
        api.get(`/bills/month/${month}/${year}`),
        api.get('/bills/config'),
      ]);
      setBills(b.data.bills);
      setConfig(c.data.config);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    let collected = 0;
    let pending = 0;
    let paid = 0;
    bills.forEach((b) => {
      if (b.status === 'PAID') {
        collected += b.totalAmount;
        paid += 1;
      } else {
        pending += b.totalAmount;
      }
    });
    return { collected, pending, paid, unpaid: bills.length - paid };
  }, [bills]);

  const generate = async () => {
    if (!confirm(`Generate maintenance bills for ${monthName(month)} ${year}?`)) return;
    setBusy(true);
    try {
      const { data } = await api.post('/bills/generate', { month, year });
      await load();
      alert(`Bills generated: ${data.created} created, ${data.skipped} skipped.`);
    } catch (err) {
      alert(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Unit', 'Owner', 'Month', 'Year', 'Amount', 'Late Fee', 'Total', 'Status', 'Due Date'],
      ...bills.map((b) => [
        b.unit?.unitNo,
        b.unit?.ownerName || b.unit?.members?.[0]?.name || '',
        monthName(b.month),
        b.year,
        b.amount,
        b.lateFee,
        b.totalAmount,
        b.status,
        formatDate(b.dueDate),
      ]),
    ];
    downloadCSV(`bills_${month}_${year}.csv`, rows);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Bills &amp; Payments</h1>
          <p className="text-sm text-slate-400">Track who has paid, month by month</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {monthName(i + 1)}
              </option>
            ))}
          </select>
          <select className="input w-auto" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {yearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button className="btn-outline" onClick={() => setShowConfig(true)}>
            Maintenance Settings
          </button>
          <button className="btn-primary" onClick={generate} disabled={busy}>
            Generate Bills for Month
          </button>
          <button className="btn-outline" onClick={exportCSV}>
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={stats.collected} accent="emerald" />
        <StatCard label="Pending" value={stats.pending} accent="red" />
        <StatCard label="Paid Bills" value={stats.paid} accent="brand" moneyValue={false} />
        <StatCard label="Pending Bills" value={stats.unpaid} accent="amber" moneyValue={false} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : bills.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            No bills generated yet. Use “Generate Bills for Month”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Unit</th>
                  <th className="th">Owner</th>
                  <th className="th">Amount</th>
                  <th className="th">Late Fee</th>
                  <th className="th">Total</th>
                  <th className="th">Due</th>
                  <th className="th">Status</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-semibold">{b.unit?.unitNo}</td>
                    <td className="td">{b.unit?.ownerName || b.unit?.members?.[0]?.name}</td>
                    <td className="td">{money(b.amount)}</td>
                    <td className="td">{b.lateFee ? money(b.lateFee) : '—'}</td>
                    <td className="td font-semibold">{money(b.totalAmount)}</td>
                    <td className="td">{formatDate(b.dueDate)}</td>
                    <td className="td">
                      <Badge value={b.status} />
                    </td>
                    <td className="td">
                      <div className="flex gap-2">
                        <button className="btn-ghost" onClick={() => setReceipt(b)}>
                          View
                        </button>
                        {b.status !== 'PAID' && (
                          <button className="btn-ghost text-brand-600" onClick={() => setPayingBill(b)}>
                            Record Payment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OfflinePaymentModal
        bill={payingBill}
        onClose={() => setPayingBill(null)}
        onDone={() => {
          setPayingBill(null);
          load();
        }}
      />
      <ReceiptModal bill={receipt} onClose={() => setReceipt(null)} />
      <ConfigModal open={showConfig} config={config} onClose={() => setShowConfig(false)} onSaved={load} />
    </div>
  );
}

function OfflinePaymentModal({ bill, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bill) {
      setAmount(String(bill.totalAmount));
      setMethod('CASH');
      setError('');
    }
  }, [bill]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/bills/offline-payment', { billId: bill.id, amount: Number(amount), method });
      onDone();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(bill)}
      onClose={onClose}
      title="Record Offline Payment"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      {bill && (
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Unit {bill.unit?.unitNo} · {monthName(bill.month)} {bill.year}
          </p>
          <div>
            <label className="label">Amount Received (Rs.)</label>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Method</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
              {['CASH', 'CHEQUE', 'UPI', 'ONLINE', 'LINK'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function ReceiptModal({ bill, onClose }) {
  return (
    <Modal open={Boolean(bill)} onClose={onClose} title="Invoice">
      {bill && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Unit</span>
            <span className="font-semibold">{bill.unit?.unitNo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Period</span>
            <span className="font-semibold">
              {monthName(bill.month)} {bill.year}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Maintenance (Rs.)</span>
            <span>{money(bill.amount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Late Fee</span>
            <span>{money(bill.lateFee)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold">{money(bill.totalAmount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Status</span>
            <Badge value={bill.status} />
          </div>
          {bill.transactions?.length > 0 && (
            <div className="mt-2 rounded-lg bg-slate-50 p-3">
              <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Payments</p>
              {bill.transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-xs text-slate-600">
                  <span>
                    {t.method} · {formatDate(t.createdAt)}
                  </span>
                  <span>{money(t.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function ConfigModal({ open, config, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', amount1bhk: '', amount2bhk: '', lateFeePerDay: '', dueDay: 15 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (config) {
      setForm({
        name: config.name,
        amount1bhk: String(config.amount1bhk),
        amount2bhk: String(config.amount2bhk),
        lateFeePerDay: String(config.lateFeePerDay),
        dueDay: String(config.dueDay),
      });
    }
  }, [config, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/bills/config', {
        name: form.name,
        amount1bhk: Number(form.amount1bhk),
        amount2bhk: Number(form.amount2bhk),
        lateFeePerDay: Number(form.lateFeePerDay),
        dueDay: Number(form.dueDay),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Maintenance Settings"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving...' : 'Save Settings'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Config Name</label>
          <input className="input" value={form.name} onChange={set('name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">1 BHK (Rs.)</label>
            <input className="input" value={form.amount1bhk} onChange={set('amount1bhk')} />
          </div>
          <div>
            <label className="label">2 BHK (Rs.)</label>
            <input className="input" value={form.amount2bhk} onChange={set('amount2bhk')} />
          </div>
          <div>
            <label className="label">Late Fee Per Day (Rs.)</label>
            <input className="input" value={form.lateFeePerDay} onChange={set('lateFeePerDay')} />
          </div>
          <div>
            <label className="label">Due Day of Month</label>
            <input className="input" value={form.dueDay} onChange={set('dueDay')} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

/* ----------------------------- Member ----------------------------- */

function MemberBills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [gateway, setGateway] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/bills');
      setBills(data.bills);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const unpaid = bills.filter((b) => b.status !== 'PAID');
  const totalDue = unpaid.reduce((s, b) => s + b.totalAmount, 0);
  const totalPaid = bills.filter((b) => b.status === 'PAID').reduce((s, b) => s + b.totalAmount, 0);

  const toggle = (id) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handlePay = async (bill) => {
    await startPayment([bill.id], `${monthName(bill.month)} ${bill.year}`);
  };

  const handlePaySelected = async () => {
    if (selected.length === 0) return;
    await startPayment(selected, `${selected.length} selected bill(s)`);
  };

  const demoPayAll = async () => {
    const ids = unpaid.map((b) => b.id);
    if (ids.length === 0) return;
    await startPayment(ids, `All dues (${ids.length} bills)`);
  };

  // Creates an order, then either opens the Razorpay checkout (live/test keys)
  // or the built-in demo gateway when no payment keys are configured.
  const startPayment = async (billIds, label) => {
    setBusy(true);
    setError('');
    try {
      const res = billIds.length === 1 ? await createOrder(billIds[0]) : await createBulkOrder(billIds);
      if (res.mock) {
        setGateway({ billIds, amount: res.amount, order: res.order, label });
        return;
      }
      await loadRazorpay();
      const response = await openRazorpayCheckout({
        keyId: res.keyId,
        order: res.order,
        user,
        societyName: user?.society?.name,
      });
      if (billIds.length === 1) {
        await verifyPayment({ billId: billIds[0], response });
      } else {
        await verifyBulkPayment({ billIds, response });
      }
      await load();
    } catch (err) {
      if (!/cancel/i.test(err?.message || '')) alert(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const completeGatewayPayment = async () => {
    const ids = gateway.billIds;
    if (ids.length === 1) {
      await mockPay(ids[0]);
    } else {
      await mockPayBulk(ids);
    }
    setGateway(null);
    setSelected([]);
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Maintenance Bills</h1>
          <p className="text-sm text-slate-400">
            {user?.unit ? `Unit ${user.unit.unitNo}` : 'Your unit'}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button className="btn-primary" onClick={handlePaySelected} disabled={busy}>
              Pay Selected ({selected.length})
            </button>
          )}
          {unpaid.length > 0 && (
            <button className="btn-outline" onClick={demoPayAll} disabled={busy}>
              Demo Pay All
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Due" value={totalDue} accent="red" />
        <StatCard label="Total Paid" value={totalPaid} accent="emerald" />
        <StatCard label="Pending Bills" value={unpaid.length} accent="amber" moneyValue={false} />
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : bills.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No bills generated yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">
                    <input
                      type="checkbox"
                      checked={selected.length > 0 && selected.length === unpaid.length}
                      onChange={(e) => setSelected(e.target.checked ? unpaid.map((b) => b.id) : [])}
                    />
                  </th>
                  <th className="th">Period</th>
                  <th className="th">Amount</th>
                  <th className="th">Late Fee</th>
                  <th className="th">Total</th>
                  <th className="th">Due Date</th>
                  <th className="th">Status</th>
                  <th className="th">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="td">
                      {b.status !== 'PAID' && (
                        <input
                          type="checkbox"
                          checked={selected.includes(b.id)}
                          onChange={() => toggle(b.id)}
                        />
                      )}
                    </td>
                    <td className="td font-semibold">
                      {monthName(b.month)} {b.year}
                    </td>
                    <td className="td">{money(b.amount)}</td>
                    <td className="td">{b.lateFee ? money(b.lateFee) : '—'}</td>
                    <td className="td font-semibold">{money(b.totalAmount)}</td>
                    <td className="td">{formatDate(b.dueDate)}</td>
                    <td className="td">
                      <Badge value={b.status} />
                    </td>
                    <td className="td">
                      {b.status === 'PAID' ? (
                        <button className="btn-ghost" onClick={() => setReceipt(b)}>
                          Receipt
                        </button>
                      ) : (
                        <button className="btn-primary px-3 py-1.5" onClick={() => handlePay(b)} disabled={busy}>
                          Pay Now
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReceiptModal bill={receipt} onClose={() => setReceipt(null)} />

      <PaymentGateway
        open={!!gateway}
        amount={gateway?.amount}
        order={gateway?.order}
        label={gateway?.label}
        user={user}
        societyName={user?.society?.name}
        onClose={() => setGateway(null)}
        onPaid={completeGatewayPayment}
      />
    </div>
  );
}
