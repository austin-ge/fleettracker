// Using Node.js built-in fetch (available in Node 18+)
const fs = require('fs');
const path = require('path');

class OpenSkyClient {
  constructor(credentialsPath = null) {
    this.baseUrl = 'https://opensky-network.org/api';
    this.authUrl = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';
    this.credentials = null;
    this.accessToken = null;
    this.tokenExpiry = null;

    // Try environment variables first (recommended for production)
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      this.credentials = {
        clientId: process.env.OPENSKY_CLIENT_ID,
        clientSecret: process.env.OPENSKY_CLIENT_SECRET
      };
      console.log('OpenSky OAuth credentials loaded from environment variables');
    }
    // Fallback to credentials file if provided
    else if (credentialsPath) {
      try {
        const fullPath = path.resolve(credentialsPath);
        const credData = fs.readFileSync(fullPath, 'utf8');
        this.credentials = JSON.parse(credData);
        console.log('OpenSky OAuth credentials loaded from file');
      } catch (error) {
        console.warn(`Could not load OpenSky credentials: ${error.message}`);
      }
    }
  }

  /**
   * Get OAuth2 access token (cached, refreshes when expired)
   */
  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Request new token
    if (!this.credentials || !this.credentials.clientId || !this.credentials.clientSecret) {
      console.warn('No OAuth credentials available, using anonymous access');
      return null;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.credentials.clientId,
        client_secret: this.credentials.clientSecret
      });

      const response = await fetch(this.authUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
      });

      if (!response.ok) {
        console.error(`OAuth token request failed: ${response.status} ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      // Tokens expire in 30 minutes, refresh 5 minutes early
      this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

      console.log('OpenSky access token obtained');
      return this.accessToken;

    } catch (error) {
      console.error('Error getting OAuth token:', error.message);
      return null;
    }
  }

  async fetchFleetStates(icao24Array) {
    try {
      // Build query string with multiple icao24 parameters
      const params = icao24Array.map(icao => `icao24=${icao.toLowerCase()}`).join('&');
      const url = `${this.baseUrl}/states/all?${params}`;

      // Prepare headers
      const headers = {};

      // Get OAuth2 access token
      const token = await this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Make API request
      const response = await fetch(url, { headers });

      // Check rate limiting
      const rateLimit = response.headers.get('X-Rate-Limit-Remaining');
      const retryAfter = response.headers.get('X-Rate-Limit-Retry-After-Seconds');

      if (rateLimit) {
        console.log(`OpenSky API rate limit remaining: ${rateLimit}`);
      }

      // Handle rate limiting
      if (response.status === 429) {
        console.error(`Rate limited! Retry after ${retryAfter} seconds`);
        return { error: 'rate_limit', retryAfter: parseInt(retryAfter) };
      }

      // Handle other errors
      if (!response.ok) {
        console.error(`OpenSky API error: ${response.status} ${response.statusText}`);
        return { error: 'api_error', status: response.status };
      }

      // Parse response
      const data = await response.json();

      // OpenSky response format:
      // {
      //   time: unix timestamp,
      //   states: array of state vectors (or null if no data)
      // }

      if (!data.states) {
        console.log('No aircraft states received from OpenSky');
        return { time: data.time, aircraft: [] };
      }

      // Parse state vectors into clean objects
      const aircraft = data.states.map(state => this.parseStateVector(state));

      return {
        time: data.time,
        aircraft: aircraft
      };

    } catch (error) {
      console.error('Error fetching OpenSky data:', error.message);
      return { error: 'network_error', message: error.message };
    }
  }

  parseStateVector(state) {
    // State vector format (18 fields):
    // [0] icao24 (string)
    // [1] callsign (string, can be null)
    // [2] origin_country (string)
    // [3] time_position (int, seconds since epoch)
    // [4] last_contact (int, seconds since epoch)
    // [5] longitude (float, can be null)
    // [6] latitude (float, can be null)
    // [7] baro_altitude (float, meters, can be null)
    // [8] on_ground (boolean)
    // [9] velocity (float, m/s, can be null)
    // [10] true_track (float, degrees, can be null)
    // [11] vertical_rate (float, m/s, can be null)
    // [12] sensors (array of ints, can be null)
    // [13] geo_altitude (float, meters, can be null)
    // [14] squawk (string, can be null)
    // [15] spi (boolean)
    // [16] position_source (int)
    // [17] category (int, can be null)

    return {
      icao24: state[0],
      callsign: state[1] ? state[1].trim() : null,
      originCountry: state[2],
      timePosition: state[3],
      lastContact: state[4],
      longitude: state[5],
      latitude: state[6],
      altitude: state[7], // meters
      onGround: state[8],
      velocity: state[9], // m/s
      heading: state[10], // degrees
      verticalRate: state[11], // m/s
      geoAltitude: state[13],
      squawk: state[14],
      category: state[17]
    };
  }

  async fetchAircraftFlights(icao24, beginTimestamp, endTimestamp) {
    try {
      const url = `${this.baseUrl}/flights/aircraft?icao24=${icao24.toLowerCase()}&begin=${beginTimestamp}&end=${endTimestamp}`;

      const headers = {};
      const token = await this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        console.error(`OpenSky flights API error: ${response.status}`);
        return { error: 'api_error', status: response.status };
      }

      const flights = await response.json();
      return flights;

    } catch (error) {
      console.error('Error fetching flight history:', error.message);
      return { error: 'network_error', message: error.message };
    }
  }
}

module.exports = OpenSkyClient;
