# LCR Data Sync Setup

This guide explains how to set up automated syncing of ward data from LCR (Leader and Clerk Resources).

## How It Works

The sync script uses your browser session cookies to authenticate with LCR. This approach:
- Works with MFA enabled accounts
- Is simple and reliable
- Doesn't require storing passwords in the system
- Cookies last 24+ hours typically

## Initial Setup

### 1. Get Fresh Cookies

1. **Log into LCR** in your browser: https://lcr.churchofjesuschrist.org
   - Complete any MFA challenges

2. **Open Developer Tools**:
   - Press F12 (or Cmd+Option+I on Mac)
   - Click the **Console** tab

3. **Copy cookies** by running this command in the console:

```javascript
copy(JSON.stringify({cookies: {
  "appSession.0": document.cookie.split('; ').find(c => c.startsWith('appSession.0=')).split('=')[1],
  "appSession.1": document.cookie.split('; ').find(c => c.startsWith('appSession.1=')).split('=')[1]
}}, null, 2))
```

4. **Create `.lcr_cookies.json`** in the project root and paste the copied content

### 2. Run Initial Sync

```bash
./scripts/run_sync.sh
```

You should see output like:
```
Loaded 2 cookies
Connecting to database...
Fetching member list from LCR...
Processing 453 members...
Synced 453 members
Synced organizations and callings
Sync completed successfully!
```

## Running the Sync

### Manual Sync

Run anytime to get latest LCR data:
```bash
./scripts/run_sync.sh
```

### Automated Sync (Recommended for VPS)

Set up a cron job to sync daily:

```bash
# Edit crontab
crontab -e

# Add this line to sync daily at 2 AM:
0 2 * * * cd /path/to/callings && ./scripts/run_sync.sh >> logs/sync.log 2>&1
```

Create logs directory first:
```bash
mkdir -p logs
```

## Cookie Expiration

Browser cookies typically expire after 24-48 hours. When they expire:

1. You'll see an error: `HTTP Error: 401 Client Error: Unauthorized`
2. Follow the "Get Fresh Cookies" steps above
3. Update `.lcr_cookies.json`
4. Run the sync again

### Cookie Refresh Script (Optional)

For VPS deployments, you can set up a reminder to refresh cookies:

```bash
# Add to crontab to email you when cookies might be expiring
0 6 * * * echo "LCR cookies may need refreshing" | mail -s "LCR Sync Reminder" your@email.com
```

## What Gets Synced

The sync updates:

- **Members**: Full member list with contact info, age, gender
- **Households**: Household groupings and addresses
- **Organizations**: Ward organization structure
- **Callings**: All calling positions
- **Calling Assignments**: Current member-to-calling assignments

### What's Preserved

The sync updates base data but preserves your workflow:
- Calling change records (in_progress, approved, etc.)
- Calling considerations and prayer selections
- Task completion status
- Notes and priority settings

## Troubleshooting

### "Cookies file not found"
Create `.lcr_cookies.json` following the setup steps above.

### "401 Unauthorized"
Cookies have expired. Get fresh cookies and update the file.

### "Connection refused" or database errors
- Verify PostgreSQL is running: `pg_ctl status`
- Check database exists: `psql -l | grep ward_callings`

### Cookies keep expiring quickly
- Make sure you're copying the full cookie values (they're very long)
- Try logging into LCR with "Remember me" checked
- Some networks/VPNs may cause shorter cookie lifetimes

## Security Notes

- Never commit `.lcr_cookies.json` to git (already in .gitignore)
- Cookies are session credentials - treat them like passwords
- On VPS, ensure file permissions are restricted: `chmod 600 .lcr_cookies.json`
- Cookies are scoped to LCR only and cannot access other Church systems

## For Developers

The sync script is at `scripts/sync_from_lcr.py`. It:
1. Loads cookies from `.lcr_cookies.json`
2. Makes authenticated requests to LCR API endpoints
3. Updates PostgreSQL database with latest data
4. Uses upsert logic (INSERT ... ON CONFLICT UPDATE) to merge changes

Key endpoints used:
- Member list: `/services/umlu/report/member-list`
- Organizations: `/services/orgs/sub-orgs-with-callings`
