#!/usr/bin/env python3
"""
LCR API client using manually imported browser cookies.

Instead of programmatic authentication, this uses cookies from your browser
session after you've logged into churchofjesuschrist.org.
"""

import sys
import json
from typing import Optional, Dict, Any

sys.path.insert(0, '/Users/jarombrown/PycharmProjects/frisco5th-lcr')

import requests
from church_of_jesus_christ_api import _endpoints

COOKIES_FILE = '/Users/jarombrown/PycharmProjects/church/callings/.lcr_cookies.json'


class ChurchOfJesusChristAPIWithBrowserCookies:
    """
    API client that uses cookies from a browser session.
    """

    def __init__(
        self,
        cookies_file: str = COOKIES_FILE,
        timeout_sec: int = 15,
    ) -> None:
        """
        Initialize using browser cookies.

        Parameters:
        cookies_file : str
            Path to JSON file containing browser cookies
        timeout_sec : int
            Request timeout in seconds
        """
        self.__session = requests.Session()
        self.__timeout_sec = timeout_sec
        self.__user_details = None

        # Load cookies from file
        print(f"Loading cookies from {cookies_file}...")
        with open(cookies_file, 'r') as f:
            cookie_data = json.load(f)

        # Set up session with cookies
        self._setup_session(cookie_data)

        # Verify we can access the API
        print("Verifying access...")
        self.__user_details = self._get_JSON(self._endpoint("user"))
        print(f"Authenticated as: {self.__user_details.get('displayName')}")

    def _setup_session(self, cookie_data: Dict[str, Any]):
        """Set up the session with cookies from the browser."""

        # Handle different cookie formats
        if isinstance(cookie_data, dict):
            if 'cookies' in cookie_data:
                # Format: {"cookies": {"name1": "value1", ...}}
                for name, value in cookie_data['cookies'].items():
                    self.__session.cookies.set(name, value)
            elif 'access_token' in cookie_data:
                # Format: {"access_token": "...", "cookies": {...}}
                self.__access_token = cookie_data['access_token']
                for name, value in cookie_data.get('cookies', {}).items():
                    self.__session.cookies.set(name, value)
            else:
                # Format: {"name1": "value1", ...}
                for name, value in cookie_data.items():
                    if name != 'access_token':
                        self.__session.cookies.set(name, value)
                    else:
                        self.__access_token = value

        # If access_token isn't set, try to extract from cookies
        if not hasattr(self, '_ChurchOfJesusChristAPIWithBrowserCookies__access_token'):
            # We'll need to get this from the user or derive it
            # For now, try to use the session cookies
            self.__access_token = None

        print(f"Loaded {len(self.__session.cookies)} cookies")

    def _endpoint(
        self,
        name: str,
        unit: int = None,
        org_id: int = None,
        parent_unit: int = None,
        member_id: int = None,
        uuid: str = None,
    ) -> str:
        """Build an endpoint URL."""
        endpoint = _endpoints[name]

        def default_if_none(val, default):
            return str(val if val != None else default)

        if self.__user_details:
            endpoint = endpoint.replace("{unit}", default_if_none(unit, self.__user_details["homeUnits"][0]))
            endpoint = endpoint.replace(
                "{parent_unit}",
                default_if_none(parent_unit, self.__user_details["parentUnits"][0]),
            )
            endpoint = endpoint.replace(
                "{member_id}",
                default_if_none(member_id, self.__user_details["individualId"]),
            )
            endpoint = endpoint.replace("{uuid}", default_if_none(uuid, self.__user_details["uuid"]))

        return endpoint

    def _get_JSON(self, endpoint: str, timeout_sec: int = None) -> Any:
        """Make a GET request and return JSON."""
        headers = {"Accept": "application/json"}

        # Add authorization header if we have an access token
        if hasattr(self, '_ChurchOfJesusChristAPIWithBrowserCookies__access_token') and self.__access_token:
            headers["Authorization"] = f"Bearer {self.__access_token}"

        resp = self.__session.get(
            endpoint,
            headers=headers,
            timeout=timeout_sec or self.__timeout_sec,
        )

        if not resp.ok:
            print(f"Error: {resp.status_code}")
            print(f"Response: {resp.text[:500]}")
            raise ValueError(f"API request failed: {resp.status_code}")

        return resp.json()

    @property
    def user_details(self):
        """Returns the details of the user logged into this session."""
        return self.__user_details

    def get_member_list(self, unit: int = None, timeout_sec: int = None):
        """Returns the unit member list."""
        return self._get_JSON(self._endpoint("member-list", unit=unit), timeout_sec)

    def get_unit_organizations(self, unit: int = None, timeout_sec: int = None):
        """Returns the unit calling/leadership organization structure."""
        return self._get_JSON(self._endpoint("unit-organizations", unit=unit), timeout_sec)


def export_cookies_instructions():
    """Print instructions for exporting cookies from browser."""
    print("""
╔════════════════════════════════════════════════════════════════╗
║          HOW TO EXPORT COOKIES FROM YOUR BROWSER               ║
╚════════════════════════════════════════════════════════════════╝

1. Open your browser and go to: https://lcr.churchofjesuschrist.org
2. Log in with your credentials (including MFA if prompted)
3. Once logged in, open Browser Developer Tools:
   - Chrome/Edge: Press F12 or Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows)
   - Firefox: Press F12 or Cmd+Option+I (Mac) or Ctrl+Shift+I (Windows)
   - Safari: Enable "Show Develop menu" in Preferences first, then Cmd+Option+I

4. Go to the "Application" or "Storage" tab
5. In the left sidebar, expand "Cookies"
6. Click on "https://lcr.churchofjesuschrist.org"

7. Look for these important cookies and copy their values:
   - ChurchSSO (or similar session cookie)
   - Any cookies with "okta" in the name
   - JSESSIONID

8. Create a file at: {COOKIES_FILE}

9. Format the file as JSON like this:

{{
  "cookies": {{
    "ChurchSSO": "value_you_copied",
    "JSESSIONID": "value_you_copied",
    "okta-oauth-state": "value_you_copied"
  }}
}}

ALTERNATIVE - Use a Browser Extension:
  - Chrome: "Get cookies.txt" or "Cookie-Editor"
  - Firefox: "cookies.txt" or "Cookie Quick Manager"

  These can export cookies in JSON format automatically.

10. Save the file and run the sync script again!

Note: These cookies will expire after some time (usually hours or days).
You'll need to repeat this process when they expire.
    """)


if __name__ == '__main__':
    """Test the cookie-based authentication."""
    try:
        api = ChurchOfJesusChristAPIWithBrowserCookies()
        print("\n✓ Successfully connected to LCR API!")
        print(f"✓ User: {api.user_details.get('displayName')}")

        # Try to fetch some data
        print("\nTesting API access...")
        members = api.get_member_list()
        print(f"✓ Successfully fetched {len(members)} members")

        orgs = api.get_unit_organizations()
        print(f"✓ Successfully fetched organization structure")

        print("\n✓ All tests passed! Ready to sync.")

    except FileNotFoundError:
        print(f"\n✗ Cookies file not found: {COOKIES_FILE}")
        export_cookies_instructions()
    except Exception as e:
        print(f"\n✗ Error: {e}")
        print("\nThis might mean:")
        print("  - Your cookies have expired")
        print("  - The cookies are missing required values")
        print("  - The cookie format is incorrect")
        print("\nTry re-exporting fresh cookies from your browser.")
        export_cookies_instructions()
