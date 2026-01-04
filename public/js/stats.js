// Statistics display management

function initStatistics() {
  updateStatistics();
  console.log('Statistics initialized');
}

async function updateStatistics() {
  try {
    const response = await fetch('/api/statistics');
    const stats = await response.json();

    const container = document.getElementById('statistics-container');

    if (stats.length === 0) {
      container.innerHTML = '<p class="no-data">No statistics available yet</p>';
      return;
    }

    // Build statistics display
    let html = '';

    stats.forEach(aircraft => {
      const registration = aircraft.registration || aircraft.icao24;
      const totalFlights = aircraft.total_flights || 0;
      const totalHours = aircraft.total_flight_seconds ? (aircraft.total_flight_seconds / 3600).toFixed(1) : '0.0';
      const totalDistance = aircraft.total_distance_km ? aircraft.total_distance_km.toFixed(1) : '0.0';
      const avgFlightTime = aircraft.avg_flight_seconds ? (aircraft.avg_flight_seconds / 60).toFixed(0) : '0';
      const maxAltitudeFt = aircraft.max_altitude_ever ? Math.round(aircraft.max_altitude_ever * 3.28084).toLocaleString() : 'N/A';

      html += `
        <div class="aircraft-stats">
          <h3>${registration}</h3>
          ${aircraft.aircraft_type ? `<p class="aircraft-type">${aircraft.aircraft_type}</p>` : ''}

          <div class="stat-grid">
            <div class="stat-item">
              <i class="fas fa-plane-departure"></i>
              <div class="stat-value">${totalFlights}</div>
              <div class="stat-label">Total Flights</div>
            </div>

            <div class="stat-item">
              <i class="fas fa-clock"></i>
              <div class="stat-value">${totalHours} hrs</div>
              <div class="stat-label">Flight Time</div>
            </div>

            <div class="stat-item">
              <i class="fas fa-route"></i>
              <div class="stat-value">${totalDistance} km</div>
              <div class="stat-label">Distance</div>
            </div>

            <div class="stat-item">
              <i class="fas fa-arrows-alt-v"></i>
              <div class="stat-value">${maxAltitudeFt} ft</div>
              <div class="stat-label">Max Altitude</div>
            </div>

            <div class="stat-item">
              <i class="fas fa-stopwatch"></i>
              <div class="stat-value">${avgFlightTime} min</div>
              <div class="stat-label">Avg Flight</div>
            </div>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;

  } catch (error) {
    console.error('Error updating statistics:', error);
    const container = document.getElementById('statistics-container');
    container.innerHTML = '<p class="error">Error loading statistics</p>';
  }
}
