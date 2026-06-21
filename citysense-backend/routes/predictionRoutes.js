const express = require('express');
const router = express.Router();
const { getForecast, getAccuracy } = require('../controllers/predictionController');
const requireDB = require('../middleware/requireDB');

// forecast degrades gracefully on its own when DB is down — no requireDB here
router.get('/forecast', getForecast);
// accuracy is pure historical analytics with no meaningful fallback
router.get('/accuracy', requireDB, getAccuracy);

module.exports = router;
