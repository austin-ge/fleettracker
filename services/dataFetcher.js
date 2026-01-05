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
   * Priority: dump1090-fa (if configured) -> adsb.lol -> OpenSky (fallback)
   */
  async fetchFleetData(icao24Array) {
    const results = new Map(); // Map of icao24 -> aircraft data
    const missingAircraft = [...icao24Array]; // Track which aircraft we still need
    let localCount = 0;
    let adsbLolCount = 0;
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

    // Try adsb.lol for any aircraft not found locally
    if (missingAircraft.length > 0 && this.config.adsbLol && this.config.adsbLol.enabled) {
      console.log(`Fetching ${missingAircraft.length} aircraft from adsb.lol API...`);
      const adsbLolData = await this.fetchFromAdsbLol(missingAircraft);

      if (adsbLolData.aircraft && adsbLolData.aircraft.length > 0) {
        console.log(`Found ${adsbLolData.aircraft.length} aircraft on adsb.lol`);
        adsbLolData.aircraft.forEach(aircraft => {
          results.set(aircraft.icao24, aircraft);
          adsbLolCount++;
          // Remove from missing list
          const index = missingAircraft.indexOf(aircraft.icao24);
          if (index > -1) {
            missingAircraft.splice(index, 1);
          }
        });
      }
    }

    // Fallback to OpenSky for any aircraft still not found
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
        return { error: openskyData.error, aircraft: Array.from(results.values()), sources: { local: localCount, adsbLol: adsbLolCount, opensky: openskyCount } };
      }
    }

    return {
      aircraft: Array.from(results.values()),
      sources: {
        local: localCount,
        adsbLol: adsbLolCount,
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

  /**
   * Fetch data from adsb.lol API
   * API docs: https://api.adsb.lol/docs
   */
  async fetchFromAdsbLol(icao24Array) {
    try {
      const baseUrl = this.config.adsbLol.baseUrl;
      const aircraft = [];

      // adsb.lol API requires individual requests per aircraft
      // /v2/hex/{icao24} endpoint
      const fetchPromises = icao24Array.map(async (icao24) => {
        try {
          const url = `${baseUrl}/hex/${icao24.toLowerCase()}`;
          const response = await fetch(url, {
            timeout: 5000,
            headers: {
              'User-Agent': 'FleetTracker/1.0'
            }
          });

          if (!response.ok) {
            // 404 is normal - aircraft not currently tracked
            if (response.status === 404) {
              return null;
            }
            console.warn(`adsb.lol returned ${response.status} for ${icao24}`);
            return null;
          }

          const data = await response.json();

          // adsb.lol returns aircraft data directly
          if (data && data.hex) {
            return this.parseAdsbLolAircraft(data);
          }
          return null;

        } catch (error) {
          console.warn(`Error fetching ${icao24} from adsb.lol: ${error.message}`);
          return null;
        }
      });

      // Wait for all requests to complete
      const results = await Promise.all(fetchPromises);

      // Filter out null results
      const foundAircraft = results.filter(ac => ac !== null);

      return { aircraft: foundAircraft };

    } catch (error) {
      console.warn(`Error fetching from adsb.lol: ${error.message}`);
      return { aircraft: [] };
    }
  }

  /**
   * Convert adsb.lol aircraft format to our standard format
   * adsb.lol uses similar format to dump1090 but with some differences
   */
  parseAdsbLolAircraft(data) {
    // adsb.lol provides data in similar format to readsb/dump1090
    // Altitude: feet, speed: knots, positions: decimal degrees

    const altitudeMeters = data.alt_baro !== undefined && data.alt_baro !== 'ground'
      ? data.alt_baro * 0.3048  // feet to meters
      : null;

    const velocityMs = data.gs !== undefined
      ? data.gs * 0.514444  // knots to m/s
      : null;

    // Check on_ground status
    let onGround = data.alt_baro === 'ground';
    if (!onGround && altitudeMeters !== null && altitudeMeters < 50 && velocityMs !== null && velocityMs < 15) {
      onGround = true;
    }

    // adsb.lol provides 'now' timestamp
    const timestamp = data.seen_pos !== undefined
      ? Math.floor(Date.now() / 1000) - data.seen_pos  // seen_pos is seconds ago
      : Math.floor(Date.now() / 1000);

    return {
      icao24: data.hex.toLowerCase(),
      callsign: data.flight ? data.flight.trim() : null,
      originCountry: data.flag || null,
      timePosition: timestamp,
      lastContact: timestamp,
      longitude: data.lon || null,
      latitude: data.lat || null,
      altitude: altitudeMeters,
      onGround: onGround,
      velocity: velocityMs,
      heading: data.track || null,
      verticalRate: data.baro_rate !== undefined
        ? data.baro_rate * 0.00508  // feet/min to m/s
        : null,
      geoAltitude: data.alt_geom !== undefined && data.alt_geom !== 'ground'
        ? data.alt_geom * 0.3048  // feet to meters
        : null,
      squawk: data.squawk || null,
      category: data.category || null,
      source: 'adsb.lol' // Track data source
    };
  }
}

module.exports = DataFetcher;
