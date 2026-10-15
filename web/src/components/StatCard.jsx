import { money } from '../lib/format.js';

export default function StatCard({ label, value, hint, accent = 'brand', moneyValue = true }) {
  const accents = {
    brand: 'text-brand-700',
    emerald: 'text-emerald-600',
    red: 'text-red-600',
    amber: 'text-amber-600',
    slate: 'text-slate-700',
  };
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${accents[accent] || accents.brand}`}>
        {moneyValue ? money(value) : value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
