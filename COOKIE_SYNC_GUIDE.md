# LCR Sync with Browser Cookies

This guide explains how to sync live ward data from LCR using browser cookies - **no username/password needed in the script!**

## Why Use Browser Cookies?

✅ **Works with MFA** - You authenticate in your browser normally
✅ **No credential storage** - Script never sees your username or password
✅ **Simpler** - Just copy cookies once, then sync
✅ **Secure** - Cookies expire automatically

## Quick Start

### Step 1: Log into LCR in Your Browser

1. Open your browser (Chrome, Firefox, Safari, or Edge)
2. Go to https://lcr.churchofjesuschrist.org
3. Log in with your credentials (complete MFA if prompted)
4. Navigate around to make sure you're fully logged in

### Step 2: Export Your Cookies

#### Option A: Using Browser Dev Tools (Manual)

1. Open Developer Tools:
   - **Mac**: `Cmd + Option + I`
   - **Windows/Linux**: `F12` or `Ctrl + Shift + I`

2. Go to the **Application** tab (Chrome/Edge) or **Storage** tab (Firefox)

3. In the left sidebar:
   - Expand **Cookies**
   - Click on `https://lcr.churchofjesuschrist.org`

4. Copy ALL cookies shown. You'll need to create a JSON file with them.

5. Create the file `/Users/jarombrown/PycharmProjects/church/callings/.lcr_cookies.json`:

```json
{
  "cookies": {
    "ChurchSSO": "paste_value_here",
    "JSESSIONID": "paste_value_here",
    "DT": "paste_value_here",
    "sid": "paste_value_here",
    "xids": "paste_value_here",
    "proximity_xxx": "paste_value_here"
  }
}
```

**Tip**: Copy ALL cookies from the LCR domain. More is better than missing one!

#### Option B: Using a Browser Extension (Easier!)

1. Install a cookie export extension:
   - **Chrome/Edge**: [Cookie-Editor](https://chrome.google.com/webstore)
   - **Firefox**: [Cookie Quick Manager](https://addons.mozilla.org/en-US/firefox/)

2. Click the extension icon while on `lcr.churchofjesuschrist.org`

3. Click "Export" → Choose "JSON" format

4. Save as `.lcr_cookies.json` in the project root

   The exported JSON might look like:
   ```json
   [
     {"name": "ChurchSSO", "value": "abc123..."},
     {"name": "JSESSIONID", "value": "def456..."}
   ]
   ```

   Convert it to our format:
   ```json
   {
     "cookies": {
       "ChurchSSO": "abc123...",
       "JSESSIONID": "def456..."
     }
   }
   ```

### Step 3: Test the Connection

```bash
cd /Users/jarombrown/PycharmProjects/church/callings
python3 scripts/lcr_api_with_browser_cookies.py
```

You should see:
```
✓ Successfully connected to LCR API!
✓ User: Jarom Brown
✓ Successfully fetched XXX members
✓ Successfully fetched organization structure
✓ All tests passed! Ready to sync.
```

### Step 4: Run the Sync

```bash
python3 scripts/sync_from_lcr.py
```

The script will:
1. Load your cookies
2. Fetch member list from LCR
3. Fetch organization structure and callings
4. Update your PostgreSQL database
5. Mark released callings as inactive

## Troubleshooting

### Error: "Cookies file not found"

Create the file `.lcr_cookies.json` in the project root (same directory as this guide).

### Error: "API request failed: 401" or "403"

Your cookies have expired. Re-export fresh cookies from your browser.

### Error: "No such file or directory"

Make sure you're in the correct directory:
```bash
cd /Users/jarombrown/PycharmProjects/church/callings
```

### Which cookies do I need?

Copy **ALL cookies** from `lcr.churchofjesuschrist.org`. The important ones include:
- `ChurchSSO` or similar session cookies
- `JSESSIONID`
- `DT`
- `sid`
- `xids`
- Any `okta-*` cookies
- Any `proximity_*` cookies

**When in doubt, copy everything!**

## Cookie Expiration

Cookies typically expire after:
- **Hours to days** of inactivity
- When you log out of LCR
- When your browser clears cookies

When cookies expire, just re-export fresh ones and run the sync again.

## Security Notes

- ✅ Cookies are in `.gitignore` - won't be committed to git
- ✅ Cookies only work for LCR API - can't be used to change data
- ✅ No username/password stored anywhere
- ✅ Cookies expire automatically
- ⚠️  Don't share your `.lcr_cookies.json` file with anyone
- ⚠️  Keep the file secure on your local machine

## Automation

You can set up periodic syncing:

```bash
# Create a simple script
cat > sync_lcr.sh << 'EOF'
#!/bin/bash
cd /Users/jarombrown/PycharmProjects/church/callings
python3 scripts/sync_from_lcr.py >> logs/sync.log 2>&1
EOF

chmod +x sync_lcr.sh

# Run it whenever you want fresh data
./sync_lcr.sh
```

**Note**: You'll need to refresh cookies when they expire (usually every few days).

## What Gets Synced?

- ✅ All ward members (name, age, gender, contact info)
- ✅ Households and addresses
- ✅ Organization structure
- ✅ All callings and current assignments
- ✅ Set apart dates and sustained dates

Your calling change workflow data remains intact:
- ✅ Calling change tracking
- ✅ Considerations and prayer selections
- ✅ Tasks and completion status
- ✅ Notes and priorities

## Next Steps

After syncing:
- Refresh your browser on http://localhost:3001
- Check the Members page to see updated data
- Check the Org Chart to see current callings
- Any vacant callings will show as available

Enjoy automated data syncing with MFA support! 🎉
