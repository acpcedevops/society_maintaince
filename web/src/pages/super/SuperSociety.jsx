import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import superApi, { superError } from '../../lib/superApi.js';
import Badge from '../../components/Badge.jsx';
import Spinner from '../../components/Spinner.jsx';
import { Icon } from '../../components/Icon.jsx';

const EMPTY = {
  upiId: '',
  payeeName: '',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankIfsc: '',
  razorpayKeyId: '',
  razorpayKeySecret: '',
  qrImagePath: '',
};

export default function SuperSociety() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [society, setSociety] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await superApi.get(`/societies/${id}`);
      setSociety(data.society);
      const p = data.society.paymentConfig || {};
      setForm({
        upiId: p.upiId || '',
        payeeName: p.payeeName || '',
        bankName: p.bankName || '',
        bankAccountName: p.bankAccountName || '',
        bankAccountNumber: p.bankAccountNumber || '',
        bankIfsc: p.bankIfsc || '',
        razorpayKeyId: p.razorpayKeyId || '',
        razorpayKeySecret: '',
        qrImagePath: p.qrImagePath || '',
      });
    } catch (err) {
      setError(superError(err));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const decide = async (action) => {
    if (!confirm(`Are you sure you want to ${action} "${society.name}"?`)) return;
    setBusy(true);
    try {
      await superApi.post(`/societies/${id}/${action}`);
      await load();
    } catch (err) {
      alert(superError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (
      !confirm(
        `Permanently delete "${society.name}" and all of its data (units, members, bills)? This cannot be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      await superApi.delete(`/societies/${id}`);
      navigate('/super');
    } catch (err) {
      alert(superError(err));
      setBusy(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const payload = {
        upiId: form.upiId,
        payeeName: form.payeeName,
        bankName: form.bankName,
        bankAccountName: form.bankAccountName,
        bankAccountNumber: form.bankAccountNumber,
        bankIfsc: form.bankIfsc,
        razorpayKeyId: form.razorpayKeyId,
        qrImagePath: form.qrImagePath,
      };
      if (form.razorpayKeySecret) {
        payload.razorpayKeySecret = form.razorpayKeySecret;
      } else if (!form.razorpayKeyId) {
        payload.razorpayKeySecret = '';
      }
      await superApi.put(`/societies/${id}/payment`, payload);
      setSaved('Payment settings saved.');
      await load();
    } catch (err) {
      setError(superError(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner />;
  if (!society) return <p className="text-sm text-red-600">{error || 'Society not found'}</p>;

  return (
    <div className="space-y-5">
      <Link to="/super" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <Icon path="M15 18l-6-6 6-6" className="h-4 w-4" /> Back to societies
      </Link>

      <div className="card flex flex-wrap items-start justify-between gap-3 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-slate-800">{society.name}</h1>
            <Badge value={society.status} />
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Code {society.code}
            {society.address ? ` · ${society.address}` : ''}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            {society.counts.units} units · {society.counts.users} users · {society.counts.complaints} complaints
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <span className="font-semibold">Admin:</span>{' '}
            {society.admins.length > 0
              ? society.admins.map((a) => `${a.name} (${a.phone}) · ${a.status}`).join(', ')
              : 'No admin account'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {society.status !== 'APPROVED' && (
            <button className="btn-primary px-3 py-1.5 text-sm" onClick={() => decide('approve')} disabled={busy}>
              Approve
            </button>
          )}
          {society.status !== 'REJECTED' && (
            <button
              className="btn-outline px-3 py-1.5 text-sm text-red-600"
              onClick={() => decide('reject')}
              disabled={busy}
            >
              Reject
            </button>
          )}
          <button
            className="btn-outline px-3 py-1.5 text-sm text-red-600"
            onClick={remove}
            disabled={busy}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-base font-semibold text-slate-800">Payment Settings</h2>
        <p className="mb-4 text-xs text-slate-400">
          These details are shown to this society&apos;s members when they pay their maintenance bills.
        </p>

        <div className="space-y-5">
          <Section title="UPI">
            <Field label="UPI ID / VPA">
              <input className="input" value={form.upiId} onChange={set('upiId')} placeholder="society@bank" />
            </Field>
            <Field label="Payee Name">
              <input className="input" value={form.payeeName} onChange={set('payeeName')} placeholder="Society RWA" />
            </Field>
            <Field label="QR Image URL (optional)">
              <input className="input" value={form.qrImagePath} onChange={set('qrImagePath')} placeholder="https://…/qr.png" />
            </Field>
          </Section>

          <Section title="Bank Account">
            <Field label="Bank Name">
              <input className="input" value={form.bankName} onChange={set('bankName')} placeholder="HDFC Bank" />
            </Field>
            <Field label="Account Name">
              <input className="input" value={form.bankAccountName} onChange={set('bankAccountName')} />
            </Field>
            <Field label="Account Number">
              <input className="input" value={form.bankAccountNumber} onChange={set('bankAccountNumber')} />
            </Field>
            <Field label="IFSC Code">
              <input className="input" value={form.bankIfsc} onChange={set('bankIfsc')} placeholder="HDFC0001234" />
            </Field>
          </Section>

          <Section title="Razorpay (optional — enables online checkout)">
            <Field label="Key ID">
              <input className="input" value={form.razorpayKeyId} onChange={set('razorpayKeyId')} placeholder="rzp_live_…" />
            </Field>
            <Field label="Key Secret">
              <input
                className="input"
                type="password"
                value={form.razorpayKeySecret}
                onChange={set('razorpayKeySecret')}
                placeholder={society.paymentConfig?.hasRazorpay ? '•••••••• saved (leave blank to keep)' : 'Enter key secret'}
                autoComplete="new-password"
              />
            </Field>
          </Section>
        </div>

        {saved && <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{saved}</p>}
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end">
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Payment Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
