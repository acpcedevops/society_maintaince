const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function sign(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      name: user.name,
      unitId: user.unitId ?? null,
      societyId: user.societyId ?? null,
    },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

// Platform-level (super) admin token. `typ` distinguishes it from society users
// so the two token families can never be used interchangeably.
function signSuper(admin) {
  return jwt.sign(
    { id: admin.id, role: 'SUPER_ADMIN', typ: 'super', name: admin.name, email: admin.email },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, signSuper, verify };
