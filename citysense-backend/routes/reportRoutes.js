const express = require('express');
const router = express.Router();
const {
  createReport,
  getReports,
  getNearbyReports,
  voteReport,
  updateStatus,
} = require('../controllers/reportController');
const { optionalAuth, protect, restrictTo } = require('../middleware/auth');
const upload = require('../middleware/upload');
const requireDB = require('../middleware/requireDB');

router.use(requireDB); // every route in this file needs MongoDB

router.post('/', optionalAuth, upload.single('photo'), createReport);
router.get('/', getReports);
router.get('/nearby', getNearbyReports);
router.patch('/:id/vote', optionalAuth, voteReport);
router.patch('/:id/status', protect, restrictTo('admin'), updateStatus);

module.exports = router;
