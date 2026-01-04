// Flight status table management

function initStatusTable() {
  updateStatusTable();
  console.log('Status table initialized');
}

async function updateStatusTable() {
  try {
    const response = await fetch('/api/fleet/current');
    const aircraft = await response.json();

    const tbody = document.getElementById('status-table-body');

    if (aircraft.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="no-data">No aircraft data available</td></tr>';
      return;
    }

    // Build table rows
    const rows = aircraft.map(ac => {
      const registration = ac.registration || ac.icao24;
      const status = ac.on_ground === 1 ? 'On Ground' : ac.on_ground === 0 ? 'Airborne' : 'Unknown';
      const statusClass = ac.on_ground === 1 ? 'status-ground' : ac.on_ground === 0 ? 'status-airborne' : 'status-unknown';

      // Convert altitude from meters to feet
      const altitudeFt = ac.altitude !== null ? Math.round(ac.altitude * 3.28084).toLocaleString() + ' ft' : 'N/A';

      // Convert velocity from m/s to knots
      const speedKts = ac.velocity !== null ? Math.round(ac.velocity * 1.94384) + ' kts' : 'N/A';

      // Format last update time
      let lastUpdate = 'Never';
      if (ac.last_updated) {
        const updateTime = new Date(ac.last_updated * 1000);
        const now = new Date();
        const diffMinutes = Math.floor((now - updateTime) / 60000);

        if (diffMinutes < 1) {
          lastUpdate = 'Just now';
        } else if (diffMinutes < 60) {
          lastUpdate = `${diffMinutes} min ago`;
        } else {
          lastUpdate = updateTime.toLocaleTimeString();
        }
      }

      return `
        <tr>
          <td>
            <strong>${registration}</strong>
            ${ac.aircraft_type ? `<br><small>${ac.aircraft_type}</small>` : ''}
          </td>
          <td>
            <span class="status-badge ${statusClass}">${status}</span>
          </td>
          <td>${altitudeFt}</td>
          <td>${speedKts}</td>
          <td>${lastUpdate}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;

  } catch (error) {
    console.error('Error updating status table:', error);
    const tbody = document.getElementById('status-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="error">Error loading data</td></tr>';
  }
}
