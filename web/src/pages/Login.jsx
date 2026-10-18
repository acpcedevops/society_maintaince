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
  username: '',
  password: '',
  societyName: '',
  societyAddress: '',
};

export default function Login() {
  const { login, register, registerSociety, forgotPassword, user } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // login | register | forgot
  const [registerType, setRegisterType] = useState('member'); // member | society
  const [societies, setSocieties] = useState([]);
  const [units, setUnits] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
    if (registerType === 'member' && form.societyId && mode === 'register') {
      api
        .get(`/societies/${form.societyId}/units`)
        .then((res) => setUnits(res.data.units))
        .catch(() => setUnits([]));
    } else {
      setUnits([]);
    }
  }, [form.societyId, registerType, mode]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setNotice('');
    setForm(EMPTY);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'forgot') {
        if (!form.societyId) throw new Error('Please select your society');
        if (!form.email.trim()) throw new Error('Please enter your email address');
        const res = await forgotPassword({ societyId: form.societyId, email: form.email.trim() });
        setNotice(res.message || 'If an account with that email exists, a reset link has been sent.');
        setForm((f) => ({ ...f, email: '' }));
      } else if (mode === 'login') {
        if (!form.username.trim()) throw new Error('Please enter your username');
        await login(form.username.trim(), form.password);
        navigate('/', { replace: true });
      } else if (registerType === 'member') {
        if (!form.societyId) throw new Error('Please select your society');
        const result = await register({
          societyId: form.societyId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
          unitNo: form.unitNo || undefined,
        });
        if (result && result.pending) {
          setMode('login');
          setForm(EMPTY);
          setNotice(result.message);
          return;
        }
        navigate('/', { replace: true });
      } else {
        const result = await registerSociety({
          societyName: form.societyName.trim(),
          societyAddress: form.societyAddress.trim() || undefined,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          password: form.password,
        });
        if (result && result.pending) {
          setMode('login');
          setForm(EMPTY);
          setNotice(result.message);
          return;
        }
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  const isLogin = mode === 'login';
  const isForgot = mode === 'forgot';
  const isRegister = mode === 'register';
  const isJoin = isRegister && registerType === 'member';
  const isCreate = isRegister && registerType === 'society';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-600 to-brand-700 px-4 py-8 sm:py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center sm:mb-6">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold text-white">
            N
          </div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Society Maintenance Portal</h1>
          <p className="text-sm text-brand-100">Maintenance &amp; Community Management</p>
        </div>

        <div className="card p-5 sm:p-6">
          {!isForgot && (
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
          )}

          {isForgot && (
            <div className="mb-4">
              <h2 className="text-base font-semibold text-slate-800">Reset your password</h2>
              <p className="text-xs text-slate-400">
                Enter your society and registered email. We&apos;ll email you a secure link to set a new password.
              </p>
            </div>
          )}

          {isRegister && (
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
            {!isCreate && !isLogin && (
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

            {isRegister && (
              <div>
                <label className="label">{isCreate ? 'Admin Full Name' : 'Full Name'}</label>
                <input className="input" value={form.name} onChange={set('name')} required placeholder="Your full name" />
              </div>
            )}

            {(isRegister || isForgot) && (
              <div>
                <label className="label">{isForgot ? 'Registered Email' : 'Email (optional)'}</label>
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={set('email')}
                  required={isForgot}
                  placeholder="you@example.com"
                />
              </div>
            )}

            {isLogin && (
              <div>
                <label className="label">Username</label>
                <input
                  className="input"
                  value={form.username}
                  onChange={set('username')}
                  required
                  placeholder="Your username (mobile number)"
                  autoComplete="username"
                />
              </div>
            )}

            {isRegister && (
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
            )}

            {!isForgot && (
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
            )}

            {isCreate && (
              <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">
                You will become the administrator of this society. A platform administrator must approve it
                before you can log in.
              </p>
            )}

            {isJoin && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                New member accounts need approval from a society admin before you can log in.
              </p>
            )}

            {notice && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy
                ? 'Please wait...'
                : isForgot
                ? 'Send reset link'
                : isLogin
                ? 'Login'
                : isCreate
                ? 'Create Society'
                : 'Create Account'}
            </button>
          </form>

          {isLogin && (
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="mt-3 block w-full text-center text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Forgot password?
            </button>
          )}

          {isForgot && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="mt-3 block w-full text-center text-xs font-semibold text-brand-600 hover:text-brand-700"
            >
              Back to login
            </button>
          )}

          <p className="mt-4 text-center text-xs text-slate-400">
            Platform administrator?{' '}
            <a href="/super/login" className="font-semibold text-brand-600 hover:underline">
              Sign in here
            </a>
          </p>
        </div>

        <footer className="mt-6 text-center text-xs text-brand-100">
          <p className="font-semibold text-white">SARIN SHANKAR DEORE</p>
          <p className="mt-1">
            <a href="mailto:deore.sareen@gmail.com" className="hover:underline">
              deore.sareen@gmail.com
            </a>
            <span className="mx-2 text-brand-200">·</span>
            <a href="tel:+919594390592" className="hover:underline">
              9594390592
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}
