import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import superApi, { superError } from '../../lib/superApi.js';
import Badge from '../../components/Badge.jsx';
import Spinner from '../../components/Spinner.jsx';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
];

export default function SuperDashboard() {
  const [stats, setStats] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [o, s] = await Promise.all([
        superApi.get('/overview'),
        superApi.get('/societies', { params: filter ? { status: filter } : {} }),
      ]);
      setStats(o.data.stats);
      setSocieties(s.data.societies);
    } catch (err) {
      setError(superError(err));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (society, action) => {
    const verb = action === 'approve' ? 'approve' : 'reject';
    if (!confirm(`Are you sure you want to ${verb} "${society.name}"?`)) return;
    setBusyId(society.id);
    try {
      await superApi.post(`/societies/${society.id}/${action}`);
      await load();
    } catch (err) {
      alert(superError(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (society) => {
    if (
      !confirm(
        `Permanently delete "${society.name}" and all of its data (units, members, bills)? This cannot be undone.`
      )
    )
      return;
    setBusyId(society.id);
    try {
      await superApi.delete(`/societies/${society.id}`);
      await load();
    } catch (err) {
      alert(superError(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-800">Societies</h1>
        <p className="text-sm text-slate-400">Approve society admins and manage payment settings</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total" value={stats.total} tone="slate" />
          <Stat label="Pending" value={stats.pending} tone="amber" />
          <Stat label="Approved" value={stats.approved} tone="emerald" />
          <Stat label="Members" value={stats.members} tone="brand" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id || 'all'}
            onClick={() => setFilter(f.id)}
            className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition ${
              filter === f.id
                ? 'border-brand-500 bg-brand-50 text-brand-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <Spinner />
      ) : societies.length === 0 ? (
        <p className="card py-12 text-center text-sm text-slate-400">No societies found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {societies.map((s) => (
            <div key={s.id} className="card flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-bold text-slate-800">{s.name}</h2>
                    <Badge value={s.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Code {s.code}
                    {s.address ? ` · ${s.address}` : ''}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat label="Units" value={s.units} />
                <MiniStat label="Users" value={s.users} />
                <MiniStat
                  label="Payment"
                  value={s.paymentConfig?.hasRazorpay || s.paymentConfig?.upiId ? 'Set' : '—'}
                />
              </div>

              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <span className="font-semibold text-slate-500">Admin: </span>
                {s.admins.length > 0 ? (
                  s.admins.map((a) => `${a.name} (${a.phone})`).join(', ')
                ) : (
                  <span className="text-slate-400">No admin account</span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {s.status !== 'APPROVED' && (
                  <button
                    className="btn-primary px-3 py-1.5 text-sm"
                    onClick={() => decide(s, 'approve')}
                    disabled={busyId === s.id}
                  >
                    Approve
                  </button>
                )}
                {s.status !== 'REJECTED' && (
                  <button
                    className="btn-outline px-3 py-1.5 text-sm text-red-600"
                    onClick={() => decide(s, 'reject')}
                    disabled={busyId === s.id}
                  >
                    Reject
                  </button>
                )}
                <button
                  className="btn-outline px-3 py-1.5 text-sm text-red-600"
                  onClick={() => remove(s)}
                  disabled={busyId === s.id}
                >
                  Delete
                </button>
                <Link
                  to={`/super/societies/${s.id}`}
                  className="btn-outline ml-auto px-3 py-1.5 text-sm"
                >
                  Payment Settings
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = {
    slate: 'text-slate-700',
    amber: 'text-amber-600',
    emerald: 'text-emerald-600',
    brand: 'text-brand-700',
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone] || 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white py-2">
      <p className="text-sm font-bold text-slate-700">{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
