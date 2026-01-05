const express = require('express');
const path = require('path');
const cron = require('node-cron');
const config = require('./config');
const db = require('./database/db');
const DataFetcher = require('./services/dataFetcher');
const tracker = require('./services/tracker');

// Initialize Express app
const app = express();
const PORT = config.server.port;

// Initialize hybrid data fetcher (dump1090 + OpenSky)
const dataFetcher = new DataFetcher(config);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API Endpoints

// Get current state of all aircraft in the fleet
app.get('/api/fleet/current', async (req, res) => {
  try {
    const currentStates = await db.getAllCurrentStates();
    res.json(currentStates);
  } catch (error) {
    console.error('Error fetching current states:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent position history for map trails
app.get('/api/fleet/history', async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const positions = await db.getRecentPositions(hours);
    res.json(positions);
  } catch (error) {
    console.error('Error fetching position history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get flight history for a specific aircraft
app.get('/api/flights/:icao24', async (req, res) => {
  try {
    const icao24 = req.params.icao24.toLowerCase();
    const limit = parseInt(req.query.limit) || 50;
    const flights = await db.getFlightHistory(icao24, limit);
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flight history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics for all aircraft
app.get('/api/statistics', async (req, res) => {
  try {
    const stats = await db.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Background polling function
async function pollFleetData() {
  console.log('Polling for fleet data...');

  try {
    // Get ICAO24 codes from config
    const icao24Array = config.aircraft.map(aircraft => aircraft.icao24);

    // Fetch data from hybrid sources (dump1090 + OpenSky fallback)
    const result = await dataFetcher.fetchFleetData(icao24Array);

    // Handle errors
    if (result.error) {
      console.error(`Data fetch error: ${result.error}`);
      // Continue processing any aircraft data we did get
    }

    // Log sources used
    if (result.sources) {
      console.log(`Sources: ${result.sources.local} local, ${result.sources.opensky} OpenSky`);
    }

    // Process each aircraft
    if (result.aircraft && result.aircraft.length > 0) {
      console.log(`Received data for ${result.aircraft.length} aircraft`);

      for (const aircraftData of result.aircraft) {
        await tracker.processAircraftState(aircraftData);
      }
    } else {
      console.log('No aircraft data received (aircraft may not be transmitting)');
    }

  } catch (error) {
    console.error('Error in polling function:', error);
  }
}

// Initialize database and start server
async function startServer() {
  console.log('Starting Fleet Tracker...');

  // Initialize database
  await db.initializeDatabase();

  // Insert aircraft from config into database
  for (const aircraft of config.aircraft) {
    await db.upsertAircraft(aircraft.icao24, aircraft.registration, aircraft.type);
  }

  // Initialize active flights from database
  await tracker.initializeActiveFlights();

  // Start Express server
  app.listen(PORT, () => {
    console.log(`Fleet Tracker server running at http://localhost:${PORT}`);
    console.log(`Tracking ${config.aircraft.length} aircraft`);
    console.log(`Polling interval: ${config.opensky.pollInterval / 1000} seconds`);
  });

  // Start background polling
  const pollIntervalSeconds = config.opensky.pollInterval / 1000;
  console.log(`Starting background polling every ${pollIntervalSeconds} seconds`);

  // Do initial poll
  await pollFleetData();

  // Schedule regular polling
  setInterval(pollFleetData, config.opensky.pollInterval);

  // Schedule daily cleanup of old position data
  if (config.cleanup && config.cleanup.cleanupSchedule) {
    cron.schedule(config.cleanup.cleanupSchedule, () => {
      console.log('Running scheduled database cleanup...');
      db.cleanupOldPositions(config.cleanup.positionRetentionDays);
    });
  }
}

// Start the server
startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
