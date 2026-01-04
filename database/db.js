const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// Initialize SQLite database
const dbPath = path.join(__dirname, 'fleet.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Execute schema (creates tables if they don't exist)
  db.exec(schema);

  console.log('Database initialized successfully');
}

// Insert or update aircraft in the fleet
function upsertAircraft(icao24, registration, aircraftType) {
  const stmt = db.prepare(`
    INSERT INTO aircraft (icao24, registration, aircraft_type)
    VALUES (?, ?, ?)
    ON CONFLICT(icao24) DO UPDATE SET
      registration = excluded.registration,
      aircraft_type = excluded.aircraft_type
  `);

  stmt.run(icao24, registration, aircraftType);
}

// Save position data
function savePosition(icao24, timestamp, latitude, longitude, altitude, velocity, heading, verticalRate, onGround) {
  const stmt = db.prepare(`
    INSERT INTO positions (icao24, timestamp, latitude, longitude, altitude, velocity, heading, vertical_rate, on_ground)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(icao24, timestamp, latitude, longitude, altitude, velocity, heading, verticalRate, onGround ? 1 : 0);
}

// Update current state
function updateCurrentState(icao24, timestamp, latitude, longitude, altitude, velocity, heading, onGround) {
  const stmt = db.prepare(`
    INSERT INTO current_state (icao24, timestamp, latitude, longitude, altitude, velocity, heading, on_ground, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
    ON CONFLICT(icao24) DO UPDATE SET
      timestamp = excluded.timestamp,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      altitude = excluded.altitude,
      velocity = excluded.velocity,
      heading = excluded.heading,
      on_ground = excluded.on_ground,
      last_updated = strftime('%s', 'now')
  `);

  stmt.run(icao24, timestamp, latitude, longitude, altitude, velocity, heading, onGround ? 1 : 0);
}

// Get current state for all aircraft
function getAllCurrentStates() {
  const stmt = db.prepare(`
    SELECT
      a.icao24,
      a.registration,
      a.aircraft_type,
      cs.timestamp,
      cs.latitude,
      cs.longitude,
      cs.altitude,
      cs.velocity,
      cs.heading,
      cs.on_ground,
      cs.last_updated
    FROM aircraft a
    LEFT JOIN current_state cs ON a.icao24 = cs.icao24
  `);

  return stmt.all();
}

// Get current state for a specific aircraft
function getCurrentState(icao24) {
  const stmt = db.prepare(`
    SELECT * FROM current_state WHERE icao24 = ?
  `);

  return stmt.get(icao24);
}

// Create a new flight record
function createFlight(icao24, takeoffTime, latitude, longitude, altitude) {
  const stmt = db.prepare(`
    INSERT INTO flights (icao24, takeoff_time, takeoff_latitude, takeoff_longitude, max_altitude)
    VALUES (?, ?, ?, ?, ?)
  `);

  const result = stmt.run(icao24, takeoffTime, latitude, longitude, altitude);
  return result.lastInsertRowid;
}

// Update flight record (for landing or max altitude updates)
function updateFlight(flightId, updates) {
  const fields = [];
  const values = [];

  if (updates.landingTime !== undefined) {
    fields.push('landing_time = ?');
    values.push(updates.landingTime);
  }
  if (updates.landingLatitude !== undefined) {
    fields.push('landing_latitude = ?');
    values.push(updates.landingLatitude);
  }
  if (updates.landingLongitude !== undefined) {
    fields.push('landing_longitude = ?');
    values.push(updates.landingLongitude);
  }
  if (updates.maxAltitude !== undefined) {
    fields.push('max_altitude = ?');
    values.push(updates.maxAltitude);
  }
  if (updates.distanceKm !== undefined) {
    fields.push('distance_km = ?');
    values.push(updates.distanceKm);
  }
  if (updates.durationSeconds !== undefined) {
    fields.push('duration_seconds = ?');
    values.push(updates.durationSeconds);
  }

  if (fields.length === 0) return;

  const stmt = db.prepare(`
    UPDATE flights SET ${fields.join(', ')} WHERE id = ?
  `);

  stmt.run(...values, flightId);
}

// Get active flight (not yet landed) for an aircraft
function getActiveFlight(icao24) {
  const stmt = db.prepare(`
    SELECT * FROM flights
    WHERE icao24 = ? AND landing_time IS NULL
    ORDER BY takeoff_time DESC
    LIMIT 1
  `);

  return stmt.get(icao24);
}

// Get recent positions for map history
function getRecentPositions(hours = 24) {
  const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);

  const stmt = db.prepare(`
    SELECT
      p.*,
      a.registration,
      a.aircraft_type
    FROM positions p
    JOIN aircraft a ON p.icao24 = a.icao24
    WHERE p.timestamp > ?
    ORDER BY p.icao24, p.timestamp ASC
  `);

  return stmt.all(cutoffTime);
}

// Get flight history for a specific aircraft
function getFlightHistory(icao24, limit = 50) {
  const stmt = db.prepare(`
    SELECT * FROM flights
    WHERE icao24 = ? AND landing_time IS NOT NULL
    ORDER BY takeoff_time DESC
    LIMIT ?
  `);

  return stmt.all(icao24, limit);
}

// Get statistics for all aircraft
function getStatistics() {
  const stmt = db.prepare(`
    SELECT
      a.icao24,
      a.registration,
      a.aircraft_type,
      COUNT(f.id) as total_flights,
      COALESCE(SUM(f.duration_seconds), 0) as total_flight_seconds,
      COALESCE(SUM(f.distance_km), 0) as total_distance_km,
      COALESCE(AVG(f.duration_seconds), 0) as avg_flight_seconds,
      COALESCE(MAX(f.max_altitude), 0) as max_altitude_ever
    FROM aircraft a
    LEFT JOIN flights f ON a.icao24 = f.icao24 AND f.landing_time IS NOT NULL
    GROUP BY a.icao24
  `);

  return stmt.all();
}

// Clean up old position data
function cleanupOldPositions(daysToKeep = 30) {
  const cutoffTime = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);

  const stmt = db.prepare(`
    DELETE FROM positions WHERE timestamp < ?
  `);

  const result = stmt.run(cutoffTime);
  console.log(`Cleaned up ${result.changes} old position records`);
  return result.changes;
}

// Export functions
module.exports = {
  db,
  initializeDatabase,
  upsertAircraft,
  savePosition,
  updateCurrentState,
  getAllCurrentStates,
  getCurrentState,
  createFlight,
  updateFlight,
  getActiveFlight,
  getRecentPositions,
  getFlightHistory,
  getStatistics,
  cleanupOldPositions
};
