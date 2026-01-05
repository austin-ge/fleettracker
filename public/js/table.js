// Flight status table management

function initStatusTable() {
  updateStatusTable();
  console.log('Status table initialized');
}

// Calculate staleness for table display
function getStalenessBadge(lastUpdated) {
  if (!lastUpdated) return '<span class="staleness-badge staleness-unknown">Unknown</span>';

  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - lastUpdated;
  const ageMinutes = ageSeconds / 60;

  if (ageMinutes < 5) return '<span class="staleness-badge staleness-active">Live</span>';
  if (ageMinutes < 60) return '<span class="staleness-badge staleness-recent">Recent</span>';
  if (ageMinutes < 1440) return '<span class="staleness-badge staleness-stale">Stale</span>';
  return '<span class="staleness-badge staleness-very-stale">Old</span>';
}

async function updateStatusTable() {
  try {
    const response = await fetch('/api/fleet/current');
    const aircraft = await response.json();

    const tbody = document.getElementById('status-table-body');

    if (aircraft.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="no-data">No aircraft data available</td></tr>';
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
        } else if (diffMinutes < 1440) {
          lastUpdate = `${Math.floor(diffMinutes / 60)} hours ago`;
        } else {
          lastUpdate = `${Math.floor(diffMinutes / 1440)} days ago`;
        }
      }

      const stalenessBadge = getStalenessBadge(ac.last_updated);

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
          <td>${stalenessBadge}</td>
        </tr>
      `;
    }).join('');

    tbody.innerHTML = rows;

  } catch (error) {
    console.error('Error updating status table:', error);
    const tbody = document.getElementById('status-table-body');
    tbody.innerHTML = '<tr><td colspan="6" class="error">Error loading data</td></tr>';
  }
}
