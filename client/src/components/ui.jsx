export const inr = (n) =>
  "Rs. " + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
export const monthName = (m) => MONTHS[(m || 1) - 1];

export function Stat({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-slate-800",
    green: "text-emerald-600",
    red: "text-red-600",
    brand: "text-brand-600",
  };
  return (
    <div className="card">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tones[tone]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600",
    green: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    brand: "bg-brand-100 text-brand-700",
    purple: "bg-purple-100 text-purple-700",
  };
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function statusBadge(status) {
  const map = {
    PAID: ["green", "PAID"],
    PENDING: ["amber", "PENDING"],
    OVERDUE: ["red", "OVERDUE"],
    PARTIAL: ["purple", "PARTIAL"],
    OPEN: ["amber", "OPEN"],
    IN_PROGRESS: ["brand", "IN PROGRESS"],
    RESOLVED: ["green", "RESOLVED"],
    CLOSED: ["slate", "CLOSED"],
  };
  const [tone, label] = map[status] || ["slate", status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Spinner({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-sm">{text || "Loading..."}</p>
    </div>
  );
}

export function Alert({ msg, kind = "error" }) {
  if (!msg) return null;
  const styles =
    kind === "error"
      ? "bg-red-50 text-red-700 border-red-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles} mb-4`}>
      {msg}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="label">{label}</label>
      {children}
    </div>
  );
}
