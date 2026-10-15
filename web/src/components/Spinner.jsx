import { Icon } from './Icon.jsx';

export default function Spinner({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <Icon
        path="M21 12a9 9 0 11-6.219-8.56"
        className="h-5 w-5 animate-spin text-brand-600"
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}
