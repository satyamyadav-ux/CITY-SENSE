require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const path = require('path');
const cron = require('node-cron');

const { connectDB, getConnectionState } = require('./config/db');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const readingRoutes = require('./routes/readingRoutes');
const reportRoutes = require('./routes/reportRoutes');
const weatherRoutes = require('./routes/weatherRoutes');
const predictionRoutes = require('./routes/predictionRoutes');

const app = express();

// ---------------------------------------------------------------
// SECURITY & CORE MIDDLEWARE
// ---------------------------------------------------------------
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser());
app.use(mongoSanitize()); // strips $ and . from req.body/query/params to prevent NoSQL injection

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// Rate limiting — protects free-tier weather API + DB from abuse
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW_MIN, 10) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Serve uploaded report photos
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_DIR || 'uploads')));

// ---------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    db: getConnectionState(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------
// ROUTES
// ---------------------------------------------------------------
app.use('/api/auth', authRoutes);
app.use('/api/readings', readingRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/predictions', predictionRoutes);

// ---------------------------------------------------------------
// 404 + ERROR HANDLING (must be last)
// ---------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------
// SCHEDULED JOBS
// ---------------------------------------------------------------
// Every hour: backfill prediction accuracy against real readings
cron.schedule('0 * * * *', async () => {
  try {
    const Prediction = require('./models/Prediction');
    const Reading = require('./models/Reading');
    const pending = await Prediction.find({
      forTimestamp: { $lte: new Date() },
      actualAqi: { $exists: false },
    }).limit(500);

    for (const p of pending) {
      const closest = await Reading.findOne({
        createdAt: {
          $gte: new Date(p.forTimestamp.getTime() - 30 * 60000),
          $lte: new Date(p.forTimestamp.getTime() + 30 * 60000),
        },
      }).sort({ createdAt: -1 });
      if (closest && typeof closest.aqi === 'number') {
        p.actualAqi = closest.aqi;
        p.accuracy = Math.max(0, 100 - (Math.abs(p.predictedAqi - closest.aqi) / closest.aqi) * 100);
        await p.save();
      }
    }
    if (pending.length) console.log(`🔄 Cron: backfilled accuracy for ${pending.length} predictions`);
  } catch (err) {
    console.error('Cron job failed:', err.message);
  }
});

// ---------------------------------------------------------------
// STARTUP
// ---------------------------------------------------------------
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
  } catch (err) {
    console.error('⚠️  Starting server WITHOUT a database connection. API calls that need the DB will fail until MONGO_URI is fixed.');
  }

  app.listen(PORT, () => {
    console.log(`🚀 City Sense backend running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
  });
}

start();

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully.');
  process.exit(0);
});

module.exports = app;
