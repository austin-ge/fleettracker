const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get database connection URL from environment or use default
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://fleettracker:AirplaneSpy@fleettracker-db-ucgpcg:5432/fleettracker';

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// Initialize database schema
async function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    // Execute schema (creates tables if they don't exist)
    await client.query(schema);
    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

// Insert or update aircraft in the fleet
async function upsertAircraft(icao24, registration, aircraftType) {
  await pool.query(`
    INSERT INTO aircraft (icao24, registration, aircraft_type)
    VALUES ($1, $2, $3)
    ON CONFLICT(icao24) DO UPDATE SET
      registration = EXCLUDED.registration,
      aircraft_type = EXCLUDED.aircraft_type
  `, [icao24, registration, aircraftType]);
}

// Save position data
async function savePosition(icao24, timestamp, latitude, longitude, altitude, velocity, heading, verticalRate, onGround) {
  await pool.query(`
    INSERT INTO positions (icao24, timestamp, latitude, longitude, altitude, velocity, heading, vertical_rate, on_ground)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [icao24, timestamp, latitude, longitude, altitude, velocity, heading, verticalRate, onGround ? 1 : 0]);
}

// Update current state
async function updateCurrentState(icao24, timestamp, latitude, longitude, altitude, velocity, heading, onGround) {
  await pool.query(`
    INSERT INTO current_state (icao24, timestamp, latitude, longitude, altitude, velocity, heading, on_ground, last_updated)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, EXTRACT(EPOCH FROM NOW())::INTEGER)
    ON CONFLICT(icao24) DO UPDATE SET
      timestamp = EXCLUDED.timestamp,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      altitude = EXCLUDED.altitude,
      velocity = EXCLUDED.velocity,
      heading = EXCLUDED.heading,
      on_ground = EXCLUDED.on_ground,
      last_updated = EXTRACT(EPOCH FROM NOW())::INTEGER
  `, [icao24, timestamp, latitude, longitude, altitude, velocity, heading, onGround ? 1 : 0]);
}

// Get current state for all aircraft
async function getAllCurrentStates() {
  const result = await pool.query(`
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

  return result.rows;
}

// Get current state for a specific aircraft
async function getCurrentState(icao24) {
  const result = await pool.query(`
    SELECT * FROM current_state WHERE icao24 = $1
  `, [icao24]);

  return result.rows[0];
}

// Create a new flight record
async function createFlight(icao24, takeoffTime, latitude, longitude, altitude) {
  const result = await pool.query(`
    INSERT INTO flights (icao24, takeoff_time, takeoff_latitude, takeoff_longitude, max_altitude)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [icao24, takeoffTime, latitude, longitude, altitude]);

  return result.rows[0].id;
}

// Update flight record (for landing or max altitude updates)
async function updateFlight(flightId, updates) {
  const fields = [];
  const values = [];
  let paramCount = 1;

  if (updates.landingTime !== undefined) {
    fields.push(`landing_time = $${paramCount++}`);
    values.push(updates.landingTime);
  }
  if (updates.landingLatitude !== undefined) {
    fields.push(`landing_latitude = $${paramCount++}`);
    values.push(updates.landingLatitude);
  }
  if (updates.landingLongitude !== undefined) {
    fields.push(`landing_longitude = $${paramCount++}`);
    values.push(updates.landingLongitude);
  }
  if (updates.maxAltitude !== undefined) {
    fields.push(`max_altitude = $${paramCount++}`);
    values.push(updates.maxAltitude);
  }
  if (updates.distanceKm !== undefined) {
    fields.push(`distance_km = $${paramCount++}`);
    values.push(updates.distanceKm);
  }
  if (updates.durationSeconds !== undefined) {
    fields.push(`duration_seconds = $${paramCount++}`);
    values.push(updates.durationSeconds);
  }

  if (fields.length === 0) return;

  values.push(flightId);

  await pool.query(`
    UPDATE flights SET ${fields.join(', ')} WHERE id = $${paramCount}
  `, values);
}

// Get active flight (not yet landed) for an aircraft
async function getActiveFlight(icao24) {
  const result = await pool.query(`
    SELECT * FROM flights
    WHERE icao24 = $1 AND landing_time IS NULL
    ORDER BY takeoff_time DESC
    LIMIT 1
  `, [icao24]);

  return result.rows[0];
}

// Get recent positions for map history
async function getRecentPositions(hours = 24) {
  const cutoffTime = Math.floor(Date.now() / 1000) - (hours * 3600);

  const result = await pool.query(`
    SELECT
      p.*,
      a.registration,
      a.aircraft_type
    FROM positions p
    JOIN aircraft a ON p.icao24 = a.icao24
    WHERE p.timestamp > $1
    ORDER BY p.icao24, p.timestamp ASC
  `, [cutoffTime]);

  return result.rows;
}

// Get flight history for a specific aircraft
async function getFlightHistory(icao24, limit = 50) {
  const result = await pool.query(`
    SELECT * FROM flights
    WHERE icao24 = $1 AND landing_time IS NOT NULL
    ORDER BY takeoff_time DESC
    LIMIT $2
  `, [icao24, limit]);

  return result.rows;
}

// Get statistics for all aircraft
async function getStatistics() {
  const result = await pool.query(`
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
    GROUP BY a.icao24, a.registration, a.aircraft_type
  `);

  return result.rows;
}

// Clean up old position data
async function cleanupOldPositions(daysToKeep = 30) {
  const cutoffTime = Math.floor(Date.now() / 1000) - (daysToKeep * 86400);

  const result = await pool.query(`
    DELETE FROM positions WHERE timestamp < $1
  `, [cutoffTime]);

  console.log(`Cleaned up ${result.rowCount} old position records`);
  return result.rowCount;
}

// Graceful shutdown
async function closePool() {
  await pool.end();
  console.log('Database pool closed');
}

// ============ User Management Functions ============

// Create a new user
async function createUser(email, passwordHash) {
  const result = await pool.query(`
    INSERT INTO users (email, password_hash)
    VALUES ($1, $2)
    RETURNING id, email, created_at
  `, [email.toLowerCase(), passwordHash]);

  return result.rows[0];
}

// Get user by email
async function getUserByEmail(email) {
  const result = await pool.query(`
    SELECT id, email, password_hash, created_at, last_login
    FROM users
    WHERE email = $1
  `, [email.toLowerCase()]);

  return result.rows[0] || null;
}

// Get user by ID
async function getUserById(userId) {
  const result = await pool.query(`
    SELECT id, email, created_at, last_login
    FROM users
    WHERE id = $1
  `, [userId]);

  return result.rows[0] || null;
}

// Update last login timestamp
async function updateLastLogin(userId) {
  const now = Math.floor(Date.now() / 1000);
  await pool.query(`
    UPDATE users SET last_login = $1 WHERE id = $2
  `, [now, userId]);
}

// Get all aircraft for a specific user
async function getUserAircraft(userId) {
  const result = await pool.query(`
    SELECT
      a.icao24,
      a.registration,
      a.aircraft_type,
      ua.added_at,
      cs.latitude,
      cs.longitude,
      cs.altitude,
      cs.velocity,
      cs.heading,
      cs.on_ground,
      cs.last_updated
    FROM user_aircraft ua
    JOIN aircraft a ON ua.icao24 = a.icao24
    LEFT JOIN current_state cs ON a.icao24 = cs.icao24
    WHERE ua.user_id = $1
    ORDER BY ua.added_at DESC
  `, [userId]);

  return result.rows;
}

// Add aircraft to user's fleet
async function addAircraftToUser(userId, icao24) {
  try {
    await pool.query(`
      INSERT INTO user_aircraft (user_id, icao24)
      VALUES ($1, $2)
      ON CONFLICT (user_id, icao24) DO NOTHING
    `, [userId, icao24.toLowerCase()]);
    return true;
  } catch (error) {
    console.error('Error adding aircraft to user:', error);
    return false;
  }
}

// Remove aircraft from user's fleet
async function removeAircraftFromUser(userId, icao24) {
  const result = await pool.query(`
    DELETE FROM user_aircraft
    WHERE user_id = $1 AND icao24 = $2
  `, [userId, icao24.toLowerCase()]);

  return result.rowCount > 0;
}

// Get all unique aircraft tracked by any user
async function getAllTrackedAircraft() {
  const result = await pool.query(`
    SELECT DISTINCT icao24 FROM user_aircraft
  `);

  return result.rows.map(row => row.icao24);
}

// Get current states filtered by user's aircraft
async function getUserCurrentStates(userId) {
  const result = await pool.query(`
    SELECT
      a.icao24,
      a.registration,
      a.aircraft_type,
      cs.latitude,
      cs.longitude,
      cs.altitude,
      cs.velocity,
      cs.heading,
      cs.on_ground,
      cs.last_updated
    FROM user_aircraft ua
    JOIN aircraft a ON ua.icao24 = a.icao24
    LEFT JOIN current_state cs ON a.icao24 = cs.icao24
    WHERE ua.user_id = $1
  `, [userId]);

  return result.rows;
}

// Export functions
module.exports = {
  pool,
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
  cleanupOldPositions,
  closePool,
  // User management
  createUser,
  getUserByEmail,
  getUserById,
  updateLastLogin,
  getUserAircraft,
  addAircraftToUser,
  removeAircraftFromUser,
  getAllTrackedAircraft,
  getUserCurrentStates
};
