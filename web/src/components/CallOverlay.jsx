import { useEffect, useRef, useState } from 'react';
import { useCall } from '../context/CallContext.jsx';
import { Icon, icons } from './Icon.jsx';

function formatDuration(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export default function CallOverlay() {
  const { phase, call, muted, error, acceptCall, rejectCall, endCall, toggleMute } = useCall();
  const audioRef = useRef(null);
  const [seconds, setSeconds] = useState(0);
  const [dismissed, setDismissed] = useState('');

  useEffect(() => {
    setDismissed('');
  }, [error]);

  useEffect(() => {
    if (audioRef.current && call?.remoteStream) {
      audioRef.current.srcObject = call.remoteStream;
      audioRef.current.play().catch(() => {});
    }
  }, [call?.remoteStream]);

  useEffect(() => {
    if (phase !== 'active') {
      setSeconds(0);
      return undefined;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const showError = Boolean(error) && error !== dismissed;
  if (phase === 'idle' && !showError) return null;

  const peerName = call?.peer?.name || 'Resident';
  const ctx = call?.context || {};
  const detail = ctx.unitNo ? `Unit ${ctx.unitNo}` : ctx.name || '';
  const incoming = phase === 'incoming';

  return (
    <div className="fixed bottom-5 right-5 z-[60] w-80">
      {showError && (
        <div className="mb-2 flex items-start gap-2 rounded-xl bg-slate-800 px-4 py-3 text-sm text-white shadow-xl">
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setDismissed(error)}
            className="rounded p-0.5 text-white/70 hover:bg-white/10 hover:text-white"
            aria-label="Dismiss"
          >
            <Icon path={icons.close} className="h-4 w-4" />
          </button>
        </div>
      )}

      {phase !== 'idle' && (
        <div className="overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl">
          <div className="flex items-center gap-3 px-4 py-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-lg font-bold">
              {peerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{peerName}</p>
              <p className="truncate text-xs text-slate-300">
                {phase === 'incoming'
                  ? `${detail ? `${detail} · ` : ''}Calling you…`
                  : phase === 'outgoing'
                  ? 'Ringing…'
                  : `${formatDuration(seconds)}${muted ? ' · Muted' : ''}`}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
            {incoming && (
              <>
                <button
                  onClick={rejectCall}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold hover:bg-red-600"
                >
                  <Icon path={icons.phoneOff} className="h-4 w-4" /> Decline
                </button>
                <button
                  onClick={acceptCall}
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold hover:bg-emerald-600"
                >
                  <Icon path={icons.phone} className="h-4 w-4" /> Accept
                </button>
              </>
            )}

            {phase === 'outgoing' && (
              <button
                onClick={endCall}
                className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold hover:bg-red-600"
              >
                <Icon path={icons.phoneOff} className="h-4 w-4" /> Cancel
              </button>
            )}

            {phase === 'active' && (
              <>
                <button
                  onClick={toggleMute}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold ${
                    muted ? 'bg-amber-500 hover:bg-amber-600' : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Icon path={icons.mic} className="h-4 w-4" /> {muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={endCall}
                  className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold hover:bg-red-600"
                >
                  <Icon path={icons.phoneOff} className="h-4 w-4" /> End
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <audio ref={audioRef} autoPlay className="hidden" />
    </div>
  );
}
