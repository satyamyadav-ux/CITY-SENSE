const express = require('express');
const router = express.Router();
const { getAirQuality, getCurrentWeather, compareCities } = require('../controllers/weatherController');

router.get('/air', getAirQuality);
router.get('/current', getCurrentWeather);
router.get('/compare', compareCities);

module.exports = router;
