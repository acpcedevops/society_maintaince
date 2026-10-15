import { useCallback, useEffect, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import { Icon, icons } from '../components/Icon.jsx';
import { money } from '../lib/format.js';

const BHK_OPTIONS = ['1BHK', '2BHK', '3BHK'];

export default function Flats() {
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/units');
      setUnits(data.units);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (unit) => {
    if (!confirm(`Delete unit ${unit.unitNo}? This cannot be undone.`)) return;
    try {
      await api.delete(`/units/${unit.id}`);
      load();
    } catch (err) {
      alert(apiError(err));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Flat Details</h1>
          <p className="text-sm text-slate-400">All flats / units in the society</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <Icon path={icons.plus} className="h-4 w-4" /> Add Unit
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        {loading ? (
          <Spinner />
        ) : units.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">No units added yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Unit No</th>
                  <th className="th">Floor</th>
                  <th className="th">BHK</th>
                  <th className="th">Owner</th>
                  <th className="th">Occupants</th>
                  <th className="th">Custom Amount</th>
                  <th className="th">Members</th>
                  <th className="th">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {units.map((u) => (
                  <tr key={u.id}>
                    <td className="td font-semibold">{u.unitNo}</td>
                    <td className="td">{u.floor}</td>
                    <td className="td">{u.bhk}</td>
                    <td className="td">{u.ownerName || '—'}</td>
                    <td className="td">{u.occupants}</td>
                    <td className="td">{u.amountOverride ? money(u.amountOverride) : '—'}</td>
                    <td className="td">{u.members?.length || u._count?.members || 0}</td>
                    <td className="td">
                      <div className="flex gap-1">
                        <button className="btn-ghost text-brand-600" onClick={() => setEditing(u)}>
                          Edit
                        </button>
                        <button className="btn-ghost text-red-500" onClick={() => remove(u)}>
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

      <UnitModal
        open={showAdd || Boolean(editing)}
        unit={editing}
        onClose={() => {
          setShowAdd(false);
          setEditing(null);
        }}
        onDone={load}
      />
    </div>
  );
}

function UnitModal({ open, unit, onClose, onDone }) {
  const [form, setForm] = useState({
    unitNo: '',
    floor: '1',
    bhk: '1BHK',
    amountOverride: '',
    ownerName: '',
    occupants: '1',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (unit) {
      setForm({
        unitNo: unit.unitNo,
        floor: String(unit.floor),
        bhk: unit.bhk || '1BHK',
        amountOverride: unit.amountOverride != null ? String(unit.amountOverride) : '',
        ownerName: unit.ownerName || '',
        occupants: String(unit.occupants),
      });
    } else {
      setForm({ unitNo: '', floor: '1', bhk: '1BHK', amountOverride: '', ownerName: '', occupants: '1' });
    }
    setError('');
  }, [open, unit]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const payload = {
        unitNo: form.unitNo,
        floor: form.floor,
        bhk: form.bhk,
        amountOverride: form.amountOverride,
        ownerName: form.ownerName,
        occupants: form.occupants,
      };
      if (unit) {
        await api.put(`/units/${unit.id}`, payload);
      } else {
        await api.post('/units', payload);
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
      title={unit ? 'Edit Unit' : 'Add Unit'}
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Flat / Unit Number</label>
            <input className="input" value={form.unitNo} onChange={set('unitNo')} placeholder="e.g. A-101" />
          </div>
          <div>
            <label className="label">Floor</label>
            <input className="input" value={form.floor} onChange={set('floor')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">BHK</label>
            <select className="input" value={form.bhk} onChange={set('bhk')}>
              {BHK_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Occupants</label>
            <input className="input" value={form.occupants} onChange={set('occupants')} />
          </div>
        </div>
        <div>
          <label className="label">Owner Name</label>
          <input className="input" value={form.ownerName} onChange={set('ownerName')} />
        </div>
        <div>
          <label className="label">Custom Maintenance Amount (optional)</label>
          <input className="input" value={form.amountOverride} onChange={set('amountOverride')} placeholder="Leave blank to use BHK rate" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
