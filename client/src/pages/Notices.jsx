import { useEffect, useState } from "react";
import api, { errMsg } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Spinner, Alert, fmtDate, Modal, Field } from "../components/ui";

export default function Notices() {
  const { user } = useAuth();
  const isAdmin = user.role === "ADMIN";
  const [notices, setNotices] = useState(null);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load() {
    api.get("/notices").then((res) => setNotices(res.data.notices)).catch((e) => setError(errMsg(e)));
  }
  useEffect(load, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/notices", form);
      setShowForm(false);
      setForm({ title: "", body: "" });
      load();
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!confirm("Delete this notice?")) return;
    try {
      await api.delete(`/notices/${id}`);
      load();
    } catch (err) {
      setError(errMsg(err));
    }
  }

  if (error) return <Alert msg={error} />;
  if (!notices) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Notice Board</h1>
          <p className="text-sm text-slate-500">Announcements from the society committee</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={() => setShowForm(true)}>Post Notice</button>}
      </div>

      <div className="space-y-3 max-w-3xl">
        {notices.length === 0 && <div className="card text-center text-slate-400">No notices posted yet.</div>}
        {notices.map((n) => (
          <div key={n.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{n.title}</h3>
                <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                <p className="text-xs text-slate-400 mt-2">
                  Posted {fmtDate(n.createdAt)}{n.createdBy?.name ? ` by ${n.createdBy.name}` : ""}
                </p>
              </div>
              {isAdmin && (
                <button className="text-red-500 text-xs hover:underline" onClick={() => remove(n.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Post a Notice">
        <form onSubmit={submit}>
          <Field label="Title">
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </Field>
          <Field label="Message">
            <textarea className="input" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </Field>
          <button className="btn-primary w-full mt-2" disabled={busy}>{busy ? "Posting..." : "Post Notice"}</button>
        </form>
      </Modal>
    </div>
  );
}
