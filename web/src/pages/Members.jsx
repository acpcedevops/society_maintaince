import { useCallback, useEffect, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, u] = await Promise.all([api.get('/members'), api.get('/units')]);
      setMembers(m.data.members);
      setUnits(u.data.units);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (member) => {
    if (!confirm(`Remove ${member.name}?`)) return;
    try {
      await api.delete(`/members/${member.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Members &amp; Units</h1>
          <p className="text-sm text-slate-400">Manage society residents and their flats</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Icon path={icons.plus} className="h-4 w-4" /> Add Member
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : members.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No members registered</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Phone</th>
                  <th className="th">Email</th>
                  <th className="th">Unit</th>
                  <th className="th">Role</th>
                  <th className="th">Owner</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="td font-semibold">{m.name}</td>
                    <td className="td">{m.phone}</td>
                    <td className="td">{m.email || '—'}</td>
                    <td className="td">{m.unit?.unitNo || '—'}</td>
                    <td className="td">{m.role}</td>
                    <td className="td">{m.isOwner ? 'Yes' : 'No'}</td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button className="btn-ghost text-brand-600" onClick={() => setEditing(m)}>
                          Edit
                        </button>
                        <button className="btn-ghost text-red-500" onClick={() => remove(m)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MemberModal
        open={showAdd || Boolean(editing)}
        member={editing}
        units={units}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
        onDone={load}
      />
    </div>
  );
}

function MemberModal({ open, member, units, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', unitId: '', isOwner: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (member) {
      setForm({
        name: member.name,
        phone: member.phone,
        email: member.email || '',
        password: '',
        unitId: String(member.unitId || ''),
        isOwner: member.isOwner,
      });
    } else {
      setForm({
        name: '',
        phone: '',
        email: '',
        password: '',
        unitId: units[0] ? String(units[0].id) : '',
        isOwner: true,
      });
    }
    setError('');
  }, [open, member, units]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email || undefined,
        unitId: Number(form.unitId),
        isOwner: form.isOwner,
      };
      if (form.password) payload.password = form.password;
      if (member) {
        await api.put(`/members/${member.id}`, payload);
      } else {
        await api.post('/members', payload);
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
      title={member ? 'Edit Member' : 'Add Member'}
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
      <div className="space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input className="input" value={form.name} onChange={set('name')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone Number</label>
            <input className="input" value={form.phone} onChange={set('phone')} />
          </div>
          <div>
            <label className="label">Email (optional)</label>
            <input className="input" value={form.email} onChange={set('email')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Unit</label>
            <select className="input" value={form.unitId} onChange={set('unitId')}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNo} ({u.bhk})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{member ? 'Reset Password (optional)' : 'Login Password'}</label>
            <input
              className="input"
              type="password"
              value={form.password}
              onChange={set('password')}
              placeholder="min 6 chars"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.isOwner}
            onChange={(e) => setForm((f) => ({ ...f, isOwner: e.target.checked }))}
          />
          Is flat owner
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
