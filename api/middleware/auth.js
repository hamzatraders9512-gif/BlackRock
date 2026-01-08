const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

/**
 * Authentication middleware that accepts either:
 * - Existing session-based Passport auth (req.isAuthenticated())
 * - Bearer JWT in Authorization header (signed with JWT_SECRET)
 *
 * The middleware attaches `req.user` (mongoose User doc) on success.
 */
async function ensureAuthenticated(req, res, next) {
  try {
    // Session-based login via Passport
    if (req.isAuthenticated && req.isAuthenticated()) {
      return next();
    }

    // Bearer token fallback
    const auth = req.get('authorization') || '';
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = auth.slice(7).trim();
    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.warn('JWT_SECRET not configured; rejecting token auth');
      return res.status(500).json({ message: 'Server misconfiguration' });
    }

    let payload;
    try {
      payload = jwt.verify(token, secret);
    } catch (err) {
      console.warn('JWT verification failed:', err && err.message);
      return res.status(401).json({ message: 'Invalid token' });
    }

    // Resolve user: prefer email, fallback to sub or userId
    const identifier = payload.email || payload.sub || payload.userId || payload.id;
    if (!identifier) return res.status(401).json({ message: 'Invalid token payload' });

    // Mongoose model 'User' should be registered by server startup
    let User;
    try {
      User = mongoose.model('User');
    } catch (e) {
      return res.status(500).json({ message: 'User model not available' });
    }

    const user = await User.findOne({ $or: [{ email: identifier }, { _id: identifier }, { googleId: identifier }] });
    if (!user) return res.status(401).json({ message: 'Unauthorized' });

    req.user = user;
    return next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ message: 'Authentication error' });
  }
}

module.exports = { ensureAuthenticated };
