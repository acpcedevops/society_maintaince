import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { apiError } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { Icon, icons } from './Icon.jsx';

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/gate/notifications');
      setItems(data.notifications);
      setUnread(data.unread);
    } catch (err) {
      setError(apiError(err));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) {
      try {
        await api.post(`/gate/notifications/${n.id}/read`);
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        /* ignore */
      }
    }
    navigate(n.link || '/gate');
  };

  const readAll = async () => {
    try {
      await api.post('/gate/notifications/read-all');
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        className="btn-ghost relative p-2"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
      >
        <Icon path={icons.bell} className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700">Notifications</p>
            {unread > 0 && (
              <button className="text-xs font-medium text-brand-600 hover:underline" onClick={readAll}>
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
            {items.length === 0 && !error && (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet.</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openItem(n)}
                className={`flex w-full flex-col items-start gap-1 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  n.read ? '' : 'bg-brand-50/50'
                }`}
              >
                <span className="flex w-full items-center gap-2">
                  {!n.read && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />}
                  <span className="text-sm font-medium text-slate-700">{n.title}</span>
                </span>
                {n.body && <span className="text-xs text-slate-500">{n.body}</span>}
                <span className="text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
