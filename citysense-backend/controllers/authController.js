const User = require('../models/User');
const { sendTokenResponse } = require('../utils/jwt');
const { asyncHandler } = require('../middleware/errorHandler');

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, password, age, healthConditions } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'An account with this email already exists.' });
  }

  const user = await User.create({
    name,
    email,
    password,
    age,
    healthConditions: healthConditions && healthConditions.length ? healthConditions : ['none'],
  });

  sendTokenResponse(user, 201, res);
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Please provide email and password.' });
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, message: 'Incorrect email or password.' });
  }

  if (!user.isActive) {
    return res.status(401).json({ success: false, message: 'This account has been deactivated.' });
  }

  sendTokenResponse(user, 200, res);
});

// POST /api/auth/logout
exports.logout = (req, res) => {
  res.cookie('token', 'none', { expires: new Date(Date.now() + 5 * 1000), httpOnly: true });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
};

// GET /api/auth/me
exports.getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user.toSafeObject() });
});

// PATCH /api/auth/me  (update health profile / preferences)
exports.updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'age', 'healthConditions', 'aqiAlertThreshold', 'homeArea', 'homeLat', 'homeLng'];
  const updates = {};
  allowed.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.status(200).json({ success: true, user: user.toSafeObject() });
});
