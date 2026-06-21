# City Sense — Backend API

Production-ready **Node.js + Express + MongoDB** backend for the City Sense
Noise & Air Pollution Live Map app.

It replaces the browser-only `sql.js` storage with a real shared database,
adds user accounts, secures your OpenWeatherMap API key on the server
(never exposed to the browser), and exposes a clean REST API the frontend
calls instead of reading/writing localStorage.

---

## 1. Folder Structure

```
citysense-backend/
├── server.js              # App entry point — middleware, routes, cron jobs
├── config/
│   └── db.js               # MongoDB connection (mongoose)
├── models/
│   ├── User.js              # Auth + health profile + gamification fields
│   ├── Reading.js            # Geo-indexed noise/AQI readings
│   ├── Report.js             # Community pollution reports + voting
│   └── Prediction.js          # Forecast vs actual AQI (accuracy tracking)
├── controllers/
│   ├── authController.js      # register / login / logout / profile
│   ├── readingController.js    # CRUD + trends + leaderboard + CSV export
│   ├── reportController.js      # community reports + voting
│   ├── weatherController.js      # OpenWeatherMap proxy (key stays server-side)
│   └── predictionController.js    # 6-hour AQI forecast (ML-lite)
├── middleware/
│   ├── auth.js                # protect / optionalAuth / restrictTo
│   ├── errorHandler.js         # centralized error formatting
│   └── upload.js                # multer config for report photos
├── routes/                    # one file per resource, mounted in server.js
├── utils/
│   ├── jwt.js                  # token signing + cookie response helper
│   ├── gamification.js          # points / streaks / badge unlocking
│   └── seed.js                   # demo data seeder
├── uploads/                    # community report photos (served statically)
├── .env.example                # copy to .env and fill in real values
└── package.json
```

---

## 2. Quick Start

### Prerequisites
- Node.js 18+
- A MongoDB database — easiest is a **free MongoDB Atlas cluster**:
  https://www.mongodb.com/cloud/atlas/register (M0 tier is free forever)

### Setup

```bash
cd citysense-backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
```
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.mongodb.net/citysense
JWT_SECRET=<any long random string, 32+ chars>
OPENWEATHER_API_KEY=<your free key from openweathermap.org/api>
```

> **No OpenWeatherMap key yet?** Leave the placeholder — the weather/AQI
> endpoints automatically fall back to realistic simulated data so the app
> still works end-to-end while you wait for key approval (~few minutes to 2 hours).

### Run

```bash
npm run dev        # nodemon, auto-restarts on file changes
# or
npm start          # plain node, for production
```

You should see:
```
✅ MongoDB connected: cluster0.../citysense
🚀 City Sense backend running on port 5000 [development]
```

### Seed demo data (optional but recommended)

```bash
npm run seed
```
Creates 100 sample readings, 8 community reports, and a demo login:
`demo@citysense.app` / `demo1234`

### Verify it's alive

```bash
curl http://localhost:5000/api/health
```
```json
{"success":true,"status":"ok","db":"connected","uptime":12.4,...}
```

---

## 3. API Reference

Base URL: `http://localhost:5000/api`

All responses are JSON with a `success` boolean. Errors look like:
```json
{ "success": false, "message": "Human-readable reason" }
```

### Auth (`/auth`)
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/auth/register` | — | `{ name, email, password, age?, healthConditions? }` |
| POST | `/auth/login` | — | `{ email, password }` → returns JWT + sets cookie |
| POST | `/auth/logout` | — | Clears auth cookie |
| GET | `/auth/me` | 🔒 | Current user profile |
| PATCH | `/auth/me` | 🔒 | Update name/age/healthConditions/aqiAlertThreshold/home location |

Send the JWT either as `Authorization: Bearer <token>` or rely on the
`token` cookie that login/register set automatically.

### Readings (`/readings`)
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/readings` | optional | Save a reading. `{ lat, lng, area, dbLevel, aqi, pm25, pm10, co, no2, so2, o3, temperature, humidity }` |
| GET | `/readings/recent?limit=10` | — | Last N readings |
| GET | `/readings/nearby?lat=&lng=&radiusKm=5` | — | Geo-radius search |
| GET | `/readings/trend?days=7` | — | Hourly AQI/noise trend for charts |
| GET | `/readings/worst-hours` | — | Avg AQI by hour-of-day (0–23) |
| GET | `/readings/leaderboard` | — | Cleanest areas, lowest avg AQI |
| GET | `/readings/safe-zones?lat=&lng=` | — | Lowest-AQI areas near a point |
| GET | `/readings/export.csv` | — | Download all readings as CSV |

Logged-in users submitting a reading automatically earn **+5 points**,
streak updates, and any newly-qualified badges — returned in the response's
`gamification` field.

### Reports (`/reports`)
| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/reports` | optional | multipart form: `lat, lng, area, issueType, description, photo` (file field) |
| GET | `/reports?limit=20` | — | Recent reports |
| GET | `/reports/nearby?lat=&lng=&radiusKm=5` | — | Geo-radius search |
| PATCH | `/reports/:id/vote` | optional | `{ vote: "up" \| "down" }` |
| PATCH | `/reports/:id/status` | 🔒 admin | `{ status: "open"\|"reviewing"\|"resolved" }` |

`issueType` must be one of: `factory`, `traffic`, `construction`, `burning`, `other`.
Submitting a report earns **+10 points**.

### Weather / Air Quality (`/weather`)
| Method | Route | Description |
|---|---|---|
| GET | `/weather/air?lat=&lng=` | AQI + pollutants — proxies OpenWeatherMap, key never leaves the server |
| GET | `/weather/current?lat=&lng=` | Temperature, humidity, wind |
| GET | `/weather/compare?city1=Delhi&city2=Mumbai` | Side-by-side city comparison |

Responses are cached 5 minutes server-side to stay within the free-tier
rate limit, and include `"cached": true/false`. If no API key is configured,
responses include `"simulated": true` instead of failing.

### Predictions (`/predictions`)
| Method | Route | Description |
|---|---|---|
| GET | `/predictions/forecast?lat=&lng=` | 6-hour AQI forecast based on recent readings + time-of-day traffic factor |
| GET | `/predictions/accuracy` | Backfills + reports how accurate past forecasts were |

🔒 = requires valid JWT. "optional" = works anonymously, but credits a
logged-in user's points/badges if a valid token is provided.

---

## 4. Connecting the Frontend

In `city-sense.html`, replace the sql.js/localStorage calls with `fetch()`
calls to this API. Example for saving a reading:

```js
async function saveReading() {
  const res = await fetch('http://localhost:5000/api/readings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // sends the auth cookie if logged in
    body: JSON.stringify({
      lat: state.lat, lng: state.lng, area: state.areaName,
      dbLevel: state.dbLevel, aqi: state.aqi, pm25: state.pm25,
      pm10: state.pm10, co: state.co, no2: state.no2, so2: state.so2,
      temperature: state.temp, humidity: state.humidity,
    }),
  });
  const data = await res.json();
  if (data.gamification?.newBadges?.length) {
    data.gamification.newBadges.forEach(b => toast('🏆 Badge Earned!', b.name));
  }
}
```

And for fetching AQI through your now-secure backend instead of calling
OpenWeatherMap directly from the browser:

```js
async function fetchAirQuality() {
  const res = await fetch(`http://localhost:5000/api/weather/air?lat=${state.lat}&lng=${state.lng}`);
  const data = await res.json();
  updateAirData(data); // same shape as before: { aqi, pm25, pm10, no2, so2, co, o3 }
}
```

Update `CLIENT_URL` in `.env` to match wherever you host the frontend
(e.g. `https://yourapp.com`) so CORS allows it.

---

## 5. Security Notes

- Passwords hashed with bcrypt (cost factor 12), never returned in API responses.
- JWT stored in an `httpOnly` cookie (not accessible to JS / XSS) **and**
  returned in the JSON body for clients that prefer `Authorization` headers.
- `express-mongo-sanitize` strips `$`/`.` operators from input to prevent
  NoSQL injection.
- `helmet` sets standard security headers; `express-rate-limit` caps
  requests per IP (default 200 / 15 min — tune via `.env`).
- Report photo uploads are restricted to `.jpg/.jpeg/.png/.webp`, capped
  at 5MB (configurable), and stored with randomized filenames.
- **Never commit your real `.env`** — only `.env.example` is tracked in git.

### Fast-fail when MongoDB is unreachable

Every route that needs the database is guarded by `middleware/requireDB.js`,
which checks the live connection state and immediately returns `503` if
Mongo isn't connected — instead of silently hanging for ~10 seconds, which
is mongoose's default query-buffering timeout. The one exception is
`GET /predictions/forecast`, which degrades gracefully to a default-assumption
forecast (flagged with `"degraded": true` in the response) since a forecast
is still useful without historical data. `GET /api/health` always works and
reports the real DB state (`"connected"` / `"disconnected"`) so you can monitor
this directly.

---

## 6. Deployment

Any Node host works (Render, Railway, Fly.io, a VPS, etc.). Typical steps:

1. Push this folder to a git repo (without `.env` — it's gitignored).
2. Create a free MongoDB Atlas cluster, allow your host's IP (or `0.0.0.0/0` for simplicity), get the connection string.
3. On your host, set environment variables matching `.env.example`.
4. Set the start command to `npm start`.
5. Point your frontend's `fetch()` base URL at the deployed backend URL,
   and set `CLIENT_URL` in the backend's env to your frontend's deployed URL.

---

## 7. Scheduled Jobs

A cron job runs **every hour** (`node-cron`, `0 * * * *`) to backfill
prediction accuracy — it matches each past forecast against the closest
real reading and stores how close the prediction was, powering the
`/predictions/accuracy` endpoint over time.
