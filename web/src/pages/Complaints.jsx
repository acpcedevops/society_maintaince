import { useCallback, useEffect, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';
import Badge from '../components/Badge.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

const CATEGORIES = ['PLUMBING', 'ELECTRICAL', 'CLEANING', 'LIFT', 'PARKING', 'WATER', 'NOISE', 'OTHER'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export default function Complaints() {
  const { isAdmin } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRaise, setShowRaise] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/complaints');
      setComplaints(data.complaints);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = filter === 'ALL' ? complaints : complaints.filter((c) => c.status === filter);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Complaints &amp; Service Requests</h1>
          <p className="text-sm text-slate-400">
            {isAdmin ? 'Manage all member complaints' : 'Raise issues with the society committee'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <select className="input w-auto" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="ALL">All</option>
              {['OPEN', ...STATUSES].filter((v, i, a) => a.indexOf(v) === i).map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          )}
          {!isAdmin && (
            <button className="btn-primary" onClick={() => setShowRaise(true)}>
              <Icon path={icons.plus} className="h-4 w-4" /> Raise Complaint
            </button>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : visible.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">No complaints found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visible.map((c) => (
            <div key={c.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{c.title}</p>
                  <p className="text-xs text-slate-400">
                    {c.unit?.unitNo ? `Unit ${c.unit.unitNo} · ` : ''}
                    {c.user?.name} · {formatDateTime(c.createdAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge value={c.status} />
                  <Badge value={c.priority} />
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">{c.description}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">{c.category}</span>
                {c.adminNote && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                    Note: {c.adminNote}
                  </span>
                )}
              </div>
              {isAdmin && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <button className="btn-outline w-full" onClick={() => setEditing(c)}>
                    Update Status
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <RaiseComplaintModal open={showRaise} onClose={() => setShowRaise(false)} onDone={load} />
      <UpdateComplaintModal complaint={editing} onClose={() => setEditing(null)} onDone={load} />
    </div>
  );
}

function RaiseComplaintModal({ open, onClose, onDone }) {
  const [form, setForm] = useState({ category: 'OTHER', title: '', description: '', priority: 'NORMAL' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ category: 'OTHER', title: '', description: '', priority: 'NORMAL' });
      setError('');
    }
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/complaints', form);
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
      title="Raise a Complaint"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Submitting...' : 'Submit Complaint'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select className="input" value={form.priority} onChange={set('priority')}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={set('title')} placeholder="Short summary" />
        </div>
        <div>
          <label className="label">Describe the issue</label>
          <textarea
            className="input min-h-[100px]"
            value={form.description}
            onChange={set('description')}
            placeholder="Provide details of the problem"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function UpdateComplaintModal({ complaint, onClose, onDone }) {
  const [status, setStatus] = useState('OPEN');
  const [adminNote, setAdminNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (complaint) {
      setStatus(complaint.status);
      setAdminNote(complaint.adminNote || '');
    }
  }, [complaint]);

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`/complaints/${complaint.id}`, { status, adminNote });
      onDone();
      onClose();
    } catch (err) {
      alert(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(complaint)}
      onClose={onClose}
      title="Update Complaint"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            Save Changes
          </button>
        </>
      }
    >
      {complaint && (
        <div className="space-y-4">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{complaint.title}</p>
          <div>
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Admin Note (shown to member)</label>
            <textarea className="input min-h-[80px]" value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
          </div>
        </div>
      )}
    </Modal>
  );
}
