const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s || typeof s !== 'string' || s.length < 16) {
    throw new Error('Set JWT_SECRET in server/.env (at least 16 characters).');
  }
  return s;
}

/**
 * @param {string} userId
 */
function signToken(userId) {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: '7d' });
}

/**
 * @param {string} token
 * @returns {string | null}
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, getJwtSecret());
    const sub = payload?.sub;
    if (typeof sub !== 'string') return null;
    return sub;
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token =
    typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }
  const userId = verifyAccessToken(token);
  if (!userId) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }
  req.userId = userId;
  next();
}

module.exports = { getJwtSecret, signToken, verifyAccessToken, authMiddleware };
