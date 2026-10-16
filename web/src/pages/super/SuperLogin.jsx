import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAuth } from '../../context/SuperAuthContext.jsx';
import { superError } from '../../lib/superApi.js';

export default function SuperLogin() {
  const { login, admin } = useSuperAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (admin) navigate('/super', { replace: true });
  }, [admin, navigate]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
      navigate('/super', { replace: true });
    } catch (err) {
      setError(superError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-brand-800 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold text-white">
            P
          </div>
          <h1 className="text-xl font-bold text-white sm:text-2xl">Platform Administration</h1>
          <p className="text-sm text-slate-300">Approve societies &amp; manage payment settings</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-5 sm:p-6">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Password"
              autoComplete="current-password"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-slate-400">
            Platform administrators only. Society users should use the{' '}
            <a href="/login" className="font-semibold text-brand-600 hover:underline">
              main login
            </a>
            .
          </p>
        </form>
      </div>
    </div>
  );
}
