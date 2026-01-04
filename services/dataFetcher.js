// Hybrid data fetcher - tries local dump1090-fa first, falls back to OpenSky

const OpenSkyClient = require('./opensky');

class DataFetcher {
  constructor(config) {
    this.config = config;
    this.openskyClient = new OpenSkyClient(
      config.opensky.credentialsFile
    );
  }

  /**
   * Fetch fleet data from all available sources
   * Priority: dump1090-fa (if configured) -> OpenSky (fallback)
   */
  async fetchFleetData(icao24Array) {
    const results = new Map(); // Map of icao24 -> aircraft data
    const missingAircraft = [...icao24Array]; // Track which aircraft we still need
    let localCount = 0;
    let openskyCount = 0;

    // Try local dump1090-fa first if configured
    if (this.config.dump1090 && this.config.dump1090.enabled) {
      console.log('Fetching from local dump1090-fa...');
      const localData = await this.fetchFromDump1090(icao24Array);

      if (localData.aircraft && localData.aircraft.length > 0) {
        console.log(`Found ${localData.aircraft.length} aircraft on local receiver`);
        localData.aircraft.forEach(aircraft => {
          results.set(aircraft.icao24, aircraft);
          localCount++;
          // Remove from missing list
          const index = missingAircraft.indexOf(aircraft.icao24);
          if (index > -1) {
            missingAircraft.splice(index, 1);
          }
        });
      }
    }

    // Fallback to OpenSky for any aircraft not found locally
    if (missingAircraft.length > 0) {
      console.log(`Fetching ${missingAircraft.length} aircraft from OpenSky API...`);
      const openskyData = await this.openskyClient.fetchFleetStates(missingAircraft);

      if (openskyData.aircraft && openskyData.aircraft.length > 0) {
        console.log(`Found ${openskyData.aircraft.length} aircraft on OpenSky`);
        openskyData.aircraft.forEach(aircraft => {
          results.set(aircraft.icao24, aircraft);
          openskyCount++;
        });
      }

      // Handle OpenSky errors
      if (openskyData.error) {
        return { error: openskyData.error, aircraft: Array.from(results.values()), sources: { local: localCount, opensky: openskyCount } };
      }
    }

    return {
      aircraft: Array.from(results.values()),
      sources: {
        local: localCount,
        opensky: openskyCount
      }
    };
  }

  /**
   * Fetch data from local dump1090-fa/tar1090 instance
   */
  async fetchFromDump1090(icao24Array) {
    try {
      const url = this.config.dump1090.url;
      const response = await fetch(url, {
        timeout: 5000 // 5 second timeout for local receiver
      });

      if (!response.ok) {
        console.warn(`dump1090-fa returned ${response.status}, falling back to OpenSky`);
        return { aircraft: [] };
      }

      const data = await response.json();

      // Filter for our fleet only
      const icao24Set = new Set(icao24Array.map(i => i.toLowerCase()));
      const fleetAircraft = data.aircraft
        .filter(ac => icao24Set.has(ac.hex.toLowerCase()))
        .map(ac => this.parseDump1090Aircraft(ac, data.now));

      return { aircraft: fleetAircraft };

    } catch (error) {
      console.warn(`Error fetching from dump1090-fa: ${error.message}, using OpenSky only`);
      return { aircraft: [] };
    }
  }

  /**
   * Convert dump1090-fa aircraft format to our standard format
   * dump1090-fa uses: feet, knots, different field names
   */
  parseDump1090Aircraft(aircraft, timestamp) {
    // Convert units and field names
    // dump1090-fa: altitude in feet, speed in knots
    // Our format (from OpenSky): altitude in meters, velocity in m/s

    const altitudeMeters = aircraft.altitude !== undefined
      ? aircraft.altitude * 0.3048  // feet to meters
      : null;

    const velocityMs = aircraft.speed !== undefined
      ? aircraft.speed * 0.514444  // knots to m/s
      : null;

    // Infer on_ground status from altitude and speed
    // dump1090-fa doesn't always provide explicit on_ground field
    let onGround = aircraft.alt_baro === 'ground';
    if (onGround === false && altitudeMeters !== null && altitudeMeters < 50 && velocityMs !== null && velocityMs < 15) {
      onGround = true; // Likely on ground
    }

    return {
      icao24: aircraft.hex.toLowerCase(),
      callsign: aircraft.flight ? aircraft.flight.trim() : null,
      originCountry: null, // Not available in dump1090-fa
      timePosition: timestamp || Math.floor(Date.now() / 1000),
      lastContact: timestamp || Math.floor(Date.now() / 1000),
      longitude: aircraft.lon || null,
      latitude: aircraft.lat || null,
      altitude: altitudeMeters,
      onGround: onGround,
      velocity: velocityMs,
      heading: aircraft.track || null, // track is heading in dump1090-fa
      verticalRate: aircraft.vert_rate !== undefined
        ? aircraft.vert_rate * 0.00508  // feet/min to m/s
        : null,
      geoAltitude: null,
      squawk: aircraft.squawk || null,
      category: aircraft.category || null,
      source: 'dump1090-fa' // Track data source
    };
  }
}

module.exports = DataFetcher;
