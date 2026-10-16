const prisma = require('../lib/prisma');
const { verify } = require('../lib/jwt');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = verify(token);
    if (payload.typ === 'super') {
      return res.status(401).json({ error: 'Invalid credentials for this area' });
    }
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { unit: true, society: true },
    });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function gateAccess(req, res, next) {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'GUARD')) {
    return res.status(403).json({ error: 'Gate access required' });
  }
  next();
}

// Authenticates a platform (super) admin token. Kept separate from `protect`
// because super admins are not rows in the User table.
async function protectSuper(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const payload = verify(token);
    if (payload.typ !== 'super') {
      return res.status(403).json({ error: 'Platform admin access required' });
    }
    const admin = await prisma.superAdmin.findUnique({ where: { id: payload.id } });
    if (!admin) {
      return res.status(401).json({ error: 'Account not found' });
    }
    req.superAdmin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Blocks GUARD-role tokens from member/admin-only API areas. Runs before a
// router's own `protect`, so it resolves the token itself; requests without a
// token (public routes) are passed through to the route's own auth.
async function denyGuard(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return next();
    const payload = verify(token);
    if (payload.typ === 'super') return next();
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { role: true } });
    if (user && user.role === 'GUARD') {
      return res.status(403).json({ error: 'Gate staff access only' });
    }
    next();
  } catch (err) {
    next();
  }
}

module.exports = { protect, adminOnly, gateAccess, denyGuard, protectSuper };
