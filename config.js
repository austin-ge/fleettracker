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

  // OpenSky Network API settings
  opensky: {
    // Optional: Add your OpenSky credentials for higher rate limits
    // Create account at: https://opensky-network.org/
    username: null,  // Set to your username or leave null for anonymous
    password: null,  // Set to your password or leave null for anonymous

    // Poll interval in milliseconds
    // Anonymous: use 60000 (60 seconds) to stay within rate limits
    // Authenticated: can use 30000 (30 seconds) or faster
    pollInterval: 60000
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
