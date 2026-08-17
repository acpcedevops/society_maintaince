import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Spinner, Alert, statusBadge, fmtDate, Modal, Field } from "../components/ui";

const CATEGORIES = ["PLUMBING", "ELECTRICAL", "LIFT", "CLEANING", "WATER", "PARKING", "NOISE", "OTHER"];
const PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

export default function Complaints() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ category: "OTHER", title: "", description: "", priority: "NORMAL" });
  const [busy, setBusy] = useState(false);
  const isAdmin = user.role === "ADMIN";

  function load() {
    api.get(`/complaints${filter ? `?status=${filter}` : ""}`).then((res) => setComplaints(res.data.complaints)).catch((e) => setError(errMsg(e)));
  }
  useEffect(load, [filter]);

  const priorTone = { LOW: "slate", NORMAL: "brand", HIGH: "amber", URGENT: "red" };

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/complaints", form);
      setShowForm(false);
      setForm({ category: "OTHER", title: "", description: "", priority: "NORMAL" });
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(c, status, note) {
    setError(null);
    try {
      await api.put(`/complaints/${c.id}`, { status, adminNote: note || c.adminNote });
      setEditTarget(null);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (error) return <Alert msg={error} />;
  if (!complaints) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Complaints & Service Requests</h1>
          <p className="text-sm text-slate-500">{isAdmin ? "Manage all member complaints" : "Raise issues with the society committee"}</p>
        </div>
        {!isAdmin && <button className="btn-primary" onClick={() => setShowForm(true)}>Raise Complaint</button>}
      </div>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          {["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === s ? "bg-brand-600 text-white border-brand-600" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {complaints.length === 0 && <div className="card text-center text-slate-400">No complaints found.</div>}
        {complaints.map((c) => (
          <div key={c.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{c.title}</h3>
                {statusBadge(c.status)}
                <span className={`badge ${priorTone[c.priority] || "slate"}`}>{c.priority}</span>
              </div>
              <span className="text-xs text-slate-400">{fmtDate(c.createdAt)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-2">
              <span className="badge bg-slate-100 text-slate-600">{c.category}</span>
              {isAdmin && <span>by {c.user?.name} · {c.user?.phone}{c.unit ? ` · Unit ${c.unit.unitNo}` : ""}</span>}
              {!isAdmin && <span>Your unit</span>}
            </div>
            <p className="text-sm text-slate-700 mb-2">{c.description}</p>
            {c.adminNote && (
              <p className="text-xs text-brand-700 bg-brand-50 rounded-lg px-3 py-2">Admin note: {c.adminNote}</p>
            )}
            {isAdmin && (
              <div className="flex gap-2 mt-3">
                <button className="btn-outline !py-1.5 text-xs" onClick={() => setEditTarget(c)}>Update Status</button>
                {c.status === "OPEN" && (
                  <button className="btn-outline !py-1.5 text-xs" onClick={() => updateStatus(c, "IN_PROGRESS")}>Mark In Progress</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Raise a Complaint">
        <form onSubmit={submit}>
          <Field label="Category">
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <Field label="Describe the issue">
            <textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
          </Field>
          <button className="btn-primary w-full mt-2" disabled={busy}>{busy ? "Submitting..." : "Submit Complaint"}</button>
        </form>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Update Status - ${editTarget?.title || ""}`}>
        <AdminUpdate complaint={editTarget} onSave={updateStatus} />
      </Modal>
    </div>
  );
}

function AdminUpdate({ complaint, onSave }) {
  const [status, setStatus] = useState(complaint?.status || "OPEN");
  const [note, setNote] = useState(complaint?.adminNote || "");
  if (!complaint) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(complaint, status, note);
      }}
    >
      <Field label="Status">
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Admin Note (shown to member)">
        <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <button className="btn-primary w-full mt-2">Save</button>
    </form>
  );
}
