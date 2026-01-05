const db = require('../database/db');

// In-memory store for active flights (flight_id mapped by icao24)
const activeFlights = new Map();

// Calculate distance between two points using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Process new aircraft state data
async function processAircraftState(aircraftData) {
  const { icao24, latitude, longitude, altitude, velocity, heading, verticalRate, onGround, lastContact } = aircraftData;

  // Skip if missing critical data
  if (latitude === null || longitude === null) {
    console.log(`Skipping ${icao24}: missing position data`);
    return;
  }

  // Get previous state
  const previousState = await db.getCurrentState(icao24);

  // Save position to history
  await db.savePosition(
    icao24,
    lastContact,
    latitude,
    longitude,
    altitude,
    velocity,
    heading,
    verticalRate,
    onGround
  );

  // Update current state
  await db.updateCurrentState(
    icao24,
    lastContact,
    latitude,
    longitude,
    altitude,
    velocity,
    heading,
    onGround
  );

  // Detect state changes
  if (previousState) {
    const stateChange = detectStateChange(aircraftData, previousState);

    if (stateChange) {
      await handleStateChange(icao24, stateChange, aircraftData, previousState);
    } else {
      // Update ongoing flight data
      await updateOngoingFlight(icao24, aircraftData, previousState);
    }
  } else {
    // First time seeing this aircraft
    console.log(`First observation of ${icao24}`);

    // If already airborne, create an in-progress flight
    if (!onGround && altitude && altitude > 50 && velocity && velocity > 15) {
      console.log(`${icao24} is already airborne, creating in-progress flight`);
      const flightId = await db.createFlight(icao24, lastContact, latitude, longitude, altitude);
      activeFlights.set(icao24, flightId);
    }
  }
}

// Detect state changes (takeoff or landing)
function detectStateChange(newState, previousState) {
  const wasOnGround = previousState.on_ground === 1;
  const isOnGround = newState.onGround === true;

  // Ignore null values
  if (newState.onGround === null) {
    return null;
  }

  // Takeoff detection: ground → airborne with altitude and velocity thresholds
  if (wasOnGround && !isOnGround && newState.altitude && newState.altitude > 50 && newState.velocity && newState.velocity > 15) {
    return 'TAKEOFF';
  }

  // Landing detection: airborne → ground with low velocity
  if (!wasOnGround && isOnGround && newState.velocity !== null && newState.velocity < 5) {
    return 'LANDING';
  }

  return null;
}

// Handle detected state change
async function handleStateChange(icao24, eventType, newState, previousState) {
  if (eventType === 'TAKEOFF') {
    console.log(`✈️  TAKEOFF detected for ${icao24}`);

    // Create new flight record
    const flightId = await db.createFlight(
      icao24,
      newState.lastContact,
      newState.latitude,
      newState.longitude,
      newState.altitude
    );

    // Store active flight ID
    activeFlights.set(icao24, flightId);

  } else if (eventType === 'LANDING') {
    console.log(`🛬 LANDING detected for ${icao24}`);

    // Get active flight ID
    let flightId = activeFlights.get(icao24);

    // If no active flight in memory, check database
    if (!flightId) {
      const activeFlight = await db.getActiveFlight(icao24);
      if (activeFlight) {
        flightId = activeFlight.id;
      }
    }

    if (flightId) {
      // Calculate flight duration
      const flight = await db.getActiveFlight(icao24);
      const durationSeconds = newState.lastContact - flight.takeoff_time;

      // Calculate total distance
      let totalDistance = flight.distance_km || 0;
      if (previousState.latitude && previousState.longitude) {
        const segmentDistance = calculateDistance(
          previousState.latitude,
          previousState.longitude,
          newState.latitude,
          newState.longitude
        );
        totalDistance += segmentDistance;
      }

      // Update flight record with landing info
      await db.updateFlight(flightId, {
        landingTime: newState.lastContact,
        landingLatitude: newState.latitude,
        landingLongitude: newState.longitude,
        distanceKm: totalDistance,
        durationSeconds: durationSeconds
      });

      console.log(`Flight ${flightId} completed: ${(durationSeconds / 60).toFixed(1)} minutes, ${totalDistance.toFixed(1)} km`);

      // Remove from active flights
      activeFlights.delete(icao24);
    } else {
      console.log(`No active flight found for ${icao24} landing`);
    }
  }
}

// Update ongoing flight data (max altitude, distance)
async function updateOngoingFlight(icao24, newState, previousState) {
  // Check if there's an active flight
  let flightId = activeFlights.get(icao24);

  if (!flightId) {
    const activeFlight = await db.getActiveFlight(icao24);
    if (activeFlight) {
      flightId = activeFlight.id;
      activeFlights.set(icao24, flightId);
    }
  }

  if (flightId && !newState.onGround) {
    const flight = await db.getActiveFlight(icao24);

    const updates = {};

    // Update max altitude if current altitude is higher
    if (newState.altitude && (!flight.max_altitude || newState.altitude > flight.max_altitude)) {
      updates.maxAltitude = newState.altitude;
    }

    // Accumulate distance
    if (previousState.latitude && previousState.longitude && newState.latitude && newState.longitude) {
      const segmentDistance = calculateDistance(
        previousState.latitude,
        previousState.longitude,
        newState.latitude,
        newState.longitude
      );

      const currentDistance = flight.distance_km || 0;
      updates.distanceKm = currentDistance + segmentDistance;
    }

    // Update if there are changes
    if (Object.keys(updates).length > 0) {
      await db.updateFlight(flightId, updates);
    }
  }
}

// Initialize active flights from database on startup
async function initializeActiveFlights() {
  const config = require('../config');

  for (const aircraft of config.aircraft) {
    const activeFlight = await db.getActiveFlight(aircraft.icao24);
    if (activeFlight) {
      activeFlights.set(aircraft.icao24, activeFlight.id);
      console.log(`Resumed tracking flight ${activeFlight.id} for ${aircraft.registration}`);
    }
  }
}

module.exports = {
  processAircraftState,
  initializeActiveFlights,
  calculateDistance
};
