import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { money, formatDate, formatDateTime, downloadCSV } from '../lib/format.js';
import Badge from '../components/Badge.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

export default function Reimbursements() {
  const { isAdmin } = useAuth();
  const [claims, setClaims] = useState([]);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [showAdd, setShowAdd] = useState(false);
  const [decision, setDecision] = useState(null);
  const [crediting, setCrediting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const reqs = [api.get('/reimbursements')];
      if (isAdmin) {
        reqs.push(api.get('/expenses/categories'), api.get('/members'));
      }
      const [r, c, m] = await Promise.all(reqs);
      setClaims(r.data.reimbursements);
      if (isAdmin) {
        setCategories(c.data.categories);
        setMembers(m.data.members);
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (claim) => {
    if (!confirm(`Delete claim of ${money(claim.amount)}?`)) return;
    try {
      await api.delete(`/reimbursements/${claim.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  const visible = filter === 'ALL' ? claims : claims.filter((c) => c.status === filter);

  const exportCSV = () => {
    const rows = [
      ['Date', 'Member', 'Unit', 'Category', 'Description', 'Claimed', 'Eligible', 'Credited', 'Status'],
      ...claims.map((c) => [
        formatDate(c.date),
        c.member?.name || '',
        c.unit?.unitNo || '',
        c.category?.name || '',
        c.description || '',
        c.amount,
        c.approvedAmount ?? '',
        c.creditedAmount,
        c.status,
      ]),
    ];
    downloadCSV('reimbursements.csv', rows);
  };

  const totalClaimed = claims.reduce((s, c) => s + c.amount, 0);
  const totalCredited = claims.reduce((s, c) => s + c.creditedAmount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Out-of-Pocket Reimbursements</h1>
          <p className="text-sm text-slate-400">
            {isAdmin
              ? `Claimed: ${money(totalClaimed)} · Credited to dues: ${money(totalCredited)}`
              : 'Expenses you paid for society work — approved amounts are adjusted in your maintenance dues'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <>
              <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="ALL">All</option>
                {['PENDING', 'APPROVED', 'CREDITED', 'REJECTED'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button className="btn-outline" onClick={exportCSV}>
                Export CSV
              </button>
              <button className="btn-primary" onClick={() => setShowAdd(true)}>
                <Icon path={icons.plus} className="h-4 w-4" /> Record Claim
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">No reimbursement claims found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">
                    {isAdmin ? c.member?.name : c.category?.name}
                    {isAdmin && c.unit?.unitNo && (
                      <span className="ml-2 text-xs font-medium text-slate-400">Unit {c.unit.unitNo}</span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatDate(c.date)}
                    {isAdmin && c.category?.name ? ` · ${c.category.name}` : ''}
                    {c.createdBy ? ` · Recorded by ${c.createdBy.name}` : ''}
                  </p>
                </div>
                <Badge value={c.status} />
              </div>

              {c.description && <p className="mt-2 text-sm text-slate-600">{c.description}</p>}

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-center">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Claimed</p>
                  <p className="text-sm font-semibold text-slate-800">{money(c.amount)}</p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Eligible</p>
                  <p className="text-sm font-semibold text-slate-800">
                    {c.approvedAmount != null ? money(c.approvedAmount) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Credited</p>
                  <p className="text-sm font-semibold text-emerald-600">{money(c.creditedAmount)}</p>
                </div>
              </div>

              {c.decisionNote && (
                <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                  Note: {c.decisionNote}
                </p>
              )}
              {c.approvedBy && c.approvedAt && (
                <p className="mt-2 text-xs text-slate-400">
                  Approved by {c.approvedBy.name} · {formatDateTime(c.approvedAt)}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                {c.receiptPath && (
                  <a className="btn-ghost text-brand-600" href={c.receiptPath} target="_blank" rel="noreferrer">
                    Receipt
                  </a>
                )}
                {isAdmin && c.status === 'PENDING' && (
                  <>
                    <button className="btn-primary flex-1" onClick={() => setDecision(c)}>
                      Review / Approve
                    </button>
                    <button className="btn-outline text-red-600" onClick={() => remove(c)}>
                      Delete
                    </button>
                  </>
                )}
                {isAdmin && c.status === 'APPROVED' && (
                  <button className="btn-primary flex-1" onClick={() => setCrediting(c)}>
                    Apply to Dues
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <RecordClaimModal open={showAdd} categories={categories} members={members} onClose={() => setShowAdd(false)} onDone={load} />
      <DecisionModal claim={decision} onClose={() => setDecision(null)} onDone={load} />
      <CreditModal claim={crediting} onClose={() => setCrediting(null)} onDone={load} />
    </div>
  );
}

function AllocationRows({ bills, rows, setRows, remaining }) {
  const set = (i, k) => (e) => setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: e.target.value } : row)));
  const used = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="label mb-0">Credit against bills (optional)</label>
        <span className="text-xs font-medium text-slate-500">
          {money(remaining - used)} of {money(remaining)} left
        </span>
      </div>
      {rows.length === 0 && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          No bills selected — the claim stays approved and can be credited later.
        </p>
      )}
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <select className="input" value={row.billId} onChange={set(i, 'billId')}>
            <option value="">Select bill...</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.month}/{b.year} · due {money(b.outstanding)} ({b.status})
              </option>
            ))}
          </select>
          <input
            className="input w-28"
            type="number"
            min="1"
            placeholder="Amount"
            value={row.amount}
            onChange={set(i, 'amount')}
          />
          <button className="btn-ghost p-2 text-red-500" onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>
            <Icon path={icons.close} className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        className="btn-outline text-sm"
        onClick={() => setRows((r) => [...r, { billId: '', amount: '' }])}
        disabled={rows.length >= bills.length}
      >
        <Icon path={icons.plus} className="h-4 w-4" /> Add bill
      </button>
    </div>
  );
}

function RecordClaimModal({ open, categories, members, onClose, onDone }) {
  const empty = {
    memberId: '',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: '',
  };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm({
        ...empty,
        memberId: members[0] ? String(members[0].id) : '',
        categoryId: categories[0] ? String(categories[0].id) : '',
      });
      setFile(null);
      setError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, members, categories]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (file) {
        const body = new FormData();
        body.append('memberId', form.memberId);
        body.append('categoryId', form.categoryId);
        body.append('amount', form.amount);
        body.append('date', form.date);
        body.append('description', form.description);
        body.append('receipt', file);
        await api.post('/reimbursements', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/reimbursements', { ...form, amount: Number(form.amount) });
      }
      onDone();
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
      title="Record Out-of-Pocket Expense"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Saving...' : 'Save Claim'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Member who paid</label>
            <select className="input" value={form.memberId} onChange={set('memberId')}>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.unit?.unitNo ? ` (Unit ${m.unit.unitNo})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Task Category</label>
            <select className="input" value={form.categoryId} onChange={set('categoryId')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount Paid (Rs.)</label>
            <input className="input" type="number" min="1" value={form.amount} onChange={set('amount')} />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={form.date} onChange={set('date')} />
          </div>
        </div>
        <div>
          <label className="label">Work Done / Description</label>
          <textarea
            className="input min-h-[80px]"
            value={form.description}
            onChange={set('description')}
            placeholder="e.g. Kitchen leakage repair in Unit 302"
          />
        </div>
        <div>
          <label className="label">Receipt (optional)</label>
          <div className="flex items-center gap-3">
            <button className="btn-outline" onClick={() => fileRef.current?.click()}>
              Choose File
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <span className="text-xs text-slate-500">{file ? file.name : 'No file selected'}</span>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function DecisionModal({ claim, onClose, onDone }) {
  const [approvedAmount, setApprovedAmount] = useState('');
  const [note, setNote] = useState('');
  const [bills, setBills] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (claim) {
      setApprovedAmount(String(claim.amount));
      setNote(claim.decisionNote || '');
      setRows([]);
      setError('');
      api
        .get(`/reimbursements/bills/${claim.unitId}`)
        .then(({ data }) => setBills(data.bills))
        .catch((err) => setError(apiError(err)));
    }
  }, [claim]);

  const eligible = Math.round(Number(approvedAmount)) || 0;
  const allocated = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const send = async (decision) => {
    setBusy(true);
    setError('');
    try {
      const body = { decision, note };
      if (decision === 'APPROVE') {
        body.approvedAmount = eligible;
        if (rows.length > 0) {
          if (allocated > eligible) throw new Error(`Allocated ${allocated} exceeds eligible ${eligible}`);
          body.allocations = rows.map((r) => ({ billId: Number(r.billId), amount: Number(r.amount) }));
        }
      }
      await api.patch(`/reimbursements/${claim.id}/decision`, body);
      onDone();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const rowsValid =
    rows.length === 0 ||
    (rows.every((r) => r.billId && Number(r.amount) > 0) && allocated <= eligible);

  return (
    <Modal
      open={Boolean(claim)}
      onClose={onClose}
      title="Review Claim"
      wide
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-outline text-red-600" onClick={() => send('REJECT')} disabled={busy}>
            Reject
          </button>
          <button className="btn-primary" onClick={() => send('APPROVE')} disabled={busy || !rowsValid}>
            {busy ? 'Saving...' : rows.length > 0 ? 'Approve & Credit' : 'Approve'}
          </button>
        </>
      }
    >
      {claim && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p className="font-medium text-slate-800">
              {claim.member?.name} · Unit {claim.unit?.unitNo} · {claim.category?.name}
            </p>
            <p className="text-xs text-slate-400">
              {formatDate(claim.date)} · Claimed {money(claim.amount)}
            </p>
            {claim.description && <p className="mt-1 text-xs">{claim.description}</p>}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Eligible Amount (Rs.)</label>
              <input
                className="input"
                type="number"
                min="1"
                max={claim.amount}
                value={approvedAmount}
                onChange={(e) => setApprovedAmount(e.target.value)}
              />
              <p className="mt-1 text-xs text-slate-400">Max {money(claim.amount)}</p>
            </div>
            <div>
              <label className="label">Note to member (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {eligible > 0 && bills.length > 0 && (
            <AllocationRows bills={bills} rows={rows} setRows={setRows} remaining={eligible} />
          )}
          {eligible > 0 && bills.length === 0 && (
            <p className="text-xs text-slate-400">No pending bills for this unit — approve now, credit later.</p>
          )}
          {!rowsValid && <p className="text-sm text-red-600">Allocation amounts must be positive and within the eligible amount.</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function CreditModal({ claim, onClose, onDone }) {
  const [bills, setBills] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const remaining = claim ? claim.approvedAmount - claim.creditedAmount : 0;

  useEffect(() => {
    if (claim) {
      setRows([]);
      setError('');
      api
        .get(`/reimbursements/bills/${claim.unitId}`)
        .then(({ data }) => setBills(data.bills))
        .catch((err) => setError(apiError(err)));
    }
  }, [claim]);

  const allocated = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const rowsValid = rows.length > 0 && rows.every((r) => r.billId && Number(r.amount) > 0) && allocated <= remaining;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/reimbursements/${claim.id}/credit`, {
        allocations: rows.map((r) => ({ billId: Number(r.billId), amount: Number(r.amount) })),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(claim)}
      onClose={onClose}
      title="Apply Credit to Dues"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || !rowsValid}>
            {busy ? 'Applying...' : 'Apply Credit'}
          </button>
        </>
      }
    >
      {claim && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p className="font-medium text-slate-800">
              {claim.member?.name} · Unit {claim.unit?.unitNo}
            </p>
            <p className="text-xs text-slate-400">Remaining to credit: {money(remaining)}</p>
          </div>
          <AllocationRows bills={bills} rows={rows} setRows={setRows} remaining={remaining} />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}
