// Map and marker management
let map;
let aircraftMarkers = {};
let flightPaths = {};

// Initialize the map
function initMap() {
  // Create map centered on the US (adjust for your location)
  map = L.map('map').setView([39.8283, -98.5795], 4);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
  }).addTo(map);

  // Load initial data
  updateMap();

  console.log('Map initialized');
}

// Create custom aircraft icon
function createAircraftIcon(heading, isOnGround) {
  const color = isOnGround ? '#6c757d' : '#28a745';
  const rotation = heading || 0;

  return L.divIcon({
    html: `<i class="fas fa-plane" style="color: ${color}; font-size: 20px; transform: rotate(${rotation}deg);"></i>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    className: 'aircraft-icon'
  });
}

// Update map with current aircraft positions
async function updateMap() {
  try {
    const response = await fetch('/api/fleet/current');
    const aircraft = await response.json();

    // Update or create markers for each aircraft
    aircraft.forEach(ac => {
      if (ac.latitude && ac.longitude) {
        updateAircraftMarker(ac);
      }
    });

    // Update flight paths
    updateFlightPaths();

  } catch (error) {
    console.error('Error updating map:', error);
  }
}

// Update or create marker for an aircraft
function updateAircraftMarker(aircraft) {
  const { icao24, registration, latitude, longitude, altitude, velocity, heading, on_ground, last_updated } = aircraft;

  const position = [latitude, longitude];
  const isOnGround = on_ground === 1;

  // Create or update marker
  if (aircraftMarkers[icao24]) {
    // Update existing marker
    const marker = aircraftMarkers[icao24];
    marker.setLatLng(position);
    marker.setIcon(createAircraftIcon(heading, isOnGround));
    marker.setPopupContent(createPopupContent(aircraft));
  } else {
    // Create new marker
    const marker = L.marker(position, {
      icon: createAircraftIcon(heading, isOnGround)
    });

    marker.bindPopup(createPopupContent(aircraft));
    marker.addTo(map);

    aircraftMarkers[icao24] = marker;

    // Auto-fit map bounds if first aircraft
    if (Object.keys(aircraftMarkers).length === 1) {
      map.setView(position, 8);
    }
  }
}

// Create popup content for aircraft marker
function createPopupContent(aircraft) {
  const altitudeFt = aircraft.altitude ? Math.round(aircraft.altitude * 3.28084) : 'N/A';
  const speedKts = aircraft.velocity ? Math.round(aircraft.velocity * 1.94384) : 'N/A';
  const status = aircraft.on_ground === 1 ? 'On Ground' : 'Airborne';
  const lastUpdate = aircraft.last_updated ? new Date(aircraft.last_updated * 1000).toLocaleTimeString() : 'N/A';

  return `
    <div class="aircraft-popup">
      <h3>${aircraft.registration || aircraft.icao24}</h3>
      <p><strong>Type:</strong> ${aircraft.aircraft_type || 'Unknown'}</p>
      <p><strong>Status:</strong> <span class="${aircraft.on_ground === 1 ? 'status-ground' : 'status-airborne'}">${status}</span></p>
      <p><strong>Altitude:</strong> ${altitudeFt} ft</p>
      <p><strong>Speed:</strong> ${speedKts} kts</p>
      <p><strong>Heading:</strong> ${aircraft.heading ? Math.round(aircraft.heading) + '°' : 'N/A'}</p>
      <p><strong>Last Update:</strong> ${lastUpdate}</p>
    </div>
  `;
}

// Update flight paths (trails showing recent positions)
async function updateFlightPaths() {
  try {
    const response = await fetch('/api/fleet/history?hours=2');
    const positions = await response.json();

    // Group positions by aircraft
    const positionsByAircraft = {};

    positions.forEach(pos => {
      if (!positionsByAircraft[pos.icao24]) {
        positionsByAircraft[pos.icao24] = [];
      }
      positionsByAircraft[pos.icao24].push(pos);
    });

    // Draw or update flight paths
    Object.keys(positionsByAircraft).forEach(icao24 => {
      const aircraftPositions = positionsByAircraft[icao24];

      // Convert to lat/lng array
      const latLngs = aircraftPositions
        .filter(pos => pos.latitude && pos.longitude)
        .map(pos => [pos.latitude, pos.longitude]);

      if (latLngs.length < 2) return;

      // Remove old path if exists
      if (flightPaths[icao24]) {
        map.removeLayer(flightPaths[icao24]);
      }

      // Create new path
      const path = L.polyline(latLngs, {
        color: '#007bff',
        weight: 2,
        opacity: 0.6
      });

      path.addTo(map);
      flightPaths[icao24] = path;
    });

  } catch (error) {
    console.error('Error updating flight paths:', error);
  }
}
