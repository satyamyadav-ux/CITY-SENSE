const Reading = require('../models/Reading');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { awardPoints, checkAndAwardBadges } = require('../utils/gamification');

// POST /api/readings
// Saves a single sensor/API reading. Works for logged-in OR anonymous users.
exports.createReading = asyncHandler(async (req, res) => {
  const {
    lat, lng, area, dbLevel, aqi, pm25, pm10, co, no2, so2, o3,
    temperature, humidity, windSpeed, windDeg, source,
  } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ success: false, message: 'lat and lng are required.' });
  }

  const reading = await Reading.create({
    user: req.user ? req.user._id : undefined,
    location: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    area: area || 'Unknown',
    dbLevel, aqi, pm25, pm10, co, no2, so2, o3,
    temperature, humidity, windSpeed, windDeg,
    source: source || 'api_fetch',
  });

  let gamification = null;
  if (req.user) {
    await awardPoints(req.user._id, 5, 'reading_submitted');
    const updatedUser = await User.findById(req.user._id);
    const newBadges = await checkAndAwardBadges(updatedUser);
    gamification = {
      points: updatedUser.points,
      streak: updatedUser.streak,
      newBadges,
    };
  }

  res.status(201).json({ success: true, reading, gamification });
});

// GET /api/readings/recent?limit=10
exports.getRecentReadings = asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
  const readings = await Reading.find().sort({ createdAt: -1 }).limit(limit);
  res.status(200).json({ success: true, count: readings.length, readings });
});

// GET /api/readings/nearby?lat=..&lng=..&radiusKm=5
exports.getNearbyReadings = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const radiusKm = parseFloat(req.query.radiusKm) || 5;

  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng query params are required.' });
  }

  const readings = await Reading.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: radiusKm * 1000,
      },
    },
  }).limit(200);

  res.status(200).json({ success: true, count: readings.length, readings });
});

// GET /api/readings/trend?days=7
// Aggregated hourly AQI + noise trend for charts
exports.getTrend = asyncHandler(async (req, res) => {
  const days = Math.min(parseInt(req.query.days, 10) || 7, 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const trend = await Reading.aggregate([
    { $match: { createdAt: { $gte: since } } },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' },
        },
        avgAqi: { $avg: '$aqi' },
        avgDb: { $avg: '$dbLevel' },
        avgPm25: { $avg: '$pm25' },
        count: { $sum: 1 },
        timestamp: { $first: '$createdAt' },
      },
    },
    { $sort: { timestamp: 1 } },
  ]);

  res.status(200).json({ success: true, days, trend });
});

// GET /api/readings/worst-hours
// Average AQI grouped by hour-of-day across all history -> bar chart
exports.getWorstHours = asyncHandler(async (req, res) => {
  const result = await Reading.aggregate([
    {
      $group: {
        _id: { $hour: '$createdAt' },
        avgAqi: { $avg: '$aqi' },
        avgDb: { $avg: '$dbLevel' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill missing hours with null so the chart always has 24 entries
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const found = result.find((r) => r._id === h);
    return {
      hour: h,
      avgAqi: found ? Math.round(found.avgAqi) : null,
      avgDb: found ? Math.round(found.avgDb) : null,
      count: found ? found.count : 0,
    };
  });

  res.status(200).json({ success: true, hourly });
});

// GET /api/readings/leaderboard
// Cleanest areas — lowest average AQI, min 3 readings
exports.getLeaderboard = asyncHandler(async (req, res) => {
  const leaderboard = await Reading.aggregate([
    {
      $group: {
        _id: '$area',
        avgAqi: { $avg: '$aqi' },
        avgDb: { $avg: '$dbLevel' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gte: 1 } } },
    { $sort: { avgAqi: 1 } },
    { $limit: 10 },
    {
      $project: {
        area: '$_id',
        avgAqi: { $round: ['$avgAqi', 0] },
        avgDb: { $round: ['$avgDb', 0] },
        count: 1,
        _id: 0,
      },
    },
  ]);

  res.status(200).json({ success: true, leaderboard });
});

// GET /api/readings/safe-zones?lat=..&lng=..
// Suggest the lowest-AQI areas near the given point
exports.getSafeZones = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng are required.' });
  }

  const nearby = await Reading.find({
    location: {
      $near: {
        $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
        $maxDistance: 10000, // 10km
      },
    },
  }).limit(100);

  const byArea = {};
  nearby.forEach((r) => {
    if (!byArea[r.area]) byArea[r.area] = { aqiSum: 0, count: 0, lat: r.location.coordinates[1], lng: r.location.coordinates[0] };
    byArea[r.area].aqiSum += r.aqi || 0;
    byArea[r.area].count += 1;
  });

  const zones = Object.entries(byArea)
    .map(([area, d]) => ({ area, avgAqi: Math.round(d.aqiSum / d.count), lat: d.lat, lng: d.lng }))
    .sort((a, b) => a.avgAqi - b.avgAqi)
    .slice(0, 5);

  res.status(200).json({ success: true, zones });
});

// GET /api/readings/export.csv
exports.exportCSV = asyncHandler(async (req, res) => {
  const readings = await Reading.find().sort({ createdAt: -1 }).limit(5000);

  const headers = ['timestamp', 'lat', 'lng', 'area', 'dbLevel', 'aqi', 'pm25', 'pm10', 'co', 'no2', 'so2', 'temperature', 'humidity'];
  let csv = headers.join(',') + '\n';

  readings.forEach((r) => {
    const row = [
      r.createdAt.toISOString(),
      r.location.coordinates[1],
      r.location.coordinates[0],
      r.area,
      r.dbLevel ?? '',
      r.aqi ?? '',
      r.pm25 ?? '',
      r.pm10 ?? '',
      r.co ?? '',
      r.no2 ?? '',
      r.so2 ?? '',
      r.temperature ?? '',
      r.humidity ?? '',
    ];
    csv += row.join(',') + '\n';
  });

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="city-sense-readings.csv"');
  res.status(200).send(csv);
});
