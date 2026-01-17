#!/usr/bin/env python3
"""
Membertools API sync script using OAuth2 authentication.

This script uses the same OAuth2 flow as the LDS Member Tools mobile app,
which provides more reliable authentication than browser cookies.

Benefits over browser cookies:
- Refresh tokens last 30-90 days (vs 24-48 hours for cookies)
- Auto-refresh mechanism with rolling tokens
- Standard OAuth2 flow
- Access to more data (youth interviews, temple recommends, etc.)
"""

import sys
import os
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from pathlib import Path
import requests

try:
    import psycopg2
except ImportError:
    psycopg2 = None

# =============================================================================
# Configuration
# =============================================================================

REPO_ROOT = Path(__file__).resolve().parents[1]
TOKENS_FILE = os.getenv('OAUTH_TOKENS_FILE', str(REPO_ROOT / '.oauth_tokens.json'))
DRY_RUN = os.getenv('DRY_RUN', '0') == '1'

# OAuth2 Configuration (from LDS Member Tools app)
OAUTH_CONFIG = {
    'token_url': 'https://id.churchofjesuschrist.org/oauth2/default/v1/token',
    'client_id': '0oa18r3e96fyH2lUI358',
}

# Membertools API
MEMBERTOOLS_API = 'https://membertools-api.churchofjesuschrist.org'

# Database configuration
DB_CONFIG = {
    'dbname': 'ward_callings',
    'user': os.getenv('USER', ''),
    'password': '',
    'host': 'localhost',
    'port': 5432,
}


def get_db_connection():
    """Get database connection."""
    database_url = os.getenv('DATABASE_URL')
    if database_url:
        if psycopg2 is None:
            raise RuntimeError("psycopg2 not installed; install it or set DRY_RUN=1")
        return psycopg2.connect(database_url)
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed; install it or set DRY_RUN=1")
    return psycopg2.connect(**DB_CONFIG)


# =============================================================================
# OAuth2 Client
# =============================================================================

class OAuthClient:
    """OAuth2 client for Membertools API."""

    def __init__(self, tokens_file: str):
        self.tokens_file = tokens_file
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'LDSTools/5.0.0 (Android)',
            'Accept': 'application/json',
        })
        self.access_token = None
        self.refresh_token = None
        self._load_tokens()

    def _load_tokens(self):
        """Load tokens from file."""
        if not os.path.isfile(self.tokens_file):
            raise FileNotFoundError(
                f"Tokens file not found: {self.tokens_file}\n\n"
                "To get your initial tokens:\n"
                "1. Run the one-time auth flow (see README)\n"
                "2. Or manually create the file with:\n"
                '   {"refresh_token": "your_refresh_token_here"}'
            )

        with open(self.tokens_file, 'r') as f:
            data = json.load(f)

        self.refresh_token = data.get('refresh_token')
        self.access_token = data.get('access_token')

        if not self.refresh_token:
            raise ValueError("No refresh_token found in tokens file")

        print(f"Loaded tokens from {self.tokens_file}")

    def _save_tokens(self):
        """Save tokens to file."""
        data = {
            'refresh_token': self.refresh_token,
            'access_token': self.access_token,
            'updated_at': datetime.now().isoformat(),
        }
        with open(self.tokens_file, 'w') as f:
            json.dump(data, f, indent=2)
        print(f"Saved updated tokens to {self.tokens_file}")

    def _refresh_access_token(self):
        """Use refresh token to get a new access token."""
        print("Refreshing access token...")

        response = requests.post(
            OAUTH_CONFIG['token_url'],
            data={
                'grant_type': 'refresh_token',
                'refresh_token': self.refresh_token,
                'client_id': OAUTH_CONFIG['client_id'],
            },
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            timeout=30,
        )

        if response.status_code != 200:
            print(f"Token refresh failed: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            raise Exception("Failed to refresh access token. You may need to re-authenticate.")

        data = response.json()
        self.access_token = data['access_token']

        # OAuth2 uses rolling refresh tokens - save the new one
        if 'refresh_token' in data:
            self.refresh_token = data['refresh_token']

        self._save_tokens()
        print(f"Access token refreshed (expires in {data.get('expires_in', '?')} seconds)")

    def _ensure_access_token(self):
        """Ensure we have a valid access token."""
        if not self.access_token:
            self._refresh_access_token()

    def _request(self, method: str, endpoint: str, **kwargs) -> requests.Response:
        """Make an authenticated request with auto-retry on 401."""
        self._ensure_access_token()

        url = f"{MEMBERTOOLS_API}{endpoint}"
        headers = kwargs.pop('headers', {})
        headers['Authorization'] = f'Bearer {self.access_token}'

        response = self.session.request(method, url, headers=headers, **kwargs)

        # If unauthorized, refresh token and retry once
        if response.status_code == 401:
            print("Got 401, refreshing token and retrying...")
            self._refresh_access_token()
            headers['Authorization'] = f'Bearer {self.access_token}'
            response = self.session.request(method, url, headers=headers, **kwargs)

        return response

    def get_user(self) -> Dict:
        """Get current user info."""
        response = self._request('GET', '/api/v5/user')
        response.raise_for_status()
        return response.json()

    def sync(self, timezone: str = 'America/Chicago') -> Dict:
        """Fetch all data from the sync endpoint."""
        response = self._request(
            'POST',
            '/api/v5/sync',
            json={
                'manual': True,
                'automatic': True,
                'attempt': 1,
                'timeZone': timezone,
            },
        )
        response.raise_for_status()
        return response.json()


# =============================================================================
# Data Processing
# =============================================================================

def sync_members_and_households(data: Dict, conn) -> Dict[str, str]:
    """
    Sync members and households from membertools data.
    Returns a mapping of member_uuid -> database_id
    """
    cur = conn.cursor()
    member_uuid_map = {}

    households = data.get('households', [])
    print(f"Processing {len(households)} households...")

    for household in households:
        household_uuid = household.get('uuid')
        household_name = household.get('displayName') or household.get('familyName')
        address = household.get('address')
        unit_number = household.get('unitNumber')

        if not household_uuid:
            continue

        # Upsert household
        cur.execute(
            """
            INSERT INTO households (id, household_name, address)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                household_name = EXCLUDED.household_name,
                address = EXCLUDED.address
            """,
            (household_uuid, household_name, address),
        )

        # Process members in household
        for member in household.get('members', []):
            member_uuid = member.get('uuid')
            if not member_uuid:
                continue

            # Parse name
            preferred_name = member.get('preferredName', '')
            given_name = member.get('givenName', '')
            display_name = member.get('displayName', '')

            # Try to extract first/last name
            if ',' in display_name:
                parts = display_name.split(',', 1)
                last_name = parts[0].strip()
                first_name = parts[1].strip().split()[0] if parts[1].strip() else given_name
            else:
                first_name = given_name
                last_name = household_name.split(',')[0] if household_name else ''

            # Contact info
            email = None
            emails = member.get('emails', [])
            if emails and isinstance(emails, list):
                email = emails[0].get('email') if isinstance(emails[0], dict) else emails[0]

            phone = None
            phones = member.get('phones', [])
            if phones and isinstance(phones, list):
                phone = phones[0].get('e164') if isinstance(phones[0], dict) else phones[0]

            # Birth date (format: "--MM-DD" for privacy, or full date)
            birth_date = member.get('birthDate')
            age = None
            if birth_date and not birth_date.startswith('--'):
                try:
                    bd = datetime.strptime(birth_date, '%Y-%m-%d')
                    age = (datetime.now() - bd).days // 365
                except:
                    pass

            # Classifications
            classifications = member.get('classifications', [])
            is_adult = 'HEAD' in classifications or 'SPOUSE' in classifications

            # Gender (not directly available, could infer from positions)
            gender = None

            # Upsert member
            cur.execute(
                """
                INSERT INTO members (
                    id, household_id, first_name, last_name,
                    email, phone, gender, age, is_active
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    household_id = EXCLUDED.household_id,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    gender = COALESCE(EXCLUDED.gender, members.gender),
                    age = COALESCE(EXCLUDED.age, members.age),
                    is_active = EXCLUDED.is_active
                RETURNING id
                """,
                (
                    member_uuid,
                    household_uuid,
                    first_name,
                    last_name,
                    email,
                    phone,
                    gender,
                    age,
                    is_adult,
                ),
            )

            returned_id = cur.fetchone()[0]
            member_uuid_map[member_uuid] = returned_id

    conn.commit()
    cur.close()

    print(f"Synced {len(member_uuid_map)} members from {len(households)} households")
    return member_uuid_map


def sync_organizations_and_callings(data: Dict, conn, member_uuid_map: Dict[str, str]):
    """Sync organizations and callings from membertools data."""
    cur = conn.cursor()

    organizations = data.get('organizations', [])
    print(f"Processing {len(organizations)} organizations...")

    def get_or_create_org(name: str, parent_id: Optional[str] = None) -> str:
        cur.execute(
            """SELECT id FROM organizations WHERE name = %s AND COALESCE(parent_org_id::text,'') = COALESCE(%s,'') LIMIT 1""",
            (name, str(parent_id) if parent_id else None),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            """INSERT INTO organizations (name, parent_org_id) VALUES (%s, %s) RETURNING id""",
            (name, parent_id),
        )
        return cur.fetchone()[0]

    def get_or_create_calling(org_id: str, title: str) -> str:
        cur.execute(
            """SELECT id FROM callings WHERE organization_id = %s AND title = %s LIMIT 1""",
            (org_id, title),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        cur.execute(
            """INSERT INTO callings (organization_id, title, requires_setting_apart) VALUES (%s, %s, true) RETURNING id""",
            (org_id, title),
        )
        return cur.fetchone()[0]

    for org in organizations:
        org_name = org.get('name', 'Unknown')
        unit_number = org.get('unitNumber')

        org_id = get_or_create_org(org_name)

        # Process callings (positions) in this organization
        for position in org.get('positions', []):
            calling_title = position.get('name', 'Unknown Position')
            calling_id = get_or_create_calling(org_id, calling_title)

            # Check if someone is assigned
            holder_uuid = position.get('memberUuid')
            active_date = position.get('activeDate')
            set_apart = position.get('setApart', False)

            if holder_uuid and holder_uuid in member_uuid_map:
                member_db_id = member_uuid_map[holder_uuid]

                # Parse active date
                sustained_date = None
                if active_date:
                    try:
                        sustained_date = datetime.strptime(str(active_date), '%Y%m%d').date()
                    except:
                        try:
                            sustained_date = datetime.strptime(str(active_date), '%Y-%m-%d').date()
                        except:
                            pass

                # Deactivate other assignments for this calling
                cur.execute(
                    """
                    UPDATE calling_assignments
                    SET is_active = false
                    WHERE calling_id = %s AND is_active = true AND member_id <> %s
                    """,
                    (calling_id, member_db_id),
                )

                # Upsert assignment
                cur.execute(
                    """SELECT id FROM calling_assignments WHERE calling_id = %s AND member_id = %s LIMIT 1""",
                    (calling_id, member_db_id),
                )
                existing = cur.fetchone()

                if existing:
                    cur.execute(
                        """
                        UPDATE calling_assignments
                        SET is_active = true,
                            sustained_date = COALESCE(%s, sustained_date),
                            set_apart_date = COALESCE(%s, set_apart_date)
                        WHERE id = %s
                        """,
                        (
                            sustained_date,
                            datetime.today().date() if set_apart else None,
                            existing[0],
                        ),
                    )
                else:
                    cur.execute(
                        """
                        INSERT INTO calling_assignments (
                            calling_id, member_id, is_active, assigned_date, sustained_date, set_apart_date
                        ) VALUES (%s, %s, true, %s, %s, %s)
                        """,
                        (
                            calling_id,
                            member_db_id,
                            sustained_date or datetime.today().date(),
                            sustained_date,
                            datetime.today().date() if set_apart else None,
                        ),
                    )

    conn.commit()
    cur.close()
    print(f"Synced {len(organizations)} organizations with callings")


def print_youth_interviews_summary(data: Dict, member_uuid_map: Dict[str, str]):
    """Print summary of youth interviews (for now, until we add DB tables)."""
    interviews = data.get('actionInterviews', [])

    print("\n" + "=" * 60)
    print("YOUTH INTERVIEWS SUMMARY")
    print("=" * 60)

    byi_count = 0
    bcyi_count = 0

    for interview in interviews:
        itype = interview.get('type', '')
        members = interview.get('members', [])

        if 'BISHOP_YOUTH_INTERVIEW' in itype:
            byi_count += len(members)
        elif 'COUNSELOR_YOUTH_INTERVIEW' in itype:
            bcyi_count += len(members)

    print(f"Bishop Youth Interviews (BYI): {byi_count} youth")
    print(f"Bishopric Counselor Youth Interviews (BCYI): {bcyi_count} youth")

    # Detailed breakdown
    print("\nDetailed breakdown:")
    for interview in interviews:
        itype = interview.get('type', '')
        members = interview.get('members', [])
        if members:
            print(f"  {itype}: {len(members)}")


def print_temple_recommend_summary(data: Dict, member_uuid_map: Dict[str, str]):
    """Print summary of temple recommend status (for now, until we add DB tables)."""
    tr_data = data.get('templeRecommendStatus', [])

    print("\n" + "=" * 60)
    print("TEMPLE RECOMMEND STATUS SUMMARY")
    print("=" * 60)

    if not tr_data:
        print("No temple recommend data available")
        return

    all_recommends = []
    for unit_data in tr_data:
        all_recommends.extend(unit_data.get('recommends', []))

    # Count by status
    active = sum(1 for r in all_recommends if r.get('status') == 'ACTIVE')
    expired = sum(1 for r in all_recommends if r.get('status') == 'EXPIRED')
    expiring_soon = 0

    # Check for expiring in next 3 months
    today = datetime.today()
    for r in all_recommends:
        exp = r.get('expiration', '')
        if exp and r.get('status') == 'ACTIVE':
            try:
                exp_date = datetime.strptime(exp, '%Y-%m')
                months_until = (exp_date.year - today.year) * 12 + (exp_date.month - today.month)
                if 0 <= months_until <= 3:
                    expiring_soon += 1
            except:
                pass

    print(f"Active recommends: {active}")
    print(f"Expired recommends: {expired}")
    print(f"Expiring in next 3 months: {expiring_soon}")


# =============================================================================
# Main
# =============================================================================

def main():
    """Main sync function."""
    print("=" * 60)
    print("Membertools API Sync (OAuth2)")
    print("=" * 60)

    try:
        # Initialize OAuth client
        print("\nInitializing OAuth client...")
        client = OAuthClient(TOKENS_FILE)

        # Verify authentication
        print("\nVerifying authentication...")
        user = client.get_user()
        print(f"Authenticated as: {user.get('preferredName')} ({user.get('username')})")
        print(f"Home unit: {user.get('homeUnits', [])}")

        # Fetch all data
        print("\nFetching data from Membertools API...")
        data = client.sync()

        print(f"\nData received:")
        print(f"  Households: {len(data.get('households', []))}")
        print(f"  Organizations: {len(data.get('organizations', []))}")
        print(f"  Action Interviews: {len(data.get('actionInterviews', []))}")
        print(f"  Temple Recommend Records: {len(data.get('templeRecommendStatus', []))}")

        if DRY_RUN:
            print("\nDRY_RUN=1: Skipping database writes")
            print_youth_interviews_summary(data, {})
            print_temple_recommend_summary(data, {})
        else:
            # Connect to database
            print("\nConnecting to database...")
            conn = get_db_connection()
            print("Connected to database")

            # Sync members and households
            member_uuid_map = sync_members_and_households(data, conn)

            # Sync organizations and callings
            sync_organizations_and_callings(data, conn, member_uuid_map)

            # Print summaries for new data types (until we add DB tables)
            print_youth_interviews_summary(data, member_uuid_map)
            print_temple_recommend_summary(data, member_uuid_map)

            conn.close()

        print("\n" + "=" * 60)
        print("Sync completed successfully!")
        print("=" * 60)

    except FileNotFoundError as e:
        print(f"\n{e}")
        sys.exit(1)
    except requests.exceptions.HTTPError as e:
        print(f"\nHTTP Error: {e}")
        print("\nYour refresh token may have expired. Please re-authenticate.")
        sys.exit(1)
    except Exception as e:
        print(f"\nError during sync: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
