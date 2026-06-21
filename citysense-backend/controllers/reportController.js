const Report = require('../models/Report');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { awardPoints, checkAndAwardBadges } = require('../utils/gamification');

// POST /api/reports
exports.createReport = asyncHandler(async (req, res) => {
  const { lat, lng, area, issueType, description, photoUrl } = req.body;

  if (lat === undefined || lng === undefined || !area || !issueType) {
    return res.status(400).json({ success: false, message: 'lat, lng, area and issueType are required.' });
  }

  const report = await Report.create({
    user: req.user ? req.user._id : undefined,
    location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    area,
    issueType,
    description,
    photoUrl: photoUrl || (req.file ? `/uploads/${req.file.filename}` : ''),
  });

  let gamification = null;
  if (req.user) {
    await awardPoints(req.user._id, 10, 'report_submitted');
    const updatedUser = await User.findById(req.user._id);
    const newBadges = await checkAndAwardBadges(updatedUser);
    gamification = { points: updatedUser.points, streak: updatedUser.streak, newBadges };
  }

  res.status(201).json({ success: true, report, gamification });
});

// GET /api/reports?limit=10
exports.getReports = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const reports = await Report.find().sort({ createdAt: -1 }).limit(limit);
  res.status(200).json({ success: true, count: reports.length, reports });
});

// GET /api/reports/nearby?lat=..&lng=..&radiusKm=5
exports.getNearbyReports = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const radiusKm = parseFloat(req.query.radiusKm) || 5;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng are required.' });
  }

  const reports = await Report.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: radiusKm * 1000,
      },
    },
  }).limit(100);

  res.status(200).json({ success: true, count: reports.length, reports });
});

// PATCH /api/reports/:id/vote   body: { vote: 'up' | 'down' }
exports.voteReport = asyncHandler(async (req, res) => {
  const { vote } = req.body;
  if (!['up', 'down'].includes(vote)) {
    return res.status(400).json({ success: false, message: 'vote must be "up" or "down".' });
  }

  const report = await Report.findById(req.params.id);
  if (!report) {
    return res.status(404).json({ success: false, message: 'Report not found.' });
  }

  // Prevent duplicate voting if logged in
  if (req.user) {
    const existingVoteIdx = report.voters.findIndex((v) => v.user && v.user.toString() === req.user._id.toString());
    if (existingVoteIdx !== -1) {
      const existing = report.voters[existingVoteIdx];
      if (existing.vote === vote) {
        return res.status(400).json({ success: false, message: 'You already cast this vote.' });
      }
      // Switch vote
      if (existing.vote === 'up') report.upvotes = Math.max(0, report.upvotes - 1);
      else report.downvotes = Math.max(0, report.downvotes - 1);
      existing.vote = vote;
    } else {
      report.voters.push({ user: req.user._id, vote });
    }
  }

  if (vote === 'up') report.upvotes += 1;
  else report.downvotes += 1;

  await report.save();
  res.status(200).json({ success: true, report });
});

// PATCH /api/reports/:id/status  (admin only)  body: { status }
exports.updateStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['open', 'reviewing', 'resolved'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const report = await Report.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });
  res.status(200).json({ success: true, report });
});
