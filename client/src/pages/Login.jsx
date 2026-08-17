import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Alert, Field } from "../components/ui";
import { errMsg } from "../api/client";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", phone: "", email: "", password: "", unitNo: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = mode === "login" ? await login(form.phone, form.password) : await register(form);
      navigate(user.role === "ADMIN" ? "/" : "/bills");
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-brand-800 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <h1 className="text-2xl font-bold text-center text-slate-800">Neev Plaza Society</h1>
        <p className="text-sm text-slate-500 text-center mt-1">
          Maintenance · Expenses · Audit · Complaints
        </p>
        <div className="mt-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-medium">
          {["login", "register"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2 rounded-md transition-colors ${mode === m ? "bg-white shadow text-brand-700" : "text-slate-500"}`}
            >
              {m === "login" ? "Login" : "Register"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-5">
          {mode === "register" && (
            <>
              <Field label="Full Name">
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </Field>
              <Field label="Flat / Unit Number (e.g. A-101)">
                <input className="input" value={form.unitNo} onChange={(e) => setForm({ ...form, unitNo: e.target.value })} required />
              </Field>
            </>
          )}
          <Field label="Phone Number">
            <input className="input" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
          </Field>
          {mode === "register" && (
            <Field label="Email (optional)">
              <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
          )}
          <Field label="Password">
            <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>

          <Alert msg={error} />
          <button className="btn-primary w-full mt-2" disabled={busy}>
            {busy ? "Please wait..." : mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>

        <p className="text-xs text-slate-400 text-center mt-5">
          Demo — Admin: 9999999999 / admin123 · Member: 9000000000 / member123
        </p>
      </div>
    </div>
  );
}
