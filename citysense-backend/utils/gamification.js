const User = require('../models/User');
const Reading = require('../models/Reading');
const Report = require('../models/Report');

const BADGE_DEFS = [
  { key: 'explorer', name: 'Explorer', check: async (user) => {
      const count = await Reading.countDocuments({ user: user._id });
      return count >= 1;
  }},
  { key: 'eco_warrior', name: 'Eco Warrior', check: async (user) => {
      const count = await Reading.countDocuments({ user: user._id });
      return count >= 10;
  }},
  { key: 'reporter', name: 'Reporter', check: async (user) => {
      const count = await Report.countDocuments({ user: user._id });
      return count >= 1;
  }},
  { key: 'on_fire', name: 'On Fire', check: async (user) => user.streak >= 3 },
  { key: 'clean_air', name: 'Clean Air', check: async (user) => {
      const latest = await Reading.findOne({ user: user._id }).sort({ createdAt: -1 });
      return !!latest && latest.aqi <= 50;
  }},
  { key: 'night_owl', name: 'Night Owl', check: async () => new Date().getHours() >= 22 || new Date().getHours() < 5 },
];

// Adds points and updates the daily streak counter.
async function awardPoints(userId, points, reason = '') {
  const user = await User.findById(userId);
  if (!user) return null;

  user.points += points;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = user.lastCheckIn ? new Date(user.lastCheckIn) : null;
  if (last) last.setHours(0, 0, 0, 0);

  if (!last) {
    user.streak = 1;
  } else {
    const diffDays = Math.round((today - last) / 86400000);
    if (diffDays === 1) user.streak += 1;
    else if (diffDays > 1) user.streak = 1;
    // diffDays === 0 -> same day, streak unchanged
  }
  user.lastCheckIn = today;

  await user.save();
  return user;
}

// Checks all badge definitions and awards any newly-earned ones.
// Returns an array of newly awarded badges (empty if none).
async function checkAndAwardBadges(user) {
  const earnedKeys = new Set(user.badges.map((b) => b.key));
  const newlyAwarded = [];

  for (const def of BADGE_DEFS) {
    if (earnedKeys.has(def.key)) continue;
    const qualifies = await def.check(user);
    if (qualifies) {
      user.badges.push({ key: def.key, name: def.name, earnedAt: new Date() });
      newlyAwarded.push({ key: def.key, name: def.name });
    }
  }

  if (newlyAwarded.length) await user.save();
  return newlyAwarded;
}

module.exports = { awardPoints, checkAndAwardBadges, BADGE_DEFS };
