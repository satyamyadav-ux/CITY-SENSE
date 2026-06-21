const mongoose = require('mongoose');
const Reading = require('../models/Reading');
const Prediction = require('../models/Prediction');
const { asyncHandler } = require('../middleware/errorHandler');

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

// GET /api/predictions/forecast?lat=..&lng=..
// Simple linear-trend + time-of-day-traffic-factor model using the
// last 20 readings near the given point (or globally if none nearby).
//
// Degrades gracefully: if MongoDB isn't reachable, skips straight to
// the default-assumption forecast instead of hanging on mongoose's
// query buffering (which only times out after 10s by default).
exports.getForecast = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  const dbAvailable = isDbConnected();

  let recent = [];
  if (dbAvailable) {
    if (lat && lng) {
      recent = await Reading.find({
        location: {
          $near: {
            $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
            $maxDistance: 15000,
          },
        },
      }).limit(20);
    }
    if (!recent || recent.length < 3) {
      recent = await Reading.find().sort({ createdAt: -1 }).limit(20);
    }
  }

  const vals = recent.map((r) => r.aqi).filter((v) => typeof v === 'number');
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 100;
  const trend = vals.length > 1 ? (vals[0] - vals[vals.length - 1]) / vals.length : 0;

  const forecast = [];
  for (let i = 1; i <= 6; i++) {
    const future = new Date();
    future.setHours(future.getHours() + i);
    const hr = future.getHours();
    const trafficFactor = (hr >= 7 && hr <= 10) || (hr >= 17 && hr <= 20) ? 1.3 : 0.85;
    const predicted = Math.max(20, Math.round((avg + trend * i * 0.5) * trafficFactor + (Math.random() - 0.5) * 15));

    forecast.push({ time: future.toISOString(), hour: hr, predictedAqi: predicted });

    // Persist each forecast point so we can later compare against actuals
    // for accuracy tracking (used by analytics / model improvement).
    // Skipped entirely if DB is down — fire-and-forget either way so
    // it never blocks or delays the response.
    if (dbAvailable) {
      Prediction.create({
        area: recent[0]?.area || 'Unknown',
        location: lat && lng ? { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] } : undefined,
        forTimestamp: future,
        predictedAqi: predicted,
      }).catch(() => {});
    }
  }

  const best = forecast.reduce((a, b) => (a.predictedAqi < b.predictedAqi ? a : b));
  const worst = forecast.reduce((a, b) => (a.predictedAqi > b.predictedAqi ? a : b));

  res.status(200).json({
    success: true,
    forecast,
    bestHour: best,
    worstHour: worst,
    basedOnReadings: vals.length,
    ...(!dbAvailable && { degraded: true, message: 'Database unavailable — using default assumptions for this forecast.' }),
  });
});

// GET /api/predictions/accuracy
// Backfills accuracy for past predictions whose target hour has passed,
// by matching against the closest actual reading, then reports overall accuracy.
exports.getAccuracy = asyncHandler(async (req, res) => {
  const pending = await Prediction.find({
    forTimestamp: { $lte: new Date() },
    actualAqi: { $exists: false },
  }).limit(200);

  for (const p of pending) {
    const closest = await Reading.findOne({
      createdAt: { $gte: new Date(p.forTimestamp.getTime() - 30 * 60000), $lte: new Date(p.forTimestamp.getTime() + 30 * 60000) },
    }).sort({ createdAt: -1 });

    if (closest && typeof closest.aqi === 'number') {
      p.actualAqi = closest.aqi;
      p.accuracy = Math.max(0, 100 - (Math.abs(p.predictedAqi - closest.aqi) / closest.aqi) * 100);
      await p.save();
    }
  }

  const scored = await Prediction.find({ accuracy: { $exists: true } }).sort({ createdAt: -1 }).limit(100);
  const avgAccuracy = scored.length
    ? scored.reduce((sum, p) => sum + p.accuracy, 0) / scored.length
    : null;

  res.status(200).json({
    success: true,
    avgAccuracy: avgAccuracy !== null ? Math.round(avgAccuracy) : null,
    sampleSize: scored.length,
  });
});
