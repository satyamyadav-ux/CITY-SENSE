const jwt = require('jsonwebtoken');

function signToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

function sendTokenResponse(user, statusCode, res) {
  const token = signToken(user._id);

  const cookieDays = parseInt(process.env.JWT_COOKIE_EXPIRES_DAYS || '7', 10);
  const cookieOptions = {
    expires: new Date(Date.now() + cookieDays * 24 * 60 * 60 * 1000),
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  res.cookie('token', token, cookieOptions);

  res.status(statusCode).json({
    success: true,
    token,
    user: user.toSafeObject ? user.toSafeObject() : user,
  });
}

module.exports = { signToken, sendTokenResponse };
