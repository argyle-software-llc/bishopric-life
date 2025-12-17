#!/bin/bash
# Display instructions for getting fresh LCR cookies

cat << 'EOF'
╔════════════════════════════════════════════════════════════════════════════╗
║                    GET FRESH LCR COOKIES                                   ║
╚════════════════════════════════════════════════════════════════════════════╝

Follow these steps to get fresh cookies:

1. Open LCR in your browser:
   https://lcr.churchofjesuschrist.org

   (Log in completely, including any MFA)

2. Press F12 to open Developer Tools
   (Or Cmd+Option+I on Mac)

3. Click the "Console" tab

4. Copy and paste this command, then press Enter:

   copy(JSON.stringify({cookies: {
     "appSession.0": document.cookie.split('; ').find(c => c.startsWith('appSession.0=')).split('=')[1],
     "appSession.1": document.cookie.split('; ').find(c => c.startsWith('appSession.1=')).split('=')[1]
   }}, null, 2))

5. The cookies are now in your clipboard!

6. Paste them into .lcr_cookies.json in this directory

7. Run the sync again:
   ./scripts/run_sync.sh

╔════════════════════════════════════════════════════════════════════════════╗
║ NOTE: Cookies typically last 24-48 hours. You'll need to repeat this      ║
║       process when they expire (you'll get a 401 error).                  ║
╚════════════════════════════════════════════════════════════════════════════╝
EOF
