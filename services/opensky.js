// Using Node.js built-in fetch (available in Node 18+)

class OpenSkyClient {
  constructor(username = null, password = null) {
    this.baseUrl = 'https://opensky-network.org/api';
    this.username = username;
    this.password = password;
  }

  async fetchFleetStates(icao24Array) {
    try {
      // Build query string with multiple icao24 parameters
      const params = icao24Array.map(icao => `icao24=${icao.toLowerCase()}`).join('&');
      const url = `${this.baseUrl}/states/all?${params}`;

      // Prepare headers
      const headers = {};

      // Add authentication if credentials provided
      if (this.username && this.password) {
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
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
      if (this.username && this.password) {
        const auth = Buffer.from(`${this.username}:${this.password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
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
