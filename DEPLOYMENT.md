# VPS Deployment Guide

This guide covers deploying the Ward Callings application to a VPS (Virtual Private Server).

## Prerequisites

- VPS with Ubuntu/Debian (or similar Linux distribution)
- PostgreSQL installed
- Node.js 18+ installed
- Python 3.11+ installed
- sudo access

## Setup Steps

### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y postgresql postgresql-contrib python3 python3-pip nodejs npm git

# Install PM2 for process management
sudo npm install -g pm2
```

### 2. Database Setup

```bash
# Create database
sudo -u postgres createdb ward_callings

# Create user (if needed)
sudo -u postgres psql -c "CREATE USER your_user WITH PASSWORD 'secure_password';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ward_callings TO your_user;"

# Run migrations (from project directory)
psql -d ward_callings -f server/src/db/schema.sql
```

### 3. Application Deployment

```bash
# Clone repository
cd /var/www
sudo git clone <your-repo-url> callings
cd callings

# Install dependencies
npm install
cd client && npm install && cd ..

# Build client
cd client && npm run build && cd ..

# Build server
npm run build
```

### 4. Initial LCR Sync Setup

Get browser cookies for LCR authentication:

1. **Log into LCR** in your local browser: https://lcr.churchofjesuschrist.org
2. **Open Developer Tools** (F12)
3. **Run this in Console**:
   ```javascript
   copy(JSON.stringify({cookies: {
     "appSession.0": document.cookie.split('; ').find(c => c.startsWith('appSession.0=')).split('=')[1],
     "appSession.1": document.cookie.split('; ').find(c => c.startsWith('appSession.1=')).split('=')[1]
   }}, null, 2))
   ```
4. **Create `.lcr_cookies.json`** on the VPS and paste the content
5. **Secure the file**: `chmod 600 .lcr_cookies.json`

Run initial sync:
```bash
./scripts/run_sync.sh
```

**Note**: Cookies expire every 24-48 hours. You'll need to refresh them periodically (see SYNC_SETUP.md).

### 6. Start Application

```bash
# Start server with PM2
pm2 start dist/index.js --name ward-callings

# Save PM2 configuration
pm2 save

# Set up PM2 to start on system boot
pm2 startup
# Follow the command it outputs

# Check status
pm2 status
```

### 7. Set Up Automated Sync

Create a cron job to sync data daily:

```bash
# Edit crontab
crontab -e

# Add this line to sync daily at 2 AM:
0 2 * * * cd /var/www/callings && ./scripts/run_sync.sh >> logs/sync.log 2>&1
```

Create logs directory:
```bash
mkdir -p logs
```

### 8. Configure Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/callings
```

Add this configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Client files
    location / {
        root /var/www/callings/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/callings /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 9. SSL/HTTPS Setup (Optional but Recommended)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Certbot will automatically configure HTTPS
```

## Monitoring & Maintenance

### View Application Logs

```bash
# PM2 logs
pm2 logs ward-callings

# Sync logs
tail -f logs/sync.log

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Restart Application

```bash
pm2 restart ward-callings
```

### Update Application

```bash
cd /var/www/callings
git pull
npm install
cd client && npm install && npm run build && cd ..
npm run build
pm2 restart ward-callings
```

### Refresh Cookies

If sync fails with "401 Unauthorized", cookies have expired:

1. Log into LCR in your browser
2. Get fresh cookies (see SYNC_SETUP.md)
3. Update `.lcr_cookies.json` on the VPS
4. Run sync again: `./scripts/run_sync.sh`

## Security Considerations

1. **Firewall**: Only allow ports 80, 443, and SSH
   ```bash
   sudo ufw allow 80
   sudo ufw allow 443
   sudo ufw allow 22
   sudo ufw enable
   ```

2. **Database**: Ensure PostgreSQL only accepts local connections

3. **Credentials**: Never commit .env or .lcr_tokens.json to git

4. **Updates**: Keep system and dependencies updated
   ```bash
   sudo apt update && sudo apt upgrade
   npm update
   ```

5. **Backups**: Regular database backups
   ```bash
   # Create backup
   pg_dump ward_callings > backup_$(date +%Y%m%d).sql
   
   # Restore from backup
   psql ward_callings < backup_20241029.sql
   ```

## Troubleshooting

### Sync fails with "Unauthorized"
- Tokens expired, delete `~/.lcr_tokens.json` and run sync manually
- Check credentials in `.env`

### Application won't start
- Check logs: `pm2 logs ward-callings`
- Verify database connection
- Check port 3003 is available: `lsof -i :3003`

### Database connection errors
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check connection settings in `.env`
- Verify database exists: `psql -l | grep ward_callings`

## Cost Optimization

For small wards, a minimal VPS works fine:
- 1 CPU, 1GB RAM, 25GB SSD
- Providers: DigitalOcean ($6/month), Linode ($5/month), Vultr ($5/month)
