#!/usr/bin/env python3
"""
Modified LCR API client with MFA support.

This extends the church_of_jesus_christ_api to handle MFA challenges.
"""

import sys
import uuid
import codecs
import json
from urllib.parse import urlparse, parse_qs

sys.path.insert(0, '/Users/jarombrown/PycharmProjects/frisco5th-lcr')

import requests
from church_of_jesus_christ_api import ChurchOfJesusChristAPI, _endpoints


class ChurchOfJesusChristAPIWithMFA(ChurchOfJesusChristAPI):
    """
    Extended API client that supports MFA authentication.
    """

    def __init__(
        self,
        username: str,
        password: str,
        proxies: dict[str, str] = None,
        verify_SSL: bool = None,
        timeout_sec: int = None,
    ) -> None:
        """
        Initialize with MFA support.

        Parameters are the same as ChurchOfJesusChristAPI.
        """
        # Don't call parent __init__ - we'll implement our own auth flow
        self._ChurchOfJesusChristAPI__session = requests.Session()
        if proxies is not None:
            self._ChurchOfJesusChristAPI__session.proxies.update(proxies)
        self._ChurchOfJesusChristAPI__session.verify = verify_SSL if verify_SSL is not None else proxies is None
        self._ChurchOfJesusChristAPI__user_details = None
        self._ChurchOfJesusChristAPI__org_id = None
        self._ChurchOfJesusChristAPI__timeout_sec = timeout_sec or 15

        # Authenticate with MFA support
        self._authenticate_with_mfa(username, password)

    def _authenticate_with_mfa(self, username: str, password: str):
        """
        Authenticate with MFA support.
        """
        session = self._ChurchOfJesusChristAPI__session
        timeout = self._ChurchOfJesusChristAPI__timeout_sec

        print(f"Authenticating as {username}...")

        # Step 1: Initial authentication
        login_resp = session.post(
            _endpoints["authn"],
            timeout=timeout,
            headers={"Content-Type": "application/json;charset=UTF-8"},
            data=json.dumps({"username": username, "password": password}),
        ).json()

        print(f"Auth response status: {login_resp.get('status')}")

        # Check if MFA is required
        if login_resp.get('status') == 'MFA_REQUIRED':
            print("\nMFA Required!")
            print(f"Factor type: {login_resp.get('_embedded', {}).get('factors', [{}])[0].get('factorType')}")

            # Get the factor (SMS, TOTP, etc.)
            factors = login_resp.get('_embedded', {}).get('factors', [])
            if not factors:
                raise ValueError("MFA required but no factors available")

            # Use the first available factor
            factor = factors[0]
            factor_id = factor['id']
            factor_type = factor['factorType']

            print(f"\nUsing factor: {factor_type}")

            # Get the state token
            state_token = login_resp.get('stateToken')

            # For TOTP (authenticator app), we just need to verify
            # For SMS, we need to send a challenge first
            if factor_type == 'sms':
                # Send SMS challenge
                print("Sending SMS code...")
                verify_url = factor['_links']['verify']['href']
                challenge_resp = session.post(
                    verify_url,
                    timeout=timeout,
                    headers={"Content-Type": "application/json;charset=UTF-8"},
                    data=json.dumps({"stateToken": state_token}),
                ).json()
                state_token = challenge_resp.get('stateToken', state_token)

            # Prompt for MFA code
            mfa_code = input("\nEnter your MFA code: ").strip()

            # Verify MFA code
            print("Verifying MFA code...")
            verify_url = factor['_links']['verify']['href']
            mfa_resp = session.post(
                verify_url,
                timeout=timeout,
                headers={"Content-Type": "application/json;charset=UTF-8"},
                data=json.dumps({
                    "stateToken": state_token,
                    "passCode": mfa_code
                }),
            ).json()

            print(f"MFA verification status: {mfa_resp.get('status')}")

            if mfa_resp.get('status') != 'SUCCESS':
                raise ValueError(f"MFA verification failed: {mfa_resp.get('status')}")

            # Get the session token from successful MFA
            session_token = mfa_resp.get('sessionToken')
        else:
            # No MFA required
            session_token = login_resp.get("sessionToken")

        if not session_token:
            raise ValueError(f"Failed to get session token. Status: {login_resp.get('status')}")

        print("Session token obtained successfully")

        # OAuth flow (same as original)
        client_id = codecs.decode("0bnyu46hlyC0T9DL1357", "rot13")
        client_secret = codecs.decode("9n4ShhBgxm17hz4B8HVT3rSV4hJvnzXH1bjHkMPR", "rot13")

        print("Getting OAuth authorization code...")

        # Debug: print session cookies
        print(f"Session cookies: {list(session.cookies.keys())}")

        resp = session.get(
            _endpoints["oauth2-authorize"],
            timeout=timeout,
            params={
                "client_id": client_id,
                "response_type": "code",
                "scope": "openid profile offline_access cmisid",
                "redirect_uri": "https://mobileandroid",
                "state": str(uuid.uuid4()),
                "sessionToken": session_token,
            },
            allow_redirects=False,
        )

        print(f"OAuth authorize response status: {resp.status_code}")
        print(f"Response headers: {dict(resp.headers)}")

        if "location" not in resp.headers:
            print(f"\nError: No location header in response")
            print(f"This might mean the sessionToken is invalid or expired")
            print(f"Full auth response was: {json.dumps(login_resp, indent=2)}")

            # Save the full response for debugging
            with open('/tmp/lcr_oauth_response.html', 'w') as f:
                f.write(resp.text)
            print(f"Saved full response to /tmp/lcr_oauth_response.html")

            raise ValueError("OAuth authorization failed - no redirect location")

        code = parse_qs(urlparse(resp.headers["location"]).query)["code"][0]

        print("Exchanging code for access token...")
        token_json = session.post(
            _endpoints["oauth2-token"],
            timeout=timeout,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            params={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "authorization_code",
                "redirect_uri": "https://mobileandroid",
            },
        ).json()

        self._ChurchOfJesusChristAPI__access_token = token_json["access_token"]

        # Set cookies
        session.cookies.set_cookie(
            requests.cookies.create_cookie(name="owp", value=token_json["id_token"])
        )

        # Get LCR session
        session.get(_endpoints["lcr-login"], timeout=timeout)

        # Get user details
        self._ChurchOfJesusChristAPI__user_details = self._ChurchOfJesusChristAPI__get_JSON(
            self._ChurchOfJesusChristAPI__endpoint("user"), timeout
        )

        print("Authentication complete!")
