const { Server } = require('socket.io');
const prisma = require('./prisma');
const { verify } = require('./jwt');

// userId -> number of active sockets. Used for presence and missed-call fallback.
const online = new Map();

function addOnline(userId) {
  online.set(userId, (online.get(userId) || 0) + 1);
}

function removeOnline(userId) {
  const next = (online.get(userId) || 1) - 1;
  if (next <= 0) online.delete(userId);
  else online.set(userId, next);
}

function isOnline(userId) {
  return online.has(Number(userId));
}

/**
 * Attaches the realtime call-signaling layer to an existing HTTP server.
 * WebRTC is peer-to-peer; this server only relays SDP offers/answers and ICE
 * candidates between the two parties. All sockets are authenticated with the
 * same JWT used by the REST API.
 */
function initSockets(httpServer, { corsOrigin } = {}) {
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin || true, credentials: true },
    path: '/socket.io',
  });

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers.authorization || '').replace(/^Bearer /, '');
      if (!token) return next(new Error('Authentication required'));
      const payload = verify(token);
      socket.data.user = {
        id: payload.id,
        role: payload.role,
        name: payload.name,
        unitId: payload.unitId ?? null,
        societyId: payload.societyId ?? null,
      };
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    socket.join(`user:${user.id}`);
    if (user.societyId) socket.join(`society:${user.societyId}`);
    addOnline(user.id);

    const relay = (event) => (payload = {}) => {
      const target = Number(payload.toUserId ?? payload.to ?? payload.userId);
      if (!target) return;
      io.to(`user:${target}`).emit(event, { ...payload, fromUserId: user.id });
    };

    socket.on('call:start', async (payload = {}) => {
      const target = Number(payload.toUserId);
      if (!target) return;
      const callId = payload.callId || `${user.id}-${Date.now()}`;
      const outbound = {
        callId,
        toUserId: target,
        fromUser: { id: user.id, name: user.name, role: user.role, unitId: user.unitId },
        context: payload.context || {},
      };

      if (!isOnline(target)) {
        socket.emit('call:unavailable', { callId, reason: 'offline' });
        try {
          await prisma.notification.create({
            data: {
              societyId: user.societyId,
              userId: target,
              type: 'CALL',
              title: 'Missed call from gate',
              body: `${user.name} tried to call you about a delivery`,
              link: '/gate',
              meta: { callId, fromUserId: user.id },
            },
          });
        } catch (err) {
          // Notification is best-effort; never break signaling.
        }
        return;
      }

      io.to(`user:${target}`).emit('call:incoming', outbound);
      socket.emit('call:ringing', { callId, toUserId: target });
    });

    socket.on('call:accept', (payload = {}) => {
      relay('call:accepted')(payload);
    });
    socket.on('call:reject', (payload = {}) => {
      relay('call:rejected')(payload);
    });
    socket.on('call:offer', (payload = {}) => {
      relay('call:offer')(payload);
    });
    socket.on('call:answer', (payload = {}) => {
      relay('call:answer')(payload);
    });
    socket.on('call:ice', (payload = {}) => {
      relay('call:ice')(payload);
    });
    socket.on('call:end', (payload = {}) => {
      relay('call:ended')(payload);
    });

    socket.on('disconnect', () => {
      removeOnline(user.id);
    });
  });

  return io;
}

module.exports = { initSockets, isOnline, online };
