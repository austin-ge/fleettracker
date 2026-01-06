const express = require('express');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cron = require('node-cron');
const config = require('./config');
const db = require('./database/db');
const DataFetcher = require('./services/dataFetcher');
const tracker = require('./services/tracker');
const { requireAuth, loadUser, redirectIfAuthenticated } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const aircraftRoutes = require('./routes/aircraft');

// Initialize Express app
const app = express();
const PORT = config.server.port;

// Initialize hybrid data fetcher (dump1090 + OpenSky)
const dataFetcher = new DataFetcher(config);

// Trust proxy - required for secure cookies behind Traefik
app.set('trust proxy', 1);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware with PostgreSQL store
app.use(session({
  store: new pgSession({
    pool: db.pool,
    tableName: 'sessions',
    createTableIfMissing: false // We create it in schema.sql
  }),
  secret: config.auth.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: config.auth.sessionMaxAge,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

// Load user data into request if authenticated
app.use(loadUser);

// Mount authentication routes
app.use('/api/auth', authRoutes);

// Mount user aircraft routes
app.use('/api/user', aircraftRoutes);

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route - redirect to login page
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    res.redirect('/dashboard.html');
  } else {
    res.redirect('/login.html');
  }
});

// API Endpoints (Protected - require authentication)

// Get current state of user's aircraft
app.get('/api/fleet/current', requireAuth, async (req, res) => {
  try {
    const currentStates = await db.getUserCurrentStates(req.session.userId);
    res.json(currentStates);
  } catch (error) {
    console.error('Error fetching current states:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent position history for map trails (user's aircraft only)
app.get('/api/fleet/history', requireAuth, async (req, res) => {
  try {
    const hours = parseInt(req.query.hours) || 24;
    const userAircraft = await db.getUserAircraft(req.session.userId);
    const icao24Array = userAircraft.map(a => a.icao24);

    // Get positions for user's aircraft only
    const positions = await db.getRecentPositions(hours);
    const filteredPositions = positions.filter(p => icao24Array.includes(p.icao24));

    res.json(filteredPositions);
  } catch (error) {
    console.error('Error fetching position history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get flight history for a specific aircraft (if user tracks it)
app.get('/api/flights/:icao24', requireAuth, async (req, res) => {
  try {
    const icao24 = req.params.icao24.toLowerCase();

    // Verify user tracks this aircraft
    const userAircraft = await db.getUserAircraft(req.session.userId);
    const hasAccess = userAircraft.some(a => a.icao24 === icao24);

    if (!hasAccess) {
      return res.status(403).json({ error: 'You do not track this aircraft' });
    }

    const limit = parseInt(req.query.limit) || 50;
    const flights = await db.getFlightHistory(icao24, limit);
    res.json(flights);
  } catch (error) {
    console.error('Error fetching flight history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics for user's aircraft
app.get('/api/statistics', requireAuth, async (req, res) => {
  try {
    const userAircraft = await db.getUserAircraft(req.session.userId);
    const icao24Array = userAircraft.map(a => a.icao24);

    // Get all stats and filter to user's aircraft
    const allStats = await db.getStatistics();
    const userStats = allStats.filter(s => icao24Array.includes(s.icao24));

    res.json(userStats);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Background polling function
async function pollFleetData() {
  console.log('Polling for fleet data...');

  try {
    // Get all unique aircraft tracked by any user
    const icao24Array = await db.getAllTrackedAircraft();

    if (icao24Array.length === 0) {
      console.log('No aircraft being tracked by any user');
      return;
    }

    // Fetch data from hybrid sources (dump1090 + adsb.lol + OpenSky fallback)
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

  // Initialize active flights from database
  await tracker.initializeActiveFlights();

  // Get count of tracked aircraft
  const trackedAircraft = await db.getAllTrackedAircraft();

  // Start Express server
  app.listen(PORT, () => {
    console.log(`Fleet Tracker server running at http://localhost:${PORT}`);
    console.log(`Tracking ${trackedAircraft.length} aircraft across all users`);
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
