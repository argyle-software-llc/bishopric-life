#!/usr/bin/env python3
"""
One-time OAuth authentication setup for LDS Membertools API.

This script guides you through the OAuth login process to obtain
refresh tokens for the sync script. Run this once to set up authentication,
then the sync script will auto-refresh tokens as needed.

Usage:
    python3 scripts/setup_auth.py
"""

import os
import sys
import json
import base64
import hashlib
import secrets
import webbrowser
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs

try:
    import requests
except ImportError:
    print("Error: 'requests' module not found.")
    print("Install it with: pip install requests")
    sys.exit(1)

# =============================================================================
# Configuration (from LDS Member Tools mobile app)
# =============================================================================

OAUTH_CONFIG = {
    'authorize_url': 'https://id.churchofjesuschrist.org/oauth2/default/v1/authorize',
    'token_url': 'https://id.churchofjesuschrist.org/oauth2/default/v1/token',
    'client_id': '0oa18r3e96fyH2lUI358',
    'redirect_uri': 'membertoolsauth://login',
    'scopes': 'openid profile offline_access cmisid no_links',
}

REPO_ROOT = Path(__file__).resolve().parents[1]
TOKENS_FILE = REPO_ROOT / '.oauth_tokens.json'


# =============================================================================
# PKCE (Proof Key for Code Exchange) helpers
# =============================================================================

def generate_pkce_pair():
    """Generate PKCE code_verifier and code_challenge."""
    # Generate a random code verifier (43-128 characters)
    code_verifier = secrets.token_urlsafe(32)

    # Create code challenge using S256 method
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).decode().rstrip('=')

    return code_verifier, code_challenge


def build_authorize_url(code_challenge: str, state: str) -> str:
    """Build the OAuth authorization URL."""
    params = {
        'client_id': OAUTH_CONFIG['client_id'],
        'redirect_uri': OAUTH_CONFIG['redirect_uri'],
        'response_type': 'code',
        'scope': OAUTH_CONFIG['scopes'],
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256',
        'state': state,
        'nonce': secrets.token_urlsafe(16),
    }

    query = '&'.join(f'{k}={v}' for k, v in params.items())
    return f"{OAUTH_CONFIG['authorize_url']}?{query}"


def exchange_code_for_tokens(code: str, code_verifier: str) -> dict:
    """Exchange authorization code for access and refresh tokens."""
    response = requests.post(
        OAUTH_CONFIG['token_url'],
        data={
            'grant_type': 'authorization_code',
            'client_id': OAUTH_CONFIG['client_id'],
            'redirect_uri': OAUTH_CONFIG['redirect_uri'],
            'code': code,
            'code_verifier': code_verifier,
        },
        headers={'Content-Type': 'application/x-www-form-urlencoded'},
        timeout=30,
    )

    if response.status_code != 200:
        raise Exception(f"Token exchange failed: {response.status_code}\n{response.text}")

    return response.json()


def save_tokens(tokens: dict):
    """Save tokens to file."""
    data = {
        'refresh_token': tokens['refresh_token'],
        'access_token': tokens['access_token'],
        'updated_at': datetime.now().isoformat(),
    }

    with open(TOKENS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

    # Set restrictive permissions
    os.chmod(TOKENS_FILE, 0o600)


def extract_code_from_url(url: str) -> str:
    """Extract authorization code from redirect URL."""
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    if 'code' not in params:
        raise ValueError("No 'code' parameter found in URL")

    return params['code'][0]


# =============================================================================
# Main
# =============================================================================

def main():
    print()
    print("=" * 60)
    print("     LDS Membertools Authentication Setup")
    print("=" * 60)
    print()

    # Check if tokens already exist
    if TOKENS_FILE.exists():
        print(f"Existing tokens found at: {TOKENS_FILE}")
        response = input("Overwrite? (y/N): ").strip().lower()
        if response != 'y':
            print("Aborted.")
            return
        print()

    # Generate PKCE pair
    code_verifier, code_challenge = generate_pkce_pair()
    state = secrets.token_urlsafe(16)

    # Build authorization URL
    auth_url = build_authorize_url(code_challenge, state)

    print("Step 1: Opening browser for Church login...")
    print()
    print("   If the browser doesn't open automatically, copy this URL:")
    print()
    print(f"   {auth_url}")
    print()

    # Try to open browser
    try:
        webbrowser.open(auth_url)
    except Exception:
        print("   (Could not open browser automatically)")

    print("-" * 60)
    print()
    print("Step 2: Log in with your Church account (including MFA)")
    print()
    print("-" * 60)
    print()
    print("Step 3: After login, your browser will try to open a URL")
    print("        that starts with 'membertoolsauth://login?code=...'")
    print()
    print("        The page won't load - that's expected!")
    print()
    print("        Copy the ENTIRE URL from your browser's address bar")
    print("        and paste it below.")
    print()
    print("-" * 60)
    print()

    # Get the redirect URL from user
    redirect_url = input("Paste the URL here: ").strip()

    if not redirect_url:
        print("Error: No URL provided")
        sys.exit(1)

    # Extract authorization code
    try:
        code = extract_code_from_url(redirect_url)
    except ValueError as e:
        print(f"Error: {e}")
        print()
        print("Make sure you copied the full URL including '?code=...'")
        sys.exit(1)

    print()
    print("Exchanging authorization code for tokens...")

    # Exchange code for tokens
    try:
        tokens = exchange_code_for_tokens(code, code_verifier)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

    # Save tokens
    save_tokens(tokens)

    print()
    print("=" * 60)
    print("   SUCCESS!")
    print("=" * 60)
    print()
    print(f"   Tokens saved to: {TOKENS_FILE}")
    print()
    print("   You can now run the sync script:")
    print("   python3 scripts/sync_from_membertools.py")
    print()
    print("   Or use the 'Sync Now' button in the Admin page.")
    print()

    # Verify tokens work
    print("Verifying tokens...")
    try:
        response = requests.get(
            'https://membertools-api.churchofjesuschrist.org/api/v5/user',
            headers={'Authorization': f"Bearer {tokens['access_token']}"},
            timeout=30,
        )
        if response.status_code == 200:
            user = response.json()
            print(f"   Authenticated as: {user.get('preferredName')} ({user.get('username')})")
            print(f"   Home unit: {user.get('homeUnits', [])}")
        else:
            print(f"   Warning: Could not verify tokens (status {response.status_code})")
    except Exception as e:
        print(f"   Warning: Could not verify tokens: {e}")

    print()


if __name__ == '__main__':
    main()
