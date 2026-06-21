require('dotenv').config();
const { connectDB } = require('../config/db');
const mongoose = require('mongoose');
const Reading = require('../models/Reading');
const Report = require('../models/Report');
const User = require('../models/User');

const AREAS = ['Connaught Place', 'Karol Bagh', 'Lajpat Nagar', 'Rohini', 'Dwarka', 'Saket', 'Vasant Kunj'];
const ISSUE_TYPES = ['factory', 'traffic', 'construction'];
const DESCRIPTIONS = [
  'Heavy smoke visible from chimney',
  'Extreme traffic jam all day',
  'Night-time drilling causing noise',
];

async function seed() {
  await connectDB();
  console.log('🌱 Seeding database...');

  const existingCount = await Reading.countDocuments();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} readings. Skipping seed to avoid duplicates.`);
    console.log('Run with --force to wipe and reseed: node utils/seed.js --force');
    if (!process.argv.includes('--force')) {
      await mongoose.disconnect();
      return;
    }
    await Reading.deleteMany({});
    await Report.deleteMany({});
    console.log('Existing data cleared.');
  }

  const baseLat = 28.6139;
  const baseLng = 77.209;
  const now = Date.now();

  const readings = [];
  for (let i = 0; i < 100; i++) {
    const ts = new Date(now - i * 3600000 * 2);
    const aqi = Math.round(80 + Math.random() * 220);
    readings.push({
      location: {
        type: 'Point',
        coordinates: [baseLng + (Math.random() - 0.5) * 0.1, baseLat + (Math.random() - 0.5) * 0.1],
      },
      area: AREAS[i % AREAS.length],
      dbLevel: Math.round(45 + Math.random() * 40),
      aqi,
      pm25: +(Math.random() * 80).toFixed(1),
      pm10: +(Math.random() * 120).toFixed(1),
      co: +(Math.random() * 2000).toFixed(1),
      no2: +(Math.random() * 50).toFixed(1),
      so2: +(Math.random() * 20).toFixed(1),
      o3: +(Math.random() * 60).toFixed(1),
      temperature: +(25 + Math.random() * 10).toFixed(1),
      humidity: Math.round(40 + Math.random() * 40),
      source: 'simulated',
      createdAt: ts,
    });
  }
  await Reading.insertMany(readings);
  console.log(`✅ Inserted ${readings.length} readings`);

  const reports = [];
  for (let i = 0; i < 8; i++) {
    reports.push({
      location: {
        type: 'Point',
        coordinates: [baseLng + (Math.random() - 0.5) * 0.08, baseLat + (Math.random() - 0.5) * 0.08],
      },
      area: AREAS[i % AREAS.length],
      issueType: ISSUE_TYPES[i % ISSUE_TYPES.length],
      description: DESCRIPTIONS[i % DESCRIPTIONS.length],
      upvotes: Math.round(Math.random() * 20),
      downvotes: Math.round(Math.random() * 5),
      createdAt: new Date(now - i * 86400000),
    });
  }
  await Report.insertMany(reports);
  console.log(`✅ Inserted ${reports.length} reports`);

  const demoExists = await User.findOne({ email: 'demo@citysense.app' });
  if (!demoExists) {
    await User.create({
      name: 'Demo User',
      email: 'demo@citysense.app',
      password: 'demo1234',
      age: 28,
      healthConditions: ['asthma'],
      points: 45,
      streak: 3,
    });
    console.log('✅ Created demo user: demo@citysense.app / demo1234');
  }

  console.log('🌱 Seed complete.');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
