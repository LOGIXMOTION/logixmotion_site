# LogixMotion

## Quick Start

### Development
```bash
npm install
npm start
```

### Docker Deployment

**First time setup:**
1. Copy `.env.example` to `.env` and fill in your SMTP credentials
2. Make deploy script executable: `chmod +x deploy.sh`
3. Run: `./deploy.sh`

**Quick deploy (after any changes):**
```bash
./deploy.sh
```

**Manual commands:**
```bash
# Build and run
docker compose up -d --build

# Restart (after .env changes)
docker compose restart

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Access
- Direct: `http://your-server:8085`
- Via proxy: Configure Nginx Proxy Manager to forward to `container_ip:3000` or `host_ip:8085`