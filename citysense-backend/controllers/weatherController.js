const { asyncHandler } = require('../middleware/errorHandler');

// Simple in-memory cache to avoid hammering the free-tier API
// (OpenWeatherMap free tier: 60 calls/min, 1,000,000 calls/month)
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, time: Date.now() });
}

function aqiFromOwmIndex(owmIndex) {
  // OpenWeatherMap returns AQI 1-5; map to a more granular 0-300+ scale
  // consistent with the frontend's category thresholds.
  const map = { 1: 25, 2: 75, 3: 125, 4: 175, 5: 250 };
  return map[owmIndex] || 0;
}

// GET /api/weather/air?lat=..&lng=..
exports.getAirQuality = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng query params are required.' });
  }

  const cacheKey = `air:${lat}:${lng}`;
  const cached = getCached(cacheKey);
  if (cached) return res.status(200).json({ success: true, cached: true, ...cached });

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'your_openweathermap_api_key_here') {
    // No key configured — return clearly-labeled simulated data instead of failing
    const simulated = simulateAirQuality();
    return res.status(200).json({ success: true, simulated: true, ...simulated });
  }

  const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lng}&appid=${apiKey}`;
  const response = await fetch(url);
  if (!response.ok) {
    const simulated = simulateAirQuality();
    return res.status(200).json({ success: true, simulated: true, fallbackReason: `OWM responded ${response.status}`, ...simulated });
  }
  const data = await response.json();
  const comp = data.list[0].components;
  const result = {
    aqi: aqiFromOwmIndex(data.list[0].main.aqi),
    pm25: comp.pm2_5,
    pm10: comp.pm10,
    no2: comp.no2,
    so2: comp.so2,
    co: comp.co,
    o3: comp.o3,
  };

  setCached(cacheKey, result);
  res.status(200).json({ success: true, cached: false, ...result });
});

// GET /api/weather/current?lat=..&lng=..
exports.getCurrentWeather = asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) {
    return res.status(400).json({ success: false, message: 'lat and lng query params are required.' });
  }

  const cacheKey = `weather:${lat}:${lng}`;
  const cached = getCached(cacheKey);
  if (cached) return res.status(200).json({ success: true, cached: true, ...cached });

  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey || apiKey === 'your_openweathermap_api_key_here') {
    const simulated = simulateWeather();
    return res.status(200).json({ success: true, simulated: true, ...simulated });
  }

  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`;
  const response = await fetch(url);
  if (!response.ok) {
    const simulated = simulateWeather();
    return res.status(200).json({ success: true, simulated: true, fallbackReason: `OWM responded ${response.status}`, ...simulated });
  }
  const data = await response.json();
  const result = {
    temperature: data.main.temp,
    humidity: data.main.humidity,
    windSpeed: data.wind.speed,
    windDeg: data.wind.deg,
  };

  setCached(cacheKey, result);
  res.status(200).json({ success: true, cached: false, ...result });
});

// GET /api/weather/compare?city1=Delhi&city2=Mumbai
exports.compareCities = asyncHandler(async (req, res) => {
  const { city1, city2 } = req.query;
  if (!city1 || !city2) {
    return res.status(400).json({ success: false, message: 'city1 and city2 query params are required.' });
  }

  const apiKey = process.env.OPENWEATHER_API_KEY;

  async function fetchCity(name) {
    if (!apiKey || apiKey === 'your_openweathermap_api_key_here') {
      return { city: name, ...simulateWeather(), ...simulateAirQuality() };
    }
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(name)}&limit=1&appid=${apiKey}`;
    const geoRes = await fetch(geoUrl);
    const geoData = await geoRes.json();
    if (!geoData[0]) return { city: name, error: 'City not found' };

    const { lat, lon } = geoData[0];
    const [weatherRes, airRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
      fetch(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`),
    ]);
    const weather = await weatherRes.json();
    const air = await airRes.json();
    const comp = air.list[0].components;

    return {
      city: name,
      temperature: weather.main.temp,
      humidity: weather.main.humidity,
      aqi: aqiFromOwmIndex(air.list[0].main.aqi),
      pm25: comp.pm2_5,
      pm10: comp.pm10,
    };
  }

  const [data1, data2] = await Promise.all([fetchCity(city1), fetchCity(city2)]);
  res.status(200).json({ success: true, city1: data1, city2: data2 });
});

// ---- Simulation fallbacks (used when no API key is configured yet) ----
function simulateAirQuality() {
  const hour = new Date().getHours();
  const base = hour > 7 && hour < 22 ? 120 : 70;
  return {
    aqi: Math.round(base + Math.random() * 80),
    pm25: +(Math.random() * 60 + 10).toFixed(1),
    pm10: +(Math.random() * 100 + 20).toFixed(1),
    no2: +(Math.random() * 40 + 5).toFixed(1),
    so2: +(Math.random() * 15 + 1).toFixed(1),
    co: +(Math.random() * 1000 + 200).toFixed(0),
    o3: +(Math.random() * 60 + 10).toFixed(1),
  };
}

function simulateWeather() {
  return {
    temperature: +(28 + Math.random() * 8 - 4).toFixed(1),
    humidity: Math.round(50 + Math.random() * 30),
    windSpeed: +(2 + Math.random() * 5).toFixed(1),
    windDeg: Math.round(Math.random() * 360),
  };
}
