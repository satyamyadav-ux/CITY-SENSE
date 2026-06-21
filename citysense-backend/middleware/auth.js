const jwt = require('jsonwebtoken');
const User = require('../models/User');

function extractToken(req) {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    return req.headers.authorization.split(' ')[1];
  }
  if (req.cookies && req.cookies.token) {
    return req.cookies.token;
  }
  return null;
}

// Requires a valid logged-in user. Blocks request if not authenticated.
async function protect(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User no longer exists or is inactive.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// Attaches req.user if a valid token is present, but does NOT block
// the request if absent — used for routes that allow anonymous access
// (e.g. submitting a reading/report without an account) but still want
// to credit a logged-in user when available.
async function optionalAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (user && user.isActive) req.user = user;
    next();
  } catch (err) {
    // Invalid token on an optional route — just proceed as anonymous
    next();
  }
}

function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission for this action.' });
    }
    next();
  };
}

module.exports = { protect, optionalAuth, restrictTo };
