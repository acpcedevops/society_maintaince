import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import api, { apiError } from '../lib/api.js';
import Modal from './Modal.jsx';
import Spinner from './Spinner.jsx';
import { Icon, icons } from './Icon.jsx';

export function passQrValue(pass) {
  return `SMPASS:${pass.token}`;
}

export function parsePassQr(text) {
  const raw = String(text || '').trim();
  return raw.startsWith('SMPASS:') ? raw.slice(7) : raw;
}

export default function QrPassModal({ open, onClose, entry, unitLabel }) {
  const [pass, setPass] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const body = entry?.id ? { gateEntryId: entry.id, purpose: entry.name } : {};
      const { data } = await api.post('/gate/passes', body);
      setPass(data.pass);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [entry?.id, entry?.name]);

  useEffect(() => {
    if (open) {
      setPass(null);
      generate();
    }
  }, [open, generate]);

  const revoke = async () => {
    if (!pass) return;
    try {
      await api.post(`/gate/passes/${pass.id}/revoke`);
      setPass((p) => ({ ...p, status: 'REVOKED' }));
    } catch (err) {
      setError(apiError(err));
    }
  };

  const copyCode = async () => {
    if (!pass) return;
    try {
      await navigator.clipboard.writeText(passQrValue(pass));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be blocked; the code is visible to type manually */
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Delivery QR Pass">
      <div className="space-y-4 text-center">
        {loading && <Spinner />}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        {pass && !loading && (
          <>
            <div className="mx-auto w-fit rounded-2xl border border-slate-200 bg-white p-4">
              {pass.status === 'ACTIVE' ? (
                <QRCodeSVG value={passQrValue(pass)} size={208} level="M" />
              ) : (
                <div className="flex h-52 w-52 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-500">
                  {pass.status === 'REVOKED' ? 'Pass revoked' : 'Pass expired'}
                </div>
              )}
            </div>
            {pass.status === 'ACTIVE' && (
              <div className="rounded-lg bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Manual code (if the guard has no camera)
                </p>
                <div className="mt-1 flex items-center justify-center gap-2">
                  <code className="break-all text-xs text-slate-700">{passQrValue(pass)}</code>
                  <button
                    type="button"
                    className="btn-ghost whitespace-nowrap px-2 py-1 text-xs"
                    onClick={copyCode}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
            <div className="text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                {unitLabel || (entry ? `Delivery for ${entry.name}` : 'Show this to the guard')}
              </p>
              <p className="text-xs text-slate-400">
                Expires {new Date(pass.expiresAt).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <button className="btn-ghost" onClick={generate}>
                <Icon path={icons.scan} className="h-4 w-4" /> New pass
              </button>
              {pass.status === 'ACTIVE' && (
                <button className="btn-ghost text-red-600" onClick={revoke}>
                  Revoke
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400">
              The guard scans this code at the gate to verify the delivery, then can call you through the app.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
