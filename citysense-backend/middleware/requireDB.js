const mongoose = require('mongoose');

// By default, mongoose queues ("buffers") queries when the DB is
// disconnected and only rejects them after `bufferTimeoutMS` (10s).
// That makes any DB-dependent route hang for 10 seconds with no
// response whenever Mongo is unreachable, instead of failing fast.
//
// This middleware checks the real connection state up front and
// returns an immediate, clear error so the frontend doesn't have to
// wait — and so monitoring/health checks reflect reality instantly.
function requireDB(req, res, next) {
  const READY = 1; // mongoose.connection.readyState === 1 means "connected"
  if (mongoose.connection.readyState !== READY) {
    return res.status(503).json({
      success: false,
      message: 'Database is currently unavailable. Please try again shortly.',
    });
  }
  next();
}

module.exports = requireDB;
