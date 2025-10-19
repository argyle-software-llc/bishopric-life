# LCR Data Sync Setup

This document explains how to configure and use the LCR data sync script to pull live ward data from churchofjesuschrist.org into your local database.

## Prerequisites

1. **LCR Account Access**: You need valid credentials for churchofjesuschrist.org with access to your ward's data
2. **Python 3**: The sync script is written in Python
3. **PostgreSQL Database**: Should already be set up from initial project setup

## Setup Instructions

### 1. Install Python Dependencies

The sync script uses the existing `church_of_jesus_christ_api` from the frisco5th-lcr project, which requires the `requests` library:

```bash
python3 -m pip install requests psycopg2-binary
```

### 2. Configure LCR Credentials

The sync script reads credentials from the frisco5th-lcr project. If you haven't already set this up:

```bash
cd /Users/jarombrown/PycharmProjects/frisco5th-lcr

# Copy the example file
cp lcr.credentials.example.json lcr.credentials.json

# Edit with your credentials
# You'll need:
# - username: Your LCR username (usually your email)
# - password: Your LCR password
# - unit_number: Your ward unit number (find this in LCR URL)
# - stake_unit_number: Your stake unit number
```

Example `lcr.credentials.json`:
```json
{
    "username": "your.email@example.com",
    "password": "your-password",
    "unit_number": 123456,
    "stake_unit_number": 789012
}
```

**Important Security Notes:**
- Never commit `lcr.credentials.json` to git
- Keep your credentials secure
- This file is already in `.gitignore` in the frisco5th-lcr project

### 3. Run the Sync Script

From the callings project directory:

```bash
cd /Users/jarombrown/PycharmProjects/church/callings

# Run the sync
python3 scripts/sync_from_lcr.py
```

The script will:
1. Authenticate with LCR
2. Fetch current member list
3. Fetch organization structure and callings
4. Update your PostgreSQL database with the latest data

## What Gets Synced

The sync script updates:

- **Members**: Full member list with contact information, age, gender
- **Households**: Household groupings and addresses
- **Organizations**: Ward organization structure (Relief Society, Elders Quorum, Primary, etc.)
- **Callings**: All calling positions in the ward
- **Calling Assignments**: Current assignments of members to callings

### Data Handling

- **New Records**: Created automatically
- **Existing Records**: Updated with latest information
- **Released Callings**: Automatically marked as inactive when member is no longer in that calling
- **Member Photos**: Not synced (requires separate implementation if needed)

## Running Periodically

You can set up the sync to run automatically using cron:

```bash
# Edit your crontab
crontab -e

# Add a line to run daily at 2 AM:
0 2 * * * cd /Users/jarombrown/PycharmProjects/church/callings && python3 scripts/sync_from_lcr.py >> logs/lcr_sync.log 2>&1
```

Or run manually whenever you want to refresh the data:

```bash
python3 scripts/sync_from_lcr.py
```

## Troubleshooting

### Authentication Errors

If you see authentication errors:
- Verify your credentials in `lcr.credentials.json`
- Make sure your account has access to ward data
- Try logging in to churchofjesuschrist.org manually to verify your credentials

### Database Connection Errors

If you see database connection errors:
- Ensure PostgreSQL is running: `pg_ctl status`
- Verify the database exists: `psql -l | grep ward_callings`
- Check database credentials in `scripts/sync_from_lcr.py`

### Import Errors

If you see Python import errors:
- Ensure the frisco5th-lcr project is at the expected path
- Install required dependencies: `python3 -m pip install requests psycopg2-binary`

## Integration with Application

After running the sync:
1. The web application will automatically show the updated data
2. No need to restart the server - it queries the database directly
3. Any calling changes you've tracked in the app remain intact

The sync updates base member and calling data but preserves:
- Calling change workflow records
- Calling considerations and prayer selections
- Task completion status
- Notes and priority settings

## Next Steps

Future enhancements could include:
- Syncing member photos
- Syncing ministering assignments
- Syncing temple recommend status
- Adding more LCR data endpoints
- Building a sync status dashboard in the UI
