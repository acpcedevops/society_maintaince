import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { Spinner, Alert, inr, fmtDate, Modal, Field, monthName } from "../components/ui";

export default function Expenses() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ categoryId: "", vendor: "", amount: "", date: "", description: "", receiptPath: "" });
  const [ocr, setOcr] = useState({ status: null, text: null, preview: null, busy: false });
  const [busy, setBusy] = useState(false);

  function load() {
    api.get(`/expenses?year=${year}&month=${month}`).then((res) => setData(res.data)).catch((e) => setError(errMsg(e)));
  }
  useEffect(load, [year, month]);
  useEffect(() => {
    api.get("/expenses/categories").then((res) => setCategories(res.data.categories)).catch(() => {});
  }, []);

  function resetForm() {
    setForm({ categoryId: categories[0]?.id || "", vendor: "", amount: "", date: new Date().toISOString().slice(0, 10), description: "", receiptPath: "" });
    setOcr({ status: null, text: null, preview: null, busy: false });
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("categoryId", form.categoryId);
      fd.append("vendor", form.vendor);
      fd.append("amount", form.amount);
      fd.append("date", form.date ? new Date(form.date).toISOString() : "");
      fd.append("description", form.description || "");
      if (ocr.text) fd.append("ocrText", ocr.text);
      if (form.receiptPath) fd.append("receiptPath", form.receiptPath);
      await api.post("/expenses", fd);
      setShowForm(false);
      setShowScan(false);
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function scanReceipt(file) {
    setError(null);
    setOcr({ status: "Scanning receipt...", text: null, preview: URL.createObjectURL(file), busy: true });
    const fd = new FormData();
    fd.append("receipt", file);
    try {
      const res = await api.post("/expenses/ocr", fd);
      setForm((f) => ({
        ...f,
        vendor: res.data.parsed.vendor && f.vendor === "" ? res.data.parsed.vendor : f.vendor,
        amount: res.data.parsed.amount ? String(res.data.parsed.amount) : f.amount,
        date: res.data.parsed.date ? parseOcrDate(res.data.parsed.date) : f.date,
        receiptPath: res.data.receiptPath,
      }));
      setOcr({ status: "done", text: res.data.text, preview: URL.createObjectURL(file), busy: false });
    } catch (err) {
      setOcr({ status: null, text: null, preview: null, busy: false });
      setError(errMsg(err));
    }
  }

  function parseOcrDate(d) {
    const parts = d.split(/[\/\-.]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number);
      const y = c > 1000 ? c : c > 50 ? 1900 + c : 2000 + c;
      return `${y}-${String(a > 12 ? b : a).padStart(2, "0")}-${String(a > 12 ? a : b).padStart(2, "0")}`;
    }
    return "";
  }

  if (error) return <Alert msg={error} />;
  if (!data) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Society Expenses</h1>
          <p className="text-sm text-slate-500">Day-by-day spending on vendors, electricians, repairs and more</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => { resetForm(); setShowScan(true); }}>Scan Receipt (OCR)</button>
          <button className="btn-primary" onClick={() => { resetForm(); setShowForm(true); }}>Add Expense</button>
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
          Total spent: <b className="text-red-600">{inr(data.total)}</b>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Vendor</th>
              <th className="py-2 pr-4">Category</th>
              <th className="py-2 pr-4">Description</th>
              <th className="py-2 pr-4">Receipt</th>
              <th className="py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.expenses.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-slate-400">No expenses recorded for this period.</td></tr>
            )}
            {data.expenses.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="py-3 pr-4 text-slate-500">{fmtDate(e.date)}</td>
                <td className="py-3 pr-4 font-medium">{e.vendor}</td>
                <td className="py-3 pr-4"><span className="badge bg-slate-100 text-slate-600">{e.category.name}</span></td>
                <td className="py-3 pr-4 text-slate-500 max-w-xs truncate">{e.description || "—"}</td>
                <td className="py-3 pr-4">
                  {e.receiptPath ? (
                    <a href={`/uploads/${e.receiptPath}`} target="_blank" rel="noreferrer" className="text-brand-600 text-xs hover:underline">View</a>
                  ) : "—"}
                </td>
                <td className="py-3 text-red-600 font-medium">{inr(e.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Expense" wide>
        <ExpenseForm form={form} setForm={setForm} categories={categories} busy={busy} save={save} />
      </Modal>

      <Modal open={showScan} onClose={() => setShowScan(false)} title="Scan Receipt" wide>
        {ocr.status && ocr.status !== "done" && (
          <div className="flex items-center gap-3 text-sm text-brand-600 mb-4">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            {ocr.status}
          </div>
        )}
        {ocr.preview && (
          <img src={ocr.preview} alt="Receipt preview" className="max-h-56 rounded-lg border mb-4 object-contain" />
        )}
        {ocr.text && (
          <details className="mb-4 text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
            <summary className="cursor-pointer font-medium">OCR extracted text ({ocr.text.length} chars)</summary>
            <pre className="whitespace-pre-wrap mt-2 font-sans">{ocr.text}</pre>
          </details>
        )}
        <label className="btn-outline cursor-pointer mb-4 w-full justify-center">
          {ocr.status === "done" ? "Re-scan Another Receipt" : "Upload Receipt Photo / PDF"}
          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => e.target.files[0] && scanReceipt(e.target.files[0])} />
        </label>
        <ExpenseForm form={form} setForm={setForm} categories={categories} busy={busy} save={save} submitLabel="Save Expense" />
      </Modal>
    </div>
  );
}

function ExpenseForm({ form, setForm, categories, busy, save, submitLabel = "Save Expense" }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <form onSubmit={save}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select className="input" value={form.categoryId} onChange={set("categoryId")} required>
            <option value="">Select...</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Vendor / Service Provider">
          <input className="input" value={form.vendor} onChange={set("vendor")} required />
        </Field>
        <Field label="Amount (Rs.)">
          <input className="input" type="number" step="0.01" min="0" value={form.amount} onChange={set("amount")} required />
        </Field>
        <Field label="Date">
          <input className="input" type="date" value={form.date} onChange={set("date")} required />
        </Field>
        <div className="col-span-2">
          <Field label="Description / Work Done">
            <textarea className="input" rows={2} value={form.description} onChange={set("description")} />
          </Field>
        </div>
      </div>
      <button className="btn-primary w-full mt-3" disabled={busy}>{busy ? "Saving..." : submitLabel}</button>
    </form>
  );
}
