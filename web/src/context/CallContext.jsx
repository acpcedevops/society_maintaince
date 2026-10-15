import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { connectSocket, disconnectSocket, getSocket } from '../lib/socket.js';
import CallOverlay from '../components/CallOverlay.jsx';

const CallContext = createContext(null);

function mediaErrorMessage(err) {
  if (!err) return 'Call failed. Please try again.';
  const msg = String(err.message || '');
  if (err.name === 'NotFoundError' || /requested device not found|no.*(device|mic|camera).*found/i.test(msg)) {
    return 'No microphone/camera found on this device. In-app calling needs a mic.';
  }
  if (err.name === 'NotAllowedError' || /permission|denied|not allowed/i.test(msg)) {
    return 'Microphone permission was blocked. Allow it in your browser settings and retry.';
  }
  if (err.name === 'NotReadableError' || /in use|busy/i.test(msg)) {
    return 'Your microphone is in use by another app. Close it and retry.';
  }
  if (err.name === 'TypeError' || /mediaDevices|undefined/i.test(msg)) {
    return 'Calling needs camera/mic access over https or localhost.';
  }
  return msg || 'Call failed. Please try again.';
}

function iceServers() {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* not JSON, treat as comma list */
    }
    return [{ urls: raw.split(',').map((s) => s.trim()).filter(Boolean) }];
  }
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const [phase, setPhase] = useState('idle'); // idle | outgoing | incoming | active
  const [call, setCall] = useState(null); // { callId, peer:{id,name,role}, context, direction }
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState('');

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const pendingIceRef = useRef([]);
  const callRef = useRef(null); // mirror of call for socket handlers

  useEffect(() => {
    callRef.current = call;
  }, [call]);

  const cleanup = useCallback((notify) => {
    const socket = socketRef.current || getSocket();
    const current = callRef.current;
    if (notify && socket && current?.peer?.id) {
      socket.emit('call:end', { toUserId: current.peer.id, callId: current.callId });
    }
    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    pendingIceRef.current = [];
    callRef.current = null;
    setCall(null);
    setMuted(false);
    setPhase('idle');
  }, []);

  const flushIce = useCallback(async (pc) => {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const c of queued) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pc.addIceCandidate(c);
      } catch {
        /* ignore stale candidates */
      }
    }
  }, []);

  const ensureMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Camera/mic unavailable', 'TypeError');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  }, []);

  // Any call error auto-dismisses so it never gets stuck on screen.
  useEffect(() => {
    if (!error) return undefined;
    const t = setTimeout(() => setError(''), 6000);
    return () => clearTimeout(t);
  }, [error]);

  const createPeer = useCallback(
    async (peerId, callId) => {
      const stream = await ensureMedia();
      const pc = new RTCPeerConnection({ iceServers: iceServers() });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit('call:ice', { toUserId: peerId, callId, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        setCall((c) => (c ? { ...c, remoteStream: e.streams[0] } : c));
      };
      pc.onconnectionstatechange = () => {
        if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
          // Give a moment before tearing down; transient disconnects can recover.
          if (pc.connectionState === 'failed') cleanup(true);
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [ensureMedia, cleanup]
  );

  const startCall = useCallback(
    async (toUserId, context = {}) => {
      setError('');
      if (!toUserId) return;
      const socket = socketRef.current || getSocket();
      if (!socket) {
        setError('Not connected. Please refresh and try again.');
        return;
      }
      const callId = `c-${user?.id}-${Date.now()}`;
      try {
        const pc = await createPeer(toUserId, callId);
        setCall({
          callId,
          peer: { id: toUserId, name: context.name || 'Resident' },
          context,
          direction: 'outgoing',
          remoteStream: null,
        });
        callRef.current = { callId, peer: { id: toUserId } };
        await pc.setLocalDescription(await pc.createOffer());
        setPhase('outgoing');
        socket.emit('call:start', { toUserId, callId, context });
      } catch (err) {
        setError(mediaErrorMessage(err));
        cleanup(false);
      }
    },
    [user?.id, createPeer, cleanup]
  );

  const acceptCall = useCallback(async () => {
    const socket = socketRef.current || getSocket();
    const current = callRef.current;
    if (!socket || !current) return;
    setError('');
    try {
      const pc = await createPeer(current.peer.id, current.callId);
      // Offer may have arrived already; apply it.
      if (current.pendingOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(current.pendingOffer));
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { toUserId: current.peer.id, callId: current.callId, sdp: answer });
      }
      socket.emit('call:accept', { toUserId: current.peer.id, callId: current.callId });
      setPhase('active');
    } catch (err) {
      setError(mediaErrorMessage(err));
      socket.emit('call:reject', { toUserId: current.peer.id, callId: current.callId, reason: 'error' });
      cleanup(false);
    }
  }, [createPeer, cleanup, flushIce]);

  const rejectCall = useCallback(() => {
    const socket = socketRef.current || getSocket();
    const current = callRef.current;
    if (socket && current) {
      socket.emit('call:reject', { toUserId: current.peer.id, callId: current.callId });
    }
    cleanup(false);
  }, [cleanup]);

  const endCall = useCallback(() => cleanup(true), [cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !muted;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    if (!user?.id) {
      disconnectSocket();
      socketRef.current = null;
      return undefined;
    }
    const socket = connectSocket();
    socketRef.current = socket;
    if (!socket) return undefined;

    const onIncoming = ({ callId, fromUser, context }) => {
      if (callRef.current) {
        // Already busy; politely reject.
        socket.emit('call:reject', { toUserId: fromUser.id, callId, reason: 'busy' });
        return;
      }
      const next = {
        callId,
        peer: { id: fromUser.id, name: fromUser.name, role: fromUser.role },
        context: context || {},
        direction: 'incoming',
        remoteStream: null,
      };
      callRef.current = next;
      setCall(next);
      setPhase('incoming');
    };

    const onAccepted = async ({ callId, fromUserId }) => {
      const pc = pcRef.current;
      const current = callRef.current;
      if (!pc || !current) return;
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('call:offer', { toUserId: fromUserId, callId, sdp: offer });
        setPhase('active');
      } catch (err) {
        setError(err?.message || 'Call negotiation failed');
        cleanup(true);
      }
    };

    const onRejected = ({ callId, reason }) => {
      setError(reason === 'busy' ? 'The resident is on another call' : 'Call declined');
      cleanup(false);
      setTimeout(() => setError(''), 4000);
    };

    const onOffer = async ({ callId, sdp, fromUserId }) => {
      const current = callRef.current;
      if (!current || current.callId !== callId) return;
      const pc = pcRef.current;
      if (!pc) {
        // Not accepted yet: stash the offer until the user accepts.
        callRef.current = { ...current, pendingOffer: sdp };
        setCall((c) => (c ? { ...c, pendingOffer: sdp } : c));
        return;
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:answer', { toUserId: fromUserId, callId, sdp: answer });
      } catch (err) {
        setError(err?.message || 'Call negotiation failed');
        cleanup(true);
      }
    };

    const onAnswer = async ({ callId, sdp }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIce(pc);
      } catch (err) {
        setError(err?.message || 'Call negotiation failed');
        cleanup(true);
      }
    };

    const onIce = async ({ candidate }) => {
      const pc = pcRef.current;
      if (!pc || !candidate) return;
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        pendingIceRef.current.push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* ignore */
      }
    };

    const onEnded = () => {
      cleanup(false);
    };

    const onUnavailable = ({ reason }) => {
      setError(reason === 'offline' ? 'Resident is offline. A missed-call notification was sent.' : 'Resident unavailable');
      cleanup(false);
      setTimeout(() => setError(''), 5000);
    };

    socket.on('call:incoming', onIncoming);
    socket.on('call:accepted', onAccepted);
    socket.on('call:rejected', onRejected);
    socket.on('call:offer', onOffer);
    socket.on('call:answer', onAnswer);
    socket.on('call:ice', onIce);
    socket.on('call:ended', onEnded);
    socket.on('call:unavailable', onUnavailable);

    return () => {
      socket.off('call:incoming', onIncoming);
      socket.off('call:accepted', onAccepted);
      socket.off('call:rejected', onRejected);
      socket.off('call:offer', onOffer);
      socket.off('call:answer', onAnswer);
      socket.off('call:ice', onIce);
      socket.off('call:ended', onEnded);
      socket.off('call:unavailable', onUnavailable);
    };
  }, [user?.id, cleanup, flushIce]);

  const value = {
    phase,
    call,
    muted,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
  };

  return (
    <CallContext.Provider value={value}>
      {children}
      <CallOverlay />
    </CallContext.Provider>
  );
}

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error('useCall must be used inside CallProvider');
  return ctx;
}
