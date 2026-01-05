-- Fleet Tracker Database Schema (PostgreSQL)

-- Aircraft table: stores your fleet configuration
CREATE TABLE IF NOT EXISTS aircraft (
  icao24 TEXT PRIMARY KEY,
  registration TEXT NOT NULL,
  aircraft_type TEXT,
  created_at INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER
);

-- Positions table: stores all historical position data
CREATE TABLE IF NOT EXISTS positions (
  id SERIAL PRIMARY KEY,
  icao24 TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  velocity REAL,
  heading REAL,
  vertical_rate REAL,
  on_ground INTEGER NOT NULL,
  FOREIGN KEY (icao24) REFERENCES aircraft(icao24)
);

-- Index for fast position queries by aircraft and time
CREATE INDEX IF NOT EXISTS idx_positions_icao24_time ON positions(icao24, timestamp);

-- Flights table: one record per flight for statistics
CREATE TABLE IF NOT EXISTS flights (
  id SERIAL PRIMARY KEY,
  icao24 TEXT NOT NULL,
  takeoff_time INTEGER,
  landing_time INTEGER,
  takeoff_latitude REAL,
  takeoff_longitude REAL,
  landing_latitude REAL,
  landing_longitude REAL,
  max_altitude REAL,
  distance_km REAL,
  duration_seconds INTEGER,
  FOREIGN KEY (icao24) REFERENCES aircraft(icao24)
);

-- Index for fast flight queries by aircraft
CREATE INDEX IF NOT EXISTS idx_flights_icao24 ON flights(icao24);

-- Current state table: cache of latest position for each aircraft
CREATE TABLE IF NOT EXISTS current_state (
  icao24 TEXT PRIMARY KEY,
  timestamp INTEGER NOT NULL,
  latitude REAL,
  longitude REAL,
  altitude REAL,
  velocity REAL,
  heading REAL,
  on_ground INTEGER NOT NULL,
  last_updated INTEGER DEFAULT EXTRACT(EPOCH FROM NOW())::INTEGER,
  FOREIGN KEY (icao24) REFERENCES aircraft(icao24)
);
