# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fleet Tracker is a real-time aircraft tracking web application that polls ADS-B data from OpenSky Network API, detects flight state changes (takeoffs/landings), and displays live positions on a map with historical flight statistics.

## Commands

### Development
```bash
npm run dev    # Start with auto-reload (nodemon)
npm start      # Production mode
```

### Database Management
```bash
# Reset database (deletes all data)
rm database/fleet.db
npm start  # Will recreate schema on startup

# Database is created automatically on first run
# Located at: database/fleet.db
```

## Architecture

### Data Flow

1. **Background Polling Loop** (server.js)
   - Runs every 60s (configurable in config.js)
   - Fetches state vectors from OpenSky Network for configured aircraft ICAO24 codes
   - Passes raw data to tracker service

2. **State Change Detection** (services/tracker.js)
   - Compares new position data against `current_state` table
   - Detects takeoff: `on_ground: true → false` AND `altitude > 50m` AND `velocity > 15 m/s`
   - Detects landing: `on_ground: false → true` AND `velocity < 5 m/s`
   - Creates flight record on takeoff, closes on landing
   - Accumulates distance using Haversine formula during flight

3. **Database Layer** (database/db.js)
   - Four tables: `aircraft`, `positions`, `flights`, `current_state`
   - `positions`: raw telemetry history (cleaned after 30 days)
   - `flights`: one record per flight with pre-computed stats
   - `current_state`: single row per aircraft for fast map updates
   - In-memory `activeFlights` Map in tracker.js tracks ongoing flights

4. **Frontend Polling** (public/js/)
   - Browser polls `/api/fleet/current` every 10 seconds
   - Map updates aircraft markers and flight paths
   - Table and stats components re-render with new data

### Critical Implementation Details

**OpenSky API Integration:**
- Requires Node.js 18+ (uses native fetch, not node-fetch)
- Anonymous: 400 credits/day, recommend 60s polling
- Authenticated: 4000+ credits/day, can poll at 30s
- State vector array format (18 fields): `[icao24, callsign, ..., longitude(5), latitude(6), altitude(7), on_ground(8), velocity(9), heading(10), ...]`

**Flight State Machine:**
- First observation of airborne aircraft creates "in-progress" flight
- App restart resumes active flights from database (`landing_time IS NULL`)
- Distance calculation uses Haversine formula, accumulated per position update
- Max altitude tracked throughout flight, updated with each position

**Configuration (config.js):**
- `aircraft[]`: ICAO24 hex codes (6-char lowercase) are the primary keys
- Find ICAO24 codes: https://registry.faa.gov/ (US) or https://opensky-network.org/aircraft-database
- Poll interval must respect rate limits (60s anonymous, 30s+ authenticated)

**Database Schema Notes:**
- SQLite stores booleans as INTEGER (0/1)
- Timestamps are Unix epoch (seconds since 1970)
- Foreign keys enabled via `db.pragma('foreign_keys = ON')`
- Indexes on `positions(icao24, timestamp)` and `flights(icao24)` for performance

## API Endpoints

- `GET /api/fleet/current` - Join aircraft + current_state tables
- `GET /api/fleet/history?hours=24` - Recent positions for flight trails
- `GET /api/flights/:icao24` - Completed flights (landing_time NOT NULL)
- `GET /api/statistics` - Aggregated per-aircraft stats with COUNT/SUM/AVG

## Common Modifications

### Adding Aircraft
Edit `config.js` aircraft array with ICAO24, registration, and type. Server must be restarted.

### Changing Map Center
Edit `public/js/map.js` line 7: `map = L.map('map').setView([lat, lon], zoom)`

### Adjusting Thresholds
Takeoff/landing detection logic in `services/tracker.js`:
- Altitude threshold: 50m
- Velocity thresholds: 15 m/s (takeoff), 5 m/s (landing)

### Changing Polling Intervals
- Backend: `config.js` → `opensky.pollInterval` (milliseconds)
- Frontend: `public/index.html` → `setInterval()` call (currently 10000ms)

## Troubleshooting

**"fetch is not a function"**
- Node.js < 18 doesn't have native fetch
- Solution: Upgrade Node.js or switch to node-fetch v2 (CommonJS compatible)

**No aircraft on map**
- Verify ICAO24 codes are correct and lowercase in config.js
- Aircraft must be powered on and transmitting ADS-B
- Check server console for OpenSky API errors or rate limiting

**Rate limit errors**
- Increase `pollInterval` in config.js (e.g., 60s → 90s)
- Add OpenSky credentials for higher limits
- Monitor `X-Rate-Limit-Remaining` header in console logs

**Flight not detected**
- Check `on_ground` field isn't null (unreliable data)
- Verify velocity/altitude thresholds are appropriate for aircraft type
- Takeoff/landing events logged to console with ✈️ and 🛬 emojis
