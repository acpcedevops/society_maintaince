import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import api, { apiError } from '../lib/api.js';

const EMPTY = {
  societyId: '',
  unitNo: '',
  name: '',
  email: '',
  phone: '',
  password: '',
  societyName: '',
  societyAddress: '',
};

export default function Login() {
  const { login, register, registerSociety, user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // login | register
  const [registerType, setRegisterType] = useState('member'); // member | society
  const [societies, setSocieties] = useState([]);
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY);

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api
      .get('/societies')
      .then((res) => setSocieties(res.data.societies))
      .catch(() => setSocieties([]));
  }, []);

  useEffect(() => {
    if (registerType === 'member' && form.societyId) {
      api
        .get(`/societies/${form.societyId}/units`)
        .then((res) => setUnits(res.data.units))
        .catch(() => setUnits([]));
    } else {
      setUnits([]);
    }
  }, [form.societyId, registerType]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setForm(EMPTY);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        if (!form.societyId) throw new Error('Please select your society');
        await login(form.societyId, form.phone.trim(), form.password);
      } else if (registerType === 'member') {
        if (!form.societyId) throw new Error('Please select your society');
        await register({
          societyId: form.societyId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
          unitNo: form.unitNo || undefined,
        });
      } else {
        await registerSociety({
          societyName: form.societyName.trim(),
          societyAddress: form.societyAddress.trim() || undefined,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
        });
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';
  const isJoin = !isLogin && registerType === 'member';
  const isCreate = !isLogin && registerType === 'society';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-600 to-brand-700 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold text-white">
            N
          </div>
          <h1 className="text-2xl font-bold text-white">Society Maintenance Portal</h1>
          <p className="text-sm text-brand-100">Maintenance &amp; Community Management</p>
        </div>

        <div className="card p-6">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md py-2 text-sm font-semibold transition ${
                  mode === m ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'
                }`}
              >
                {m === 'login' ? 'Login' : 'Create Account'}
              </button>
            ))}
          </div>

          {!isLogin && (
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setRegisterType('member');
                  setError('');
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isJoin ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                Join a society
              </button>
              <button
                type="button"
                onClick={() => {
                  setRegisterType('society');
                  setError('');
                }}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  isCreate ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
                }`}
              >
                Create a new society
              </button>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {!isCreate && (
              <div>
                <label className="label">Society</label>
                <select className="input" value={form.societyId} onChange={set('societyId')} required>
                  <option value="">Select your society…</option>
                  {societies.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {societies.length === 0 && (
                  <p className="mt-1 text-xs text-slate-400">No societies yet — create one below.</p>
                )}
              </div>
            )}

            {isCreate && (
              <>
                <div>
                  <label className="label">Society Name</label>
                  <input
                    className="input"
                    value={form.societyName}
                    onChange={set('societyName')}
                    required
                    placeholder="e.g. Sunrise Apartments"
                  />
                </div>
                <div>
                  <label className="label">Address (optional)</label>
                  <input className="input" value={form.societyAddress} onChange={set('societyAddress')} placeholder="City, State" />
                </div>
              </>
            )}

            {isJoin && (
              <div>
                <label className="label">Flat / Unit Number</label>
                <select className="input" value={form.unitNo} onChange={set('unitNo')}>
                  <option value="">Select your unit…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.unitNo}>
                      {u.unitNo} · {u.bhk}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(!isLogin || isCreate) && (
              <div>
                <label className="label">{isCreate ? 'Admin Full Name' : 'Full Name'}</label>
                <input className="input" value={form.name} onChange={set('name')} required placeholder="Your full name" />
              </div>
            )}

            {!isLogin && (
              <div>
                <label className="label">Email (optional)</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </div>
            )}

            <div>
              <label className="label">Phone Number</label>
              <input
                className="input"
                value={form.phone}
                onChange={set('phone')}
                required
                minLength={10}
                placeholder="10-digit mobile number"
              />
            </div>

            <div>
              <label className="label">Password</label>
              <input
                className="input"
                type="password"
                value={form.password}
                onChange={set('password')}
                required
                minLength={isLogin ? 1 : 6}
                placeholder="Password (min 6 chars)"
              />
            </div>

            {isCreate && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                You will become the administrator of this society. You can add units and members next.
              </p>
            )}

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Please wait...' : isLogin ? 'Login' : isCreate ? 'Create Society' : 'Create Account'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-400">
            Demo — Neev Plaza: Admin 9999999999 / admin123 · Member 9000000000 / member123
            <br />
            Green Valley: Admin 9999999999 / admin123 (same number, different society)
          </p>
        </div>
      </div>
    </div>
  );
}
