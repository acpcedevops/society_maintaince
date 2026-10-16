import { useEffect, useState } from 'react';
import { apiError } from '../lib/api.js';
import { money } from '../lib/format.js';
import { Icon, icons } from './Icon.jsx';

const METHODS = [
  { id: 'upi', label: 'UPI / QR' },
  { id: 'card', label: 'Card' },
  { id: 'netbanking', label: 'Netbanking' },
];

const BANKS = ['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank'];

export default function PaymentGateway({ open, amount, order, user, label, societyName, societyConfig, onClose, onPaid }) {
  const [method, setMethod] = useState('upi');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [upi, setUpi] = useState('');
  const [card, setCard] = useState({ number: '', name: user?.name || '', expiry: '', cvv: '' });
  const [bank, setBank] = useState(BANKS[0]);

  useEffect(() => {
    if (open) {
      setMethod('upi');
      setProcessing(false);
      setError('');
      setUpi('');
      setCard({ number: '', name: user?.name || '', expiry: '', cvv: '' });
      setBank(BANKS[0]);
    }
  }, [open, user]);

  if (!open) return null;

  const pay = async () => {
    setError('');
    if (method === 'upi' && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi.trim())) {
      setError('Enter a valid UPI ID (e.g. name@bank).');
      return;
    }
    if (method === 'card') {
      const digits = card.number.replace(/\s/g, '');
      if (digits.length < 12) return setError('Enter a valid card number.');
      if (!/^\d{2}\/\d{2}$/.test(card.expiry)) return setError('Enter expiry as MM/YY.');
      if (card.cvv.length < 3) return setError('Enter a valid CVV.');
    }

    setProcessing(true);
    try {
      await onPaid();
    } catch (err) {
      setError(apiError(err));
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/60 p-4 sm:items-center">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-gradient-to-r from-brand-700 to-brand-600 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 font-bold">
              {(societyName || 'S').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{societyName || 'Society'}</p>
              <p className="text-[11px] text-brand-100">Secure Payment Gateway</p>
            </div>
          </div>
          <button className="rounded p-1 hover:bg-white/10" onClick={onClose} disabled={processing} aria-label="Close">
            <Icon path={icons.close} className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center justify-between bg-amber-50 px-5 py-2 text-[11px] font-semibold text-amber-700">
          <span>TEST / SANDBOX MODE — no real money is charged</span>
          <span className="rounded bg-amber-100 px-1.5 py-0.5">DEMO</span>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4 rounded-xl bg-slate-50 p-4 text-center">
            <p className="text-xs font-medium text-slate-500">Amount Payable</p>
            <p className="text-3xl font-bold text-slate-800">{money(amount)}</p>
            {label && <p className="mt-1 text-xs text-slate-400">{label}</p>}
            {order?.id && <p className="mt-1 text-[11px] text-slate-400">Order: {order.id}</p>}
          </div>

          <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMethod(m.id);
                  setError('');
                }}
                className={`flex-1 rounded-md py-2 text-xs font-semibold transition ${
                  method === m.id ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {method === 'upi' && (
            <div className="space-y-3">
              {societyConfig?.upiId && (
                <div className="rounded-lg border border-brand-100 bg-brand-50/60 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">
                    Pay to {societyConfig.payeeName || societyName || 'this society'}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="break-all text-sm font-semibold text-slate-700">{societyConfig.upiId}</span>
                    <button
                      type="button"
                      className="btn-outline px-2 py-1 text-xs"
                      onClick={() => navigator.clipboard?.writeText(societyConfig.upiId)}
                    >
                      Copy
                    </button>
                  </div>
                  {societyConfig.qrImagePath && (
                    <img
                      src={societyConfig.qrImagePath}
                      alt="Payment QR code"
                      className="mt-3 h-32 w-32 rounded-lg border border-slate-200 bg-white object-contain"
                    />
                  )}
                </div>
              )}
              <div>
                <label className="label">UPI ID / VPA</label>
                <input
                  className="input"
                  placeholder="yourname@bank"
                  value={upi}
                  onChange={(e) => setUpi(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-500">
                <div className="grid h-16 w-16 grid-cols-4 grid-rows-4 gap-0.5 bg-slate-800 p-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <span key={i} className={i % 3 === 0 ? 'bg-white' : 'bg-slate-800'} />
                  ))}
                </div>
                <span>Scan the QR with any UPI app, or enter your UPI ID above.</span>
              </div>
            </div>
          )}

          {method === 'card' && (
            <div className="space-y-3">
              <div>
                <label className="label">Card Number</label>
                <input
                  className="input"
                  placeholder="4111 1111 1111 1111"
                  value={card.number}
                  onChange={(e) => setCard((c) => ({ ...c, number: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Name on Card</label>
                <input className="input" value={card.name} onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Expiry</label>
                  <input
                    className="input"
                    placeholder="MM/YY"
                    value={card.expiry}
                    onChange={(e) => setCard((c) => ({ ...c, expiry: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">CVV</label>
                  <input
                    className="input"
                    type="password"
                    placeholder="***"
                    maxLength={4}
                    value={card.cvv}
                    onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          {method === 'netbanking' && (
            <div>
              <label className="label">Select Bank</label>
              <select className="input" value={bank} onChange={(e) => setBank(e.target.value)}>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button className="btn-primary mt-5 w-full" onClick={pay} disabled={processing}>
            {processing ? (
              <>
                <Icon path="M21 12a9 9 0 11-6.219-8.56" className="h-4 w-4 animate-spin" />
                Processing payment...
              </>
            ) : (
              <>Pay {money(amount)}</>
            )}
          </button>

          <p className="mt-3 text-center text-[11px] text-slate-400">
            Payments are processed over a secure connection. This is a demo gateway.
          </p>
        </div>
      </div>
    </div>
  );
}
