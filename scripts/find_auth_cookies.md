# Finding the Essential Authentication Cookies

Most cookies are just analytics/tracking. We only need the **authentication cookies**. Here's how to find them:

## Method 1: Check Network Tab (Recommended - 2 minutes)

This shows you EXACTLY which cookies the browser sends to the API.

### Steps:

1. **Open LCR and log in**:
   - Go to https://lcr.churchofjesuschrist.org
   - Log in completely (including MFA)

2. **Open Developer Tools**:
   - Press `F12` (or `Cmd+Option+I` on Mac)
   - Click the **Network** tab

3. **Navigate to Members or Callings page**:
   - Click "Members" or "Callings" in LCR
   - This will make API requests

4. **Find an API request**:
   - In the Network tab, look for requests to:
     - `services/umlu/report/member-list`
     - `services/orgs/sub-orgs-with-callings`
   - These are the actual API calls

5. **Click on one of those requests**:
   - Look at the **Headers** tab
   - Scroll down to **Request Headers**
   - Find the **Cookie:** header

6. **Copy ONLY those cookie values**:
   - The `Cookie:` header shows exactly what's sent
   - Example: `Cookie: ChurchSSO=xxx; JSESSIONID=yyy; DT=zzz`

7. **Those are the only cookies you need!**

### What to look for:

The essential cookies are usually named:
- `ChurchSSO` or similar
- `JSESSIONID`
- `DT` (device token)
- `sid` (session ID)
- `xids`
- `proximity_xxx` (some ID)
- Anything with `okta` in the name

Analytics cookies (NOT needed):
- `_ga`, `_gcl_au` (Google Analytics)
- `_mkto_trk` (Marketo)
- `_scid`, `_sctr` (analytics)
- `__qca` (Quantcast)
- `_uetsid` (Bing)

## Method 2: Quick Test

I can help you test which cookies work. Save the cookies you have now and we'll test them:

```bash
python3 scripts/convert_cookies.py
```

Paste your cookie data, and we'll test if it works. If not, we'll identify what's missing.

## Method 3: Use Browser Extension

Some extensions show cookies with their purpose:

- **Cookie-Editor** (Chrome/Edge)
- **EditThisCookie** (Chrome)

These let you:
1. Filter by domain (`lcr.churchofjesuschrist.org`)
2. See which are HttpOnly (usually auth cookies)
3. Export only the ones you select

## What Format to Use

Once you've identified the essential cookies, create `.lcr_cookies.json`:

```json
{
  "cookies": {
    "ChurchSSO": "actual_value_here",
    "JSESSIONID": "actual_value_here",
    "DT": "actual_value_here",
    "sid": "actual_value_here"
  }
}
```

Replace `actual_value_here` with the real cookie values (the second column in your tab-separated data).

---

**Want me to help you test with your current cookies first?** We can see what error we get and that will tell us what's missing!
