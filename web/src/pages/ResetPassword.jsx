import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { apiError } from '../lib/api.js';

export default function ResetPassword() {
  const { validateResetToken, resetPassword } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    if (!token) {
      setChecking(false);
      setValid(false);
      return () => {
        active = false;
      };
    }
    validateResetToken(token)
      .then((ok) => {
        if (active) setValid(ok);
      })
      .catch(() => {
        if (active) setValid(false);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [token, validateResetToken]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-800 via-brand-600 to-brand-700 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-2xl font-bold text-white">
            N
          </div>
          <h1 className="text-xl font-bold text-white">Society Maintenance Portal</h1>
        </div>

        <div className="card p-5 sm:p-6">
          <h2 className="mb-4 text-base font-semibold text-slate-800">Choose a new password</h2>

          {checking ? (
            <p className="text-sm text-slate-500">Checking your reset link…</p>
          ) : done ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                Your password has been reset successfully.
              </p>
              <Link to="/login" className="btn-primary w-full">
                Back to login
              </Link>
            </div>
          ) : !valid ? (
            <div className="space-y-4">
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                This reset link is invalid or has expired. Please request a new one.
              </p>
              <Link to="/login" className="btn-outline w-full">
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="label">New Password</label>
                <input
                  className="input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                />
              </div>
              <div>
                <label className="label">Confirm New Password</label>
                <input
                  className="input"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Re-enter the password"
                />
              </div>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <button type="submit" className="btn-primary w-full" disabled={busy}>
                {busy ? 'Saving...' : 'Set new password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
