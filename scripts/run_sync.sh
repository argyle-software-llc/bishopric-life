#!/bin/bash
# Run the LCR sync using browser cookies

# Change to project directory
cd "$(dirname "$0")/.." || exit 1

# Check if cookies file exists
if [ ! -f ".lcr_cookies.json" ]; then
    echo "Error: .lcr_cookies.json not found"
    echo ""
    echo "To get fresh cookies:"
    echo "1. Log into https://lcr.churchofjesuschrist.org in your browser"
    echo "2. Open Developer Tools (F12)"
    echo "3. Go to Console and run:"
    echo ""
    echo "   copy(JSON.stringify({cookies: {"
    echo "     'appSession.0': document.cookie.split('; ').find(c => c.startsWith('appSession.0=')).split('=')[1],"
    echo "     'appSession.1': document.cookie.split('; ').find(c => c.startsWith('appSession.1=')).split('=')[1]"
    echo "   }}, null, 2))"
    echo ""
    echo "4. Paste into .lcr_cookies.json"
    exit 1
fi

# Run the sync
python3 scripts/sync_from_lcr.py
