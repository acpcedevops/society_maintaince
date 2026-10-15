import { useCallback, useEffect, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { formatDateTime } from '../lib/format.js';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

export default function Notices() {
  const { isAdmin } = useAuth();
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPost, setShowPost] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/notices');
      setNotices(data.notices);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id) => {
    if (!confirm('Delete this notice?')) return;
    try {
      await api.delete(`/notices/${id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Society Notices</h1>
          <p className="text-sm text-slate-400">Announcements from the society committee</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowPost(true)}>
            <Icon path={icons.plus} className="h-4 w-4" /> Post a Notice
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : notices.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">No notices posted yet.</div>
      ) : (
        <div className="space-y-4">
          {notices.map((n) => (
            <div key={n.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{n.title}</h3>
                  <p className="text-xs text-slate-400">
                    Posted {formatDateTime(n.createdAt)}
                    {n.createdBy?.name ? ` · ${n.createdBy.name}` : ''}
                  </p>
                </div>
                {isAdmin && (
                  <button className="btn-ghost text-red-500" onClick={() => remove(n.id)}>
                    Delete
                  </button>
                )}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      <PostNoticeModal open={showPost} onClose={() => setShowPost(false)} onDone={load} />
    </div>
  );
}

function PostNoticeModal({ open, onClose, onDone }) {
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({ title: '', body: '' });
      setError('');
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/notices', form);
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
      title="Post a Notice"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Posting...' : 'Post Notice'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea
            className="input min-h-[120px]"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
