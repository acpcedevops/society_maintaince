import { useEffect, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import { Icon, icons } from './Icon.jsx';

function cameraErrorMessage(err) {
  const msg = String(err?.message || '');
  if (err?.name === 'NotFoundError' || /requested device not found|no.*camera.*found/i.test(msg)) {
    return 'No camera found on this device. Use manual code entry below.';
  }
  if (err?.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(msg)) {
    return 'Camera permission was blocked. Allow it in your browser settings, or use manual code entry below.';
  }
  if (err?.name === 'NotReadableError' || /in use|busy/i.test(msg)) {
    return 'Camera is in use by another app. Close it and retry, or use manual code entry below.';
  }
  if (/mediaDevices|getUserMedia|secure context/i.test(msg)) {
    return 'Camera needs https or localhost. Use manual code entry below.';
  }
  return msg || 'Could not start the camera. Enter the code manually below.';
}

export default function QrScanner({ open, onClose, onToken }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const handledRef = useRef(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [scanning, setScanning] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const stop = () => {
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    handledRef.current = false;
    setError('');
    setManual('');
    setScanning(true);

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new DOMException('Camera unavailable', 'NotFoundError');
        }
        const { BrowserQRCodeReader } = await import('@zxing/browser');
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (result && !handledRef.current) {
            handledRef.current = true;
            stop();
            onToken(result.getText());
          }
        });
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch (err) {
        if (!cancelled) setError(cameraErrorMessage(err));
      } finally {
        if (!cancelled) setScanning(false);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, attempt]);

  const submitManual = (e) => {
    e.preventDefault();
    const value = manual.trim();
    if (value) onToken(value);
  };

  return (
    <Modal open={open} onClose={onClose} title="Scan Delivery QR">
      <div className="space-y-4">
        <div className="relative mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-slate-900">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          {!error && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-44 w-44 rounded-xl border-2 border-white/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]" />
            </div>
          )}
          {scanning && !error && (
            <p className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">Starting camera…</p>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center text-slate-300">
              <Icon path={icons.scan} className="h-8 w-8" />
              <p className="text-xs">Camera unavailable</p>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              className="whitespace-nowrap text-xs font-semibold text-amber-800 underline"
              onClick={() => setAttempt((a) => a + 1)}
            >
              Retry
            </button>
          </div>
        )}

        <form onSubmit={submitManual} className="flex items-end gap-2">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              {error ? 'Enter the code shared by the resident' : 'Or enter pass code manually'}
            </span>
            <input
              className="input"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="e.g. SMPASS:1a2b3c…"
              autoFocus
            />
          </label>
          <button type="submit" className="btn-primary" disabled={!manual.trim()}>
            <Icon path={icons.check} className="h-4 w-4" /> Verify
          </button>
        </form>
      </div>
    </Modal>
  );
}
