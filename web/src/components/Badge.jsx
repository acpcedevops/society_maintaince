export const statusStyles = {
  PAID: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  OVERDUE: 'bg-red-100 text-red-700',
  PARTIAL: 'bg-purple-100 text-purple-700',
  OPEN: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-brand-100 text-brand-700',
  RESOLVED: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-slate-200 text-slate-600',
  DELETED: 'bg-red-100 text-red-700',
  LOW: 'bg-slate-100 text-slate-600',
  NORMAL: 'bg-brand-100 text-brand-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  DENIED: 'bg-red-100 text-red-700',
  ENTERED: 'bg-brand-100 text-brand-700',
  EXITED: 'bg-slate-200 text-slate-600',
  EXPIRED: 'bg-red-100 text-red-700',
  WAITING: 'bg-amber-100 text-amber-700',
  COLLECTED: 'bg-emerald-100 text-emerald-700',
  GATED: 'bg-brand-100 text-brand-700',
  NON_GATED: 'bg-slate-200 text-slate-600',
  HYBRID: 'bg-purple-100 text-purple-700',
};

export default function Badge({ value, className = '' }) {
  const style = statusStyles[value] || 'bg-slate-100 text-slate-600';
  return <span className={`badge ${style} ${className}`}>{String(value || '').replace(/_/g, ' ')}</span>;
}
