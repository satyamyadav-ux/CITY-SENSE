const mongoose = require('mongoose');

const readingSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // optional - anonymous allowed

    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        // [lng, lat]  <-- GeoJSON order, NOT lat/lng
        type: [Number],
        required: true,
        validate: {
          validator: (v) => v.length === 2,
          message: 'Coordinates must be [lng, lat]',
        },
      },
    },
    area: { type: String, default: 'Unknown', trim: true },

    dbLevel: { type: Number, min: 0, max: 200 },
    aqi: { type: Number, min: 0, max: 500 },
    pm25: Number,
    pm10: Number,
    co: Number,
    no2: Number,
    so2: Number,
    o3: Number,
    temperature: Number,
    humidity: Number,
    windSpeed: Number,
    windDeg: Number,

    source: {
      type: String,
      enum: ['user_submitted', 'api_fetch', 'simulated'],
      default: 'api_fetch',
    },
  },
  { timestamps: true }
);

// ---- Geospatial index for "nearby readings" / safe-zone queries ----
readingSchema.index({ location: '2dsphere' });
// ---- Time-based queries (trends, last 7 days) ----
readingSchema.index({ createdAt: -1 });
// ---- Area-based leaderboard aggregation ----
readingSchema.index({ area: 1, createdAt: -1 });

module.exports = mongoose.model('Reading', readingSchema);
