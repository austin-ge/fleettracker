# Deployment Guide - Dokploy (Hostinger VPS)

This guide explains how to deploy Fleet Tracker to your Hostinger VPS using Dokploy.

## Prerequisites

- Hostinger VPS with Dokploy installed (minimum 2GB RAM, 30GB disk)
- GitHub repository with this codebase
- OpenSky Network API credentials (optional but recommended for better rate limits)

## Deployment Options

Dokploy offers two deployment approaches:

### Option A: Build on Server (Simpler, but resource-intensive)
The server builds your Docker image directly. Can cause timeout/freezing on small VPS.

### Option B: CI/CD Build (Recommended for production)
Use GitHub Actions to build and push images to Docker Hub. Server only pulls and runs.

**This guide covers Option A first (simpler for getting started).**

---

## Option A: Direct Build Deployment

### Step 1: Connect GitHub to Dokploy

1. **Access Dokploy Dashboard**: Navigate to your VPS Dokploy panel (e.g., `https://your-vps-domain.com`)

2. **Connect GitHub**:
   - Go to **Settings** → **Git** section
   - Select **GitHub** as your source
   - Click **"Create Github App"**
   - Give it a name (e.g., `Fleet-Tracker-App`)
   - Click through to GitHub authorization
   - Choose repository access: **"Only select repositories"** → Select `fleettracker`
   - Click **"Install & Authorize"**

3. **Verify Connection**: You should see your GitHub account connected in the Git section

### Step 2: Create New Application

1. **Create Project** (optional but recommended for organization):
   - Click **"Create Project"** in the sidebar
   - Name it `Fleet Tracker`
   - Click **Create**

2. **Add Application**:
   - Inside your project, click **"Create Application"** or **"Add Service"**
   - Select **"Application"** (not Docker Compose)

### Step 3: Configure Application

**General Settings:**
- **Name**: `fleettracker`
- **Description**: Aircraft tracking application

**Source Code Settings:**
- **Provider**: GitHub
- **Repository**: Select `austin-ge/fleettracker`
- **Branch**: `main`
- **Build Path**: `/` (root)

**Build Settings:**
- **Build Type**: Select **"Dockerfile"**
- **Dockerfile Path**: `./Dockerfile` (or just `Dockerfile`)

### Step 4: Configure Ports & Domains

**Ports:**
- **Container Port**: `3000`
- **Published**: Toggle ON
- Click **"Add Port"**

**Domain:**
- Option 1: Use auto-generated domain (e.g., `fleettracker.traefik.me`)
- Option 2: Add your custom domain
  - Click **"Add Domain"**
  - Enter your domain (e.g., `fleet.yourdomain.com`)
  - Make sure DNS points to your VPS IP

### Step 5: Configure Mounts (Database Persistence)

**CRITICAL: Add volume mount for SQLite database**

1. Go to **"Mounts"** section
2. Click **"Add Mount"**
3. Configure:
   - **Type**: Volume
   - **Volume Name**: `fleettracker-database` (Dokploy will create it)
   - **Mount Path**: `/app/database`
   - Click **Save**

### Step 6: Environment Variables (Optional)

If you want to use environment variables for OpenSky credentials:

1. Go to **"Environment"** section
2. Click **"Add Variable"**
3. Add variables:
   - `OPENSKY_USERNAME`: `your_opensky_username`
   - `OPENSKY_PASSWORD`: `your_opensky_password`

*Note: This requires modifying `config.js` to read from `process.env`. For now, the app uses `credentials.json` file which is already in your Docker image.*

### Step 7: Advanced Settings (Optional but Recommended)

**Health Check:**
1. Go to **"Advanced"** section
2. Enable **Health Check**
3. Configure:
   - **Path**: `/api/fleet/current`
   - **Interval**: 30s
   - **Timeout**: 3s
   - **Retries**: 3

**Auto Deploy:**
- In the **"Advanced"** section, toggle **"Auto Deploy"** ON
- This automatically redeploys when you push to the `main` branch

**Restart Policy:**
- Set to **"unless-stopped"** (default)

### Step 8: Deploy!

1. Click the **"Deploy"** button (top right)
2. **Monitor Build Logs**: Click on **"Logs"** tab to watch the build progress
   - This may take 5-10 minutes on first build
   - Watch for any errors during `npm install` or Docker build
3. Wait for deployment to complete

### Step 9: Access Your Application

Once deployed:
- **Via Auto Domain**: `http://fleettracker.traefik.me` (or your assigned subdomain)
- **Via Custom Domain**: `http://yourdomain.com` (if configured)

**Test the API:**
```bash
curl http://your-domain/api/fleet/current
```

Open in browser to see the map interface!

### Step 10: Enable HTTPS (Recommended)

Dokploy uses Traefik with automatic Let's Encrypt certificates:

1. Ensure your domain DNS points to your VPS IP
2. In your application's **Domain** settings, enable **"HTTPS"**
3. Toggle **"Generate Certificate"**
4. Dokploy will automatically obtain and renew SSL certificates

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

---

## Monitoring & Logs

Dokploy provides built-in monitoring:

1. **Real-time Logs**: Go to **Logs** tab to see application output
2. **Resource Usage**: View CPU, memory, disk, and network graphs in **Monitoring** section
3. **Deployment History**: See past deployments and rollback if needed

---

## Troubleshooting

### Build Timeout / Server Freezing

**Problem**: Build consumes too much RAM/CPU, causing timeout.

**Solutions**:
1. Upgrade VPS to at least 2GB RAM
2. OR use Option B: CI/CD Build (see below)
3. Check build logs for specific errors

### Container Fails to Start

1. Go to **Logs** tab and check for errors
2. Common issues:
   - Missing `credentials.json` file (app will work without it, using anonymous OpenSky API)
   - Port 3000 already in use
   - Database permission issues

### Database Not Persisting

Ensure volume mount is configured:
- Go to **Mounts** section
- Verify mount path is `/app/database`
- Check that volume is created in Dokploy

### No Aircraft Data Showing

- Verify ICAO24 codes are correct in `config.js`
- Check if aircraft are currently airborne and transmitting ADS-B
- View logs for OpenSky API rate limit errors
- Anonymous API has limited credits (400/day)

### Build Fails with `better-sqlite3` Errors

The Dockerfile includes all required dependencies. If build still fails:
- Check Node version (should be 18)
- Verify build tools (python3, make, g++) are installing
- Try redeploying to clear cache

### Domain Not Working

- Verify DNS points to your VPS IP address
- Check if port 80/443 are open in VPS firewall
- Wait a few minutes for DNS propagation
- Try accessing via IP:PORT first

---

## Updating the Application

### With Auto-Deploy (Recommended)

If you enabled Auto Deploy in Step 7:

1. Make changes locally
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your update message"
   git push origin main
   ```
3. Dokploy automatically detects and redeploys!

### Manual Redeploy

1. Make and push your changes to GitHub
2. In Dokploy, go to your application
3. Click **"Redeploy"** button
4. Monitor build logs

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

---

## Option B: CI/CD Build with GitHub Actions (Recommended for Production)

If your VPS has limited resources or builds are timing out, use GitHub Actions to build the image and push to Docker Hub. Your VPS only pulls and runs the pre-built image.

### Prerequisites

- Docker Hub account (free): https://hub.docker.com
- GitHub repository (already have this)

### Steps

1. **Create GitHub Secrets**:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Add secrets:
     - `DOCKERHUB_USERNAME`: your Docker Hub username
     - `DOCKERHUB_TOKEN`: Docker Hub access token (create in Docker Hub → Account Settings → Security)

2. **Create GitHub Actions Workflow**:
   Create `.github/workflows/deploy.yml`:
   ```yaml
   name: Build and Push Docker Image

   on:
     push:
       branches: [ main ]

   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v3

         - name: Login to Docker Hub
           uses: docker/login-action@v2
           with:
             username: ${{ secrets.DOCKERHUB_USERNAME }}
             password: ${{ secrets.DOCKERHUB_TOKEN }}

         - name: Build and push
           uses: docker/build-push-action@v4
           with:
             context: .
             push: true
             tags: ${{ secrets.DOCKERHUB_USERNAME }}/fleettracker:latest
   ```

3. **Configure Dokploy for Pre-built Image**:
   - Create Application in Dokploy
   - Select **"Docker"** (not GitHub)
   - **Image**: `yourusername/fleettracker:latest`
   - Configure ports, volumes, environment same as Option A
   - Enable **"Auto Deploy"** with webhook from Docker Hub

4. **Deploy**: Push to GitHub → Actions builds → Pushes to Docker Hub → Dokploy auto-deploys

**Benefits**:
- No build load on VPS
- Faster deployments
- No build timeouts
- Better for production

---

## Using Docker Compose (Alternative)

Dokploy also supports docker-compose deployments:

1. In Dokploy, select **"Docker Compose"** (not Application)
2. **Provider**: GitHub
3. **Repository**: Select your repo
4. **Compose File Path**: `docker-compose.yml`
5. Deploy

This uses the `docker-compose.yml` file already in your repo.

---
