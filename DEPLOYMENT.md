# Deployment Guide - Dockploy (Hostinger VPS)

This guide explains how to deploy Fleet Tracker to your Hostinger VPS using Dockploy.

## Prerequisites

- Hostinger VPS with Dockploy installed
- GitHub repository with this codebase
- OpenSky Network API credentials (optional but recommended for better rate limits)

## Deployment Steps

### 1. Prepare Your Repository

Ensure all Docker files are committed to your GitHub repository:
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`

```bash
git add Dockerfile .dockerignore docker-compose.yml DEPLOYMENT.md
git commit -m "Add Docker configuration for Dockploy deployment"
git push origin main
```

### 2. Configure Dockploy

1. Access your Dockploy dashboard at your VPS domain (e.g., `https://your-vps-domain.com`)
2. Click "Create New Application"
3. Choose "Git Repository" as the source
4. Connect your GitHub repository

### 3. Application Configuration

**Build Settings:**
- **Build Method**: Docker
- **Dockerfile Path**: `./Dockerfile`
- **Build Context**: `/` (root of repository)

**Port Configuration:**
- **Container Port**: 3000
- **Public Port**: 80 (or 443 if using HTTPS)

**Volume Mounts** (Important for data persistence):
Add the following volume to persist your SQLite database:
- **Host Path**: `/var/lib/dockploy/volumes/fleettracker/database`
- **Container Path**: `/app/database`

### 4. Environment Variables & Secrets

You have two options for handling OpenSky credentials:

#### Option A: Environment Variables (Recommended for Dockploy)
Add these environment variables in Dockploy:
```
OPENSKY_USERNAME=your_opensky_username
OPENSKY_PASSWORD=your_opensky_password
```

Then modify `config.js` to read from environment variables:
```javascript
opensky: {
  username: process.env.OPENSKY_USERNAME || '',
  password: process.env.OPENSKY_PASSWORD || '',
  pollInterval: 30000
}
```

#### Option B: Credentials File
If you prefer to use `credentials.json`:
1. Create the file on your VPS at `/var/lib/dockploy/volumes/fleettracker/credentials.json`
2. Add volume mount in Dockploy:
   - **Host Path**: `/var/lib/dockploy/volumes/fleettracker/credentials.json`
   - **Container Path**: `/app/credentials.json`
   - **Read Only**: Yes

### 5. Health Check Configuration

Dockploy should automatically detect the health check from the Dockerfile:
- **Endpoint**: `/api/fleet/current`
- **Interval**: 30 seconds
- **Timeout**: 3 seconds

### 6. Deploy

1. Click "Deploy" in Dockploy
2. Monitor the build logs
3. Once deployed, the application will be available at your configured domain/port

### 7. Post-Deployment Verification

Test your deployment:
```bash
# Check if the API is responding
curl http://your-vps-domain.com/api/fleet/current

# Check health status
curl http://your-vps-domain.com/api/fleet/current
```

Open your browser and navigate to your VPS domain to see the map interface.

## Configuration Notes

### Aircraft Configuration

Edit `config.js` to add/modify aircraft you want to track:
```javascript
aircraft: [
  {
    icao24: 'a93270',
    registration: 'N692DA',
    type: 'DeHavilland DHC-6-200 Twin Otter'
  }
]
```

After modifying aircraft, redeploy the application in Dockploy.

### Dump1090 Integration

If you have a local dump1090-fa receiver, update `config.js`:
```javascript
dump1090: {
  enabled: true,
  url: 'http://your-dump1090-ip/dump1090/data/aircraft.json'
}
```

Note: Your VPS will need network access to your dump1090 instance.

### Polling Interval

Default is 30 seconds (with authentication). Adjust in `config.js` if needed:
```javascript
opensky: {
  pollInterval: 60000  // 60 seconds
}
```

## Troubleshooting

### Container Fails to Start

Check logs in Dockploy dashboard. Common issues:
- Missing environment variables
- Database permissions issues
- Port conflicts

### Database Not Persisting

Ensure volume mount is correctly configured:
- Host path exists and is writable
- Container path is `/app/database`
- Check file permissions on host

### No Aircraft Data

- Verify ICAO24 codes are correct in `config.js`
- Check OpenSky API credentials are valid
- Ensure aircraft are currently transmitting ADS-B
- Check rate limit errors in application logs

### Build Failures

If you encounter `better-sqlite3` build errors:
- Dockerfile includes required build dependencies (python3, make, g++)
- Using Node 18 Alpine image which is compatible
- Try clearing Dockploy build cache and rebuilding

## Updating the Application

To update your deployment:

1. Make changes to your code locally
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```
3. In Dockploy, click "Rebuild" or enable auto-deploy on push

## Backup Considerations

The SQLite database is stored in `/var/lib/dockploy/volumes/fleettracker/database/`.

To backup:
```bash
# SSH into your VPS
cp /var/lib/dockploy/volumes/fleettracker/database/fleet.db ~/backups/
```

Consider setting up automated backups using cron.

## Resource Requirements

**Minimum Requirements:**
- CPU: 1 core
- RAM: 512MB
- Storage: 2GB (includes Docker image + database growth)

**Recommended:**
- CPU: 2 cores
- RAM: 1GB
- Storage: 5GB

Database grows approximately 10-50MB per month depending on polling frequency and number of aircraft.

## Security Recommendations

1. **Use HTTPS**: Configure SSL certificate in Dockploy for secure access
2. **Firewall**: Only expose ports 80/443, keep 3000 internal
3. **Credentials**: Use environment variables, never commit `credentials.json` to git
4. **Updates**: Keep Dockploy and base images updated regularly

## Alternative: Using Compose File

If Dockploy supports docker-compose deployment:

1. Select "Docker Compose" as build method
2. Point to `docker-compose.yml`
3. Dockploy will handle the rest

This method may be simpler but check Dockploy documentation for compose support.
