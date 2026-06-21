const express = require('express');
const router = express.Router();
const {
  createReading,
  getRecentReadings,
  getNearbyReadings,
  getTrend,
  getWorstHours,
  getLeaderboard,
  getSafeZones,
  exportCSV,
} = require('../controllers/readingController');
const { optionalAuth } = require('../middleware/auth');
const requireDB = require('../middleware/requireDB');

router.use(requireDB); // every route in this file needs MongoDB

router.post('/', optionalAuth, createReading);
router.get('/recent', getRecentReadings);
router.get('/nearby', getNearbyReadings);
router.get('/trend', getTrend);
router.get('/worst-hours', getWorstHours);
router.get('/leaderboard', getLeaderboard);
router.get('/safe-zones', getSafeZones);
router.get('/export.csv', exportCSV);

module.exports = router;
