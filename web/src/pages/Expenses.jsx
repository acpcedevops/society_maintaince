import { useCallback, useEffect, useRef, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { money, formatDate, downloadCSV } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

const emptyForm = { categoryId: '', vendor: '', amount: '', date: new Date().toISOString().slice(0, 10), description: '', receiptPath: '' };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([api.get('/expenses'), api.get('/expenses/categories')]);
      setExpenses(e.data.expenses);
      setCategories(c.data.categories);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (expense) => {
    if (!confirm(`Delete expense from ${expense.vendor}?`)) return;
    try {
      await api.delete(`/expenses/${expense.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  const exportCSV = () => {
    const rows = [
      ['Date', 'Category', 'Vendor', 'Description', 'Amount'],
      ...expenses.map((e) => [formatDate(e.date), e.category?.name || '', e.vendor, e.description || '', e.amount]),
    ];
    downloadCSV('expenses.csv', rows);
  };

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Society Expenses</h1>
          <p className="text-sm text-slate-400">Total spent: {money(total)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline" onClick={exportCSV}>
            Export CSV
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Icon path={icons.plus} className="h-4 w-4" /> Add Expense
          </button>
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : expenses.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No expenses recorded for this period.</p>
        ) : (
          <>
            <ul className="space-y-3 p-3 md:hidden">
              {expenses.map((e) => (
                <li key={e.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{e.vendor}</p>
                      <p className="text-xs text-slate-400">{formatDate(e.date)}</p>
                      <span className="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {e.category?.name}
                      </span>
                      {e.description && (
                        <p className="mt-1 text-xs text-slate-500">{e.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-bold text-slate-800">{money(e.amount)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {e.receiptPath && (
                      <a
                        className="btn-outline px-3 py-1.5 text-sm"
                        href={e.receiptPath}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Receipt
                      </a>
                    )}
                    <button
                      className="btn-outline px-3 py-1.5 text-sm text-red-600"
                      onClick={() => remove(e)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="th">Date</th>
                    <th className="th">Category</th>
                    <th className="th">Vendor</th>
                    <th className="th">Description</th>
                    <th className="th">Amount</th>
                    <th className="th">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <td className="td">{formatDate(e.date)}</td>
                      <td className="td">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                          {e.category?.name}
                        </span>
                      </td>
                      <td className="td font-medium">{e.vendor}</td>
                      <td className="td max-w-[220px] whitespace-normal text-slate-500">{e.description || '—'}</td>
                      <td className="td font-semibold">{money(e.amount)}</td>
                      <td className="td">
                        <div className="flex gap-1">
                          {e.receiptPath && (
                            <a className="btn-ghost text-brand-600" href={e.receiptPath} target="_blank" rel="noreferrer">
                              Receipt
                            </a>
                          )}
                          <button className="btn-ghost text-red-500" onClick={() => remove(e)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ExpenseModal
        open={showAdd}
        categories={categories}
        onClose={() => setShowAdd(false)}
        onDone={load}
      />
    </div>
  );
}

function ExpenseModal({ open, categories, onClose, onDone }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, categoryId: categories[0] ? String(categories[0].id) : '' });
      setError('');
    }
  }, [open, categories]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const scan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      const body = new FormData();
      body.append('receipt', file);
      const { data } = await api.post('/expenses/ocr', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((f) => ({
        ...f,
        receiptPath: data.receiptPath || f.receiptPath,
        amount: data.parsed?.amount != null ? String(data.parsed.amount) : f.amount,
        date: data.parsed?.date || f.date,
        vendor: data.parsed?.vendor || f.vendor,
      }));
    } catch (err) {
      setError(apiError(err));
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/expenses', {
        categoryId: Number(form.categoryId),
        vendor: form.vendor,
        amount: Number(form.amount),
        date: form.date,
        description: form.description,
        receiptPath: form.receiptPath || null,
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
      open={open}
      onClose={onClose}
      title="Add Expense"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || scanning}>
            {busy ? 'Saving...' : 'Save Expense'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Upload Receipt Photo / PDF</label>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-outline" onClick={() => fileRef.current?.click()} disabled={scanning}>
              <Icon path={icons.scan} className="h-4 w-4" />
              {scanning ? 'Scanning receipt...' : 'Scan Receipt (OCR)'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={scan}
            />
            {form.receiptPath && (
              <a className="text-xs font-semibold text-brand-600" href={form.receiptPath} target="_blank" rel="noreferrer">
                View attached
              </a>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.categoryId} onChange={set('categoryId')}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (Rs.)</label>
            <input className="input" value={form.amount} onChange={set('amount')} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Vendor / Service Provider</label>
            <input className="input" value={form.vendor} onChange={set('vendor')} />
          </div>
          <div>
            <label className="label">Date</label>
            <input className="input" type="date" value={form.date} onChange={set('date')} />
          </div>
        </div>
        <div>
          <label className="label">Description / Work Done</label>
          <textarea className="input min-h-[80px]" value={form.description} onChange={set('description')} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
