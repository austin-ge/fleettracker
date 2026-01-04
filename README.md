# Fleet Tracker

A real-time aircraft tracking web application using ADS-B data from OpenSky Network. Track your fleet's position, flight history, and statistics.

## Features

- **Live Map View**: Real-time aircraft positions on an interactive map
- **Flight Status Table**: Current status, altitude, speed for each aircraft
- **Flight History**: Track takeoffs, landings, and flight duration
- **Statistics**: Total flights, flight hours, distance traveled per aircraft
- **Automatic State Detection**: Detects takeoffs and landings automatically

## Prerequisites

- Node.js (v14 or higher)
- ICAO24 hex codes for your aircraft

## Getting Started

### 1. Configure Your Fleet

Edit `config.js` and replace the example aircraft with your actual aircraft:

```javascript
aircraft: [
  {
    icao24: 'your_icao24_here',  // Replace with actual ICAO24
    registration: 'N12345',
    type: 'Cessna 172'
  }
]
```

**Finding ICAO24 Codes:**
- US aircraft: https://registry.faa.gov/
- All aircraft: https://opensky-network.org/aircraft-database

### 2. (Optional) Add OpenSky Credentials

For higher rate limits (faster updates), create a free account at https://opensky-network.org/ and add your credentials to `config.js`:

```javascript
opensky: {
  username: 'your_username',
  password: 'your_password',
  pollInterval: 30000  // Can poll faster with authentication
}
```

**Without credentials:**
- 400 API credits/day
- Recommended poll interval: 60 seconds

**With credentials:**
- 4000+ API credits/day
- Can poll every 30 seconds

### 3. Start the Server

```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start
```

### 4. View Your Fleet

Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
fleettracker/
├── server.js              # Main Express server
├── config.js              # Configuration (aircraft list, API settings)
├── package.json
├── database/
│   ├── db.js             # Database functions
│   ├── schema.sql        # Database schema
│   └── fleet.db          # SQLite database (created automatically)
├── services/
│   ├── opensky.js        # OpenSky API client
│   └── tracker.js        # Flight tracking logic
└── public/
    ├── index.html        # Main UI
    ├── css/styles.css    # Styling
    └── js/
        ├── map.js        # Map visualization
        ├── table.js      # Status table
        └── stats.js      # Statistics display
```

## How It Works

1. **Background Polling**: Server polls OpenSky API every 60 seconds for your aircraft positions
2. **State Detection**: Tracker service detects takeoffs (ground → airborne) and landings (airborne → ground)
3. **Data Storage**: Position data and flight records stored in SQLite database
4. **Frontend Updates**: Browser fetches latest data every 10 seconds and updates the map and tables

## API Endpoints

- `GET /api/fleet/current` - Current state of all aircraft
- `GET /api/fleet/history?hours=24` - Recent position history
- `GET /api/flights/:icao24` - Flight history for specific aircraft
- `GET /api/statistics` - Aggregated statistics per aircraft

## Customization

### Change Map Center

Edit `public/js/map.js` line 7:

```javascript
map = L.map('map').setView([your_lat, your_lon], zoom_level);
```

### Adjust Polling Interval

Edit `config.js`:

```javascript
opensky: {
  pollInterval: 30000  // milliseconds (30 seconds)
}
```

### Change Database Retention

Edit `config.js`:

```javascript
cleanup: {
  positionRetentionDays: 30  // Keep 30 days of position history
}
```

## Troubleshooting

### No aircraft showing on map

1. Verify your ICAO24 codes are correct in `config.js`
2. Check that your aircraft are currently transmitting ADS-B
3. Look for errors in the server console

### Rate limit errors

- Reduce `pollInterval` in `config.js` (increase the number)
- Add OpenSky credentials for higher limits
- Check server console for rate limit messages

### Database errors

Delete the database and restart:
```bash
rm database/fleet.db
npm start
```

## Future Enhancements

- Email/SMS alerts for takeoffs and landings
- Flight playback feature
- Weather overlay
- Export flight logs to CSV
- WebSocket for real-time updates (instead of polling)

## Credits

- ADS-B data: [OpenSky Network](https://opensky-network.org/)
- Map tiles: [OpenStreetMap](https://www.openstreetmap.org/)
- Map library: [Leaflet](https://leafletjs.com/)

## License

ISC
