import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { apiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useCall } from '../context/CallContext.jsx';
import { formatDateTime } from '../lib/format.js';
import Badge from '../components/Badge.jsx';
import Modal from '../components/Modal.jsx';
import Spinner from '../components/Spinner.jsx';
import QrPassModal, { parsePassQr } from '../components/QrPassModal.jsx';
import QrScanner from '../components/QrScanner.jsx';
import { Icon, icons } from '../components/Icon.jsx';

const VISITOR_TYPES = ['GUEST', 'DELIVERY', 'CAB', 'MAID', 'COOK', 'MAINTENANCE', 'OTHER'];
const PLACEMENTS = [
  { value: 'GATE', label: 'At the gate' },
  { value: 'LOBBY', label: 'In the lobby' },
  { value: 'DROPBOX', label: 'Drop box' },
  { value: 'HANDED_DIRECT', label: 'Handed to resident directly' },
];
const MODES = [
  { value: 'GATED', label: 'Gated - resident approval required' },
  { value: 'NON_GATED', label: 'Non-gated - guard logs only' },
  { value: 'HYBRID', label: 'Hybrid' },
];

const OPEN_STATUSES = ['PENDING', 'EXPIRED'];

export default function Gate() {
  const { user, isAdmin, isGuard } = useAuth();
  const { startCall, phase } = useCall();
  const isResident = !isAdmin && !isGuard;
  const [tab, setTab] = useState('activity');
  const [policy, setPolicy] = useState(null);
  const [entries, setEntries] = useState([]);
  const [packages, setPackages] = useState([]);
  const [guards, setGuards] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [deciding, setDeciding] = useState(null);
  const [passEntry, setPassEntry] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const reqs = [api.get('/gate/policy'), api.get('/gate/entries'), api.get('/gate/packages')];
      if (isAdmin) reqs.push(api.get('/gate/guards'));
      const [p, e, pk, g] = await Promise.all(reqs);
      setPolicy(p.data.policy);
      setEntries(e.data.entries);
      setPackages(pk.data.packages);
      if (g) setGuards(g.data.guards);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!isGuard && !isAdmin) return;
    api
      .get(`/societies/${user.society.id}/units`)
      .then((res) => setUnits(res.data.units))
      .catch(() => {});
  }, [isGuard, isAdmin, user?.society?.id]);

  const stats = useMemo(() => {
    const pending = entries.filter((e) => OPEN_STATUSES.includes(e.status)).length;
    const inside = entries.filter((e) => e.status === 'ENTERED').length;
    const waiting = packages.filter((p) => p.status === 'WAITING').length;
    return { pending, inside, waiting };
  }, [entries, packages]);

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(apiError(err));
    }
  };

  const openPass = (entry = null) => {
    setPassEntry(entry);
    setShowPass(true);
  };

  const verifyToken = async (raw) => {
    setScanOpen(false);
    setScanResult({ loading: true });
    try {
      const token = parsePassQr(raw);
      const { data } = await api.post('/gate/passes/verify', { token });
      setScanResult({ ok: true, ...data });
      await load();
    } catch (err) {
      setScanResult({ ok: false, error: apiError(err) });
    }
  };

  const callResident = async (opts = {}) => {
    setError('');
    try {
      let resident = opts.resident;
      let unitNo = opts.unitNo;
      if (!resident?.id && opts.entryId) {
        const { data } = await api.get(`/gate/entries/${opts.entryId}/resident`);
        resident = data.resident;
        unitNo = data.unit?.unitNo;
      }
      if (!resident?.id) {
        setError('No resident contact found for this unit.');
        return;
      }
      await startCall(resident.id, { name: resident.name, unitNo, entryId: opts.entryId });
    } catch (err) {
      setError(apiError(err));
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Gate &amp; Visitor Management</h1>
          <p className="text-sm text-slate-400">
            {isGuard
              ? 'Log visitors, deliveries and manage packages at the gate'
              : isAdmin
              ? 'Oversee security, visitors, deliveries and gate policy'
              : 'Approve visitors and track your deliveries'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
              {['activity', 'settings'].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                    tab === t ? 'bg-brand-600 text-white' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {isResident && (
            <button className="btn-outline" onClick={() => openPass(null)}>
              <Icon path={icons.scan} className="h-4 w-4" /> My Delivery Pass
            </button>
          )}
          {(isGuard || isAdmin) && tab === 'activity' && (
            <>
              <button
                className="btn-outline"
                onClick={() => setScanOpen(true)}
                disabled={phase !== 'idle'}
                title={phase !== 'idle' ? 'Finish the current call first' : 'Scan a resident QR pass'}
              >
                <Icon path={icons.scan} className="h-4 w-4" /> Scan Pass
              </button>
              <button className="btn-primary" onClick={() => setShowLog(true)}>
                <Icon path={icons.plus} className="h-4 w-4" /> Log Entry
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {policy && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge value={policy.mode} />
          {policy.dropPointEnabled && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
              Drop point: {policy.dropPointLabel || 'Gate'}
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
            {policy.guardCanOverride ? 'Guard can admit directly' : 'Resident approval required'}
          </span>
        </div>
      )}

      {tab === 'settings' && isAdmin ? (
        <SettingsPanel policy={policy} guards={guards} onSaved={load} />
      ) : (
        <ActivityPanel
          isAdmin={isAdmin}
          isGuard={isGuard}
          entries={entries}
          packages={packages}
          stats={stats}
          onAct={act}
          onDecide={setDeciding}
          onShowPass={openPass}
          onCall={callResident}
          callBusy={phase !== 'idle'}
        />
      )}

      <LogVisitorModal
        open={showLog}
        onClose={() => setShowLog(false)}
        units={units}
        guardCanOverride={policy?.guardCanOverride}
        onDone={load}
      />
      <DecisionModal
        entry={deciding}
        policy={policy}
        onClose={() => setDeciding(null)}
        onDone={load}
      />
      <QrPassModal
        open={showPass}
        onClose={() => setShowPass(false)}
        entry={passEntry}
        unitLabel={user?.unit?.unitNo ? `Unit ${user.unit.unitNo}` : undefined}
      />
      <QrScanner open={scanOpen} onClose={() => setScanOpen(false)} onToken={verifyToken} />
      <ScanResultModal
        result={scanResult}
        onClose={() => setScanResult(null)}
        onCall={(resident, unitNo) => {
          setScanResult(null);
          callResident({ resident, unitNo });
        }}
      />
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="card flex items-center justify-between p-4">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className={`text-2xl font-bold ${tone || 'text-slate-800'}`}>{value}</span>
    </div>
  );
}

function ActivityPanel({ isAdmin, isGuard, entries, packages, stats, onAct, onDecide, onShowPass, onCall, callBusy }) {
  const open = entries.filter((e) => OPEN_STATUSES.includes(e.status));
  const active = entries.filter((e) => ['APPROVED', 'ENTERED'].includes(e.status));
  const waiting = packages.filter((p) => p.status === 'WAITING');

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Awaiting approval" value={stats.pending} tone="text-amber-600" />
        <Stat label="Currently inside" value={stats.inside} tone="text-brand-600" />
        <Stat label="Packages waiting" value={stats.waiting} tone="text-emerald-600" />
      </div>

      {isGuard || isAdmin ? (
        <>
          <Section title="Open requests" count={open.length}>
            {open.length === 0 ? (
              <Empty text="No pending visitor requests." />
            ) : (
              open.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  actions={
                    <>
                      <button
                        className="btn-outline"
                        onClick={() => onCall({ entryId: e.id })}
                        disabled={callBusy}
                        title={callBusy ? 'Finish the current call first' : 'Call the resident through the app'}
                      >
                        <Icon path={icons.phone} className="h-4 w-4" /> Call
                      </button>
                      {isAdmin && (
                        <>
                          <button className="btn-outline" onClick={() => onDecide(e)}>
                            Approve
                          </button>
                          <button
                            className="btn-outline"
                            onClick={() => onAct(() => api.post(`/gate/entries/${e.id}/decision`, { decision: 'DENIED' }))}
                          >
                            Deny
                          </button>
                        </>
                      )}
                    </>
                  }
                />
              ))
            )}
          </Section>

          <Section title="Active (approved / inside)" count={active.length}>
            {active.length === 0 ? (
              <Empty text="No active visitors." />
            ) : (
              active.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  actions={
                    <>
                      <button
                        className="btn-outline"
                        onClick={() => onCall({ entryId: e.id })}
                        disabled={callBusy}
                        title={callBusy ? 'Finish the current call first' : 'Call the resident through the app'}
                      >
                        <Icon path={icons.phone} className="h-4 w-4" /> Call
                      </button>
                      {e.status === 'APPROVED' ? (
                        <button className="btn-outline" onClick={() => onAct(() => api.post(`/gate/entries/${e.id}/enter`))}>
                          <Icon path={icons.login} className="h-4 w-4" /> Mark Entry
                        </button>
                      ) : (
                        <button className="btn-outline" onClick={() => onAct(() => api.post(`/gate/entries/${e.id}/exit`))}>
                          <Icon path={icons.logout} className="h-4 w-4" /> Mark Exit
                        </button>
                      )}
                    </>
                  }
                />
              ))
            )}
          </Section>
        </>
      ) : (
        <Section title="Requests awaiting your approval" count={open.length}>
          {open.length === 0 ? (
            <Empty text="Nothing waiting on you right now." />
          ) : (
            open.map((e) => (
              <EntryRow
                key={e.id}
                entry={e}
                highlight
                actions={
                  <>
                    {e.type === 'DELIVERY' && (
                      <button className="btn-outline" onClick={() => onShowPass(e)}>
                        <Icon path={icons.scan} className="h-4 w-4" /> QR Pass
                      </button>
                    )}
                    <button className="btn-primary" onClick={() => onDecide(e)}>
                      Approve
                    </button>
                    <button
                      className="btn-outline"
                      onClick={() => onAct(() => api.post(`/gate/entries/${e.id}/decision`, { decision: 'DENIED' }))}
                    >
                      Deny
                    </button>
                  </>
                }
              />
            ))
          )}
        </Section>
      )}

      <Section title="Packages" count={waiting.length}>
        {packages.length === 0 ? (
          <Empty text="No deliveries logged yet." />
        ) : (
          packages.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 py-3 last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <Icon path={icons.box} className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {p.partner || 'Delivery'} · {p.count} item{p.count > 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-400">
                    Unit {p.unit?.unitNo} · {formatDateTime(p.receivedAt)}
                    {p.collectedBy?.name ? ` · collected by ${p.collectedBy.name}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {p.placement}
                </span>
                <Badge value={p.status} />
                {p.status === 'WAITING' && (
                  <button
                    className="btn-outline"
                    onClick={() => onAct(() => api.post(`/gate/packages/${p.id}/collect`))}
                  >
                    {isGuard || isAdmin ? 'Handed over' : 'Collected'}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Recent history" count={entries.length}>
        {entries.length === 0 ? (
          <Empty text="No gate activity yet." />
        ) : (
          entries.slice(0, 12).map((e) => <EntryRow key={`h-${e.id}`} entry={e} compact />)
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{count}</span>
      </div>
      <div className="px-4 py-2">{children}</div>
    </div>
  );
}

function Empty({ text }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>;
}

function EntryRow({ entry, actions, highlight, compact }) {
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 py-3 last:border-0 ${
        highlight ? 'rounded-lg' : ''
      }`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon path={icons.shield} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-700">
            {entry.name}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {entry.type}
            </span>
          </p>
          <p className="truncate text-xs text-slate-400">
            Unit {entry.unit?.unitNo}
            {entry.purpose ? ` · ${entry.purpose}` : ''}
            {entry.vehicleNo ? ` · ${entry.vehicleNo}` : ''}
            {` · ${formatDateTime(entry.createdAt)}`}
            {entry.decisionBy?.name ? ` · by ${entry.decisionBy.name}` : ''}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge value={entry.status} />
        {!compact && actions}
      </div>
    </div>
  );
}

function LogVisitorModal({ open, onClose, units, guardCanOverride, onDone }) {
  const { user, isAdmin, isGuard } = useAuth();
  const [form, setForm] = useState({
    unitId: '',
    type: 'GUEST',
    name: '',
    phone: '',
    vehicleNo: '',
    purpose: '',
    directAdmit: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm((f) => ({
        ...f,
        unitId: units[0]?.id ? String(units[0].id) : '',
        type: 'GUEST',
        name: '',
        phone: '',
        vehicleNo: '',
        purpose: '',
        directAdmit: false,
      }));
      setError('');
    }
  }, [open, units]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post('/gate/entries', { ...form, unitId: Number(form.unitId) });
      onDone();
      onClose();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const requiresUnit = !user?.unitId;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Gate Entry"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy || (requiresUnit && !form.unitId)}>
            {busy ? 'Saving...' : 'Log Entry'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {requiresUnit && (
          <div>
            <label className="label">Unit</label>
            <select className="input" value={form.unitId} onChange={set('unitId')}>
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNo} ({u.bhk})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Type</label>
            <select className="input" value={form.type} onChange={set('type')}>
              {VISITOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Name</label>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Visitor name" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="Optional" />
          </div>
          <div>
            <label className="label">Vehicle No.</label>
            <input className="input" value={form.vehicleNo} onChange={set('vehicleNo')} placeholder="Optional" />
          </div>
        </div>
        <div>
          <label className="label">Purpose / Note</label>
          <input className="input" value={form.purpose} onChange={set('purpose')} placeholder="e.g. Amazon delivery" />
        </div>
        {(isGuard || isAdmin) && guardCanOverride && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.directAdmit}
              onChange={(e) => setForm((f) => ({ ...f, directAdmit: e.target.checked }))}
            />
            Admit directly (skip resident approval)
          </label>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function DecisionModal({ entry, policy, onClose, onDone }) {
  const [placement, setPlacement] = useState('HANDED_DIRECT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entry) {
      setPlacement('HANDED_DIRECT');
      setError('');
    }
  }, [entry]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/gate/entries/${entry.id}/decision`, { decision: 'APPROVED', placement });
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
      open={Boolean(entry)}
      onClose={onClose}
      title="Approve Visitor"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Approving...' : 'Approve'}
          </button>
        </>
      }
    >
      {entry && (
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">{entry.name}</p>
            <p className="text-xs text-slate-400">
              {entry.type} · Unit {entry.unit?.unitNo}
              {entry.purpose ? ` · ${entry.purpose}` : ''}
            </p>
          </div>
          {entry.type === 'DELIVERY' && policy?.dropPointEnabled && (
            <div>
              <label className="label">Where should the package be left?</label>
              <select className="input" value={placement} onChange={(e) => setPlacement(e.target.value)}>
                {PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Choosing a drop point creates a package for tracking. "Handed directly" skips tracking.
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}
    </Modal>
  );
}

function ScanResultModal({ result, onClose, onCall }) {
  const open = Boolean(result);
  return (
    <Modal open={open} onClose={onClose} title="Delivery Verification">
      {result?.loading && <Spinner label="Verifying pass…" />}
      {result?.ok && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-3 text-emerald-700">
            <Icon path={icons.check} className="h-5 w-5" />
            <div>
              <p className="text-sm font-semibold">Delivery verified</p>
              <p className="text-xs text-emerald-600">
                Pass for unit {result.unit?.unitNo} accepted at {new Date().toLocaleTimeString()}
              </p>
            </div>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">{result.resident?.name || 'Resident'}</p>
            <p className="text-xs text-slate-400">
              Unit {result.unit?.unitNo}
              {result.resident?.phone ? ` · ${result.resident.phone}` : ''}
              {result.package?.placement ? ` · left at ${result.package.placement}` : ''}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-outline" onClick={onClose}>
              Done
            </button>
            {result.resident?.id && (
              <button className="btn-primary" onClick={() => onCall(result.resident, result.unit?.unitNo)}>
                <Icon path={icons.phone} className="h-4 w-4" /> Call resident
              </button>
            )}
          </div>
        </div>
      )}
      {result && !result.loading && !result.ok && (
        <div className="space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">{result.error}</p>
          <div className="flex justify-end">
            <button className="btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function SettingsPanel({ policy, guards, onSaved }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <PolicyCard policy={policy} onSaved={onSaved} />
      <GuardsCard guards={guards} onSaved={onSaved} />
    </div>
  );
}

function PolicyCard({ policy, onSaved }) {
  const [form, setForm] = useState(policy);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm(policy);
  }, [policy]);

  const submit = async () => {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api.put('/gate/policy', {
        mode: form.mode,
        requireOtpForDelivery: form.requireOtpForDelivery,
        guardCanOverride: form.guardCanOverride,
        dropPointEnabled: form.dropPointEnabled,
        dropPointLabel: form.dropPointLabel,
        otpExpiryMinutes: form.otpExpiryMinutes,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  if (!form) return null;

  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));

  return (
    <div className="card">
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
        <Icon path={icons.settings} className="h-4 w-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-700">Security Policy</h2>
      </div>
      <div className="space-y-4 px-4 py-4">
        <div>
          <label className="label">Gate mode</label>
          <select className="input" value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value }))}>
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Drop point label</label>
          <input
            className="input"
            value={form.dropPointLabel || ''}
            onChange={(e) => setForm((f) => ({ ...f, dropPointLabel: e.target.value }))}
          />
        </div>
        <div>
          <label className="label">Delivery OTP expiry (minutes)</label>
          <input
            className="input"
            type="number"
            value={form.otpExpiryMinutes}
            onChange={(e) => setForm((f) => ({ ...f, otpExpiryMinutes: e.target.value }))}
          />
        </div>
        <label className="flex items-center justify-between text-sm text-slate-600">
          Require OTP for deliveries
          <input type="checkbox" checked={form.requireOtpForDelivery} onChange={toggle('requireOtpForDelivery')} />
        </label>
        <label className="flex items-center justify-between text-sm text-slate-600">
          Guard can admit directly (override)
          <input type="checkbox" checked={form.guardCanOverride} onChange={toggle('guardCanOverride')} />
        </label>
        <label className="flex items-center justify-between text-sm text-slate-600">
          Enable drop point
          <input type="checkbox" checked={form.dropPointEnabled} onChange={toggle('dropPointEnabled')} />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && <p className="text-sm text-emerald-600">Policy saved.</p>}
        <button className="btn-primary w-full" onClick={submit} disabled={busy}>
          {busy ? 'Saving...' : 'Save Policy'}
        </button>
      </div>
    </div>
  );
}

function GuardsCard({ guards, onSaved }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');

  const remove = async (g) => {
    if (!window.confirm(`Remove guard ${g.name}?`)) return;
    try {
      await api.delete(`/gate/guards/${g.id}`);
      onSaved();
    } catch (err) {
      setError(apiError(err));
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-700">Guards</h2>
        <button className="btn-outline" onClick={() => setEditing({})}>
          <Icon path={icons.plus} className="h-4 w-4" /> Add Guard
        </button>
      </div>
      <div className="px-4 py-2">
        {error && <p className="py-2 text-sm text-red-600">{error}</p>}
        {guards.length === 0 ? (
          <Empty text="No guards added yet." />
        ) : (
          guards.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 border-b border-slate-50 py-3 last:border-0">
              <div>
                <p className="text-sm font-semibold text-slate-700">{g.name}</p>
                <p className="text-xs text-slate-400">{g.phone}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="btn-ghost text-brand-600" onClick={() => setEditing(g)}>
                  Edit
                </button>
                <button className="btn-ghost text-red-600" onClick={() => remove(g)}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <GuardModal guard={editing} onClose={() => setEditing(null)} onDone={onSaved} />
    </div>
  );
}

function GuardModal({ guard, onClose, onDone }) {
  const isNew = guard && !guard.id;
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (guard) {
      setForm({ name: guard.name || '', phone: guard.phone || '', password: '' });
      setError('');
    }
  }, [guard]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (isNew) {
        await api.post('/gate/guards', { ...form, password: form.password || undefined });
      } else {
        const payload = { name: form.name, phone: form.phone };
        if (form.password) payload.password = form.password;
        await api.put(`/gate/guards/${guard.id}`, payload);
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
      open={Boolean(guard)}
      onClose={onClose}
      title={isNew ? 'Add Guard' : 'Edit Guard'}
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
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Guard name" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={set('phone')} placeholder="10-digit phone" />
        </div>
        <div>
          <label className="label">{isNew ? 'Password' : 'New password (leave blank to keep)'}</label>
          <input className="input" value={form.password} onChange={set('password')} placeholder="min 6 characters" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
