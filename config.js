// Fleet Tracker Configuration

module.exports = {
  // Your aircraft fleet
  // IMPORTANT: Replace these with your actual aircraft ICAO24 hex codes
  // You can look up ICAO24 codes at:
  // - US aircraft (N-numbers): https://registry.faa.gov/
  // - All aircraft: https://opensky-network.org/aircraft-database
  aircraft: [
    {
      icao24: 'a93270',
      registration: 'N692DA',
      type: 'DeHavilland DHC-6-200 Twin Otter'
    },
    {
      icao24: 'a939de',
      registration: 'N694DA',
      type: 'Cessna 208B Grand Caravan'
    },
    {
      icao24: 'a948ba',
      registration: 'N698DA',
      type: 'Quest Kodiak 100'
    }
    // N693DA (Cessna 182M) - ICAO24 code not found yet
    // You can add it here once you find the hex code
  ],

  // Local dump1090-fa receiver (primary source)
  dump1090: {
    enabled: true,
    url: 'http://100.92.158.48/dump1090/data/aircraft.json'
  },

  // adsb.lol API (secondary fallback - free, community-run)
  adsbLol: {
    enabled: true,
    baseUrl: 'https://api.adsb.lol/v2'
  },

  // OpenSky Network API settings (tertiary fallback for out-of-range aircraft)
  opensky: {
    // OAuth credentials (new API format)
    // Load from credentials.json
    credentialsFile: './credentials.json',

    // Poll interval in milliseconds
    // With authentication: can poll every 30 seconds
    pollInterval: 30000
  },

  // Authentication settings
  auth: {
    // Session secret - MUST be set via environment variable in production
    sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production-please',
    // Session max age: 7 days
    sessionMaxAge: 7 * 24 * 60 * 60 * 1000,
    // bcrypt rounds for password hashing
    bcryptRounds: 10
  },

  // Server settings
  server: {
    port: 3000
  },

  // Database cleanup settings
  cleanup: {
    // How many days of position history to keep
    positionRetentionDays: 30,
    // Run cleanup daily at midnight
    cleanupSchedule: '0 0 * * *'  // cron format
  }
};
