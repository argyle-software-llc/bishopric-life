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

def sync_members_and_households(data: Dict, conn, home_unit: int = None) -> Dict[str, str]:
    """
    Sync members and households from membertools data.
    Returns a mapping of member_uuid -> database_id

    Args:
        data: The sync data from membertools API
        conn: Database connection
        home_unit: If provided, only sync this unit number (ward)
    """
    cur = conn.cursor()
    member_uuid_map = {}

    households = data.get('households', [])

    # Filter to home unit if specified
    if home_unit:
        households = [h for h in households if h.get('unitNumber') == home_unit]
        print(f"Filtering to unit {home_unit}: {len(households)} households")
    else:
        print(f"Processing {len(households)} households...")

    for household in households:
        household_uuid = household.get('uuid')
        unit_number = household.get('unitNumber')

        if not household_uuid:
            continue

        # Get household name from nested 'names' object
        names = household.get('names', {}) or {}
        household_name = names.get('listed') or names.get('family')

        # Get address from nested 'addresses' array
        addresses = household.get('addresses', [])
        address = None
        if addresses and isinstance(addresses, list) and addresses[0]:
            address = addresses[0].get('formatted')

        # Skip households without names (can't insert null)
        if not household_name:
            # Try to get name from first member
            members = household.get('members', [])
            if members:
                first_member = members[0]
                member_names = first_member.get('names', {}) or {}
                household_name = member_names.get('spoken') or member_names.get('listed') or 'Unknown'
            else:
                household_name = 'Unknown'

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

            # Parse name from nested 'names' object
            member_names = member.get('names', {}) or {}
            parts = member_names.get('parts', {}) or {}

            # Extract first and last name
            given_name = parts.get('given', '')
            spoken_name = member_names.get('spoken', '')
            listed_name = member_names.get('listed', '')

            # Try to extract first/last name
            if listed_name and ',' in listed_name:
                name_parts = listed_name.split(',', 1)
                last_name = name_parts[0].strip()
                first_name = name_parts[1].strip().split()[0] if name_parts[1].strip() else given_name
            elif spoken_name:
                # "Chris Alleman" -> first="Chris", last="Alleman"
                spoken_parts = spoken_name.split()
                first_name = spoken_parts[0] if spoken_parts else given_name
                last_name = ' '.join(spoken_parts[1:]) if len(spoken_parts) > 1 else ''
            else:
                first_name = given_name
                # Get family name from household
                hh_names = household.get('names', {}) or {}
                last_name = hh_names.get('family', '')

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


def sync_organizations_and_callings(data: Dict, conn, member_uuid_map: Dict[str, str], home_unit: int = None):
    """Sync organizations and callings from membertools data.

    Note: In membertools API, calling positions are stored within each member's
    'positions' array, not in the organizations structure. The organizations
    only contain UUIDs referencing positions.

    Args:
        data: The sync data from membertools API
        conn: Database connection
        member_uuid_map: Mapping of member UUID to database ID
        home_unit: If provided, only sync positions for this unit number (ward)
    """
    cur = conn.cursor()

    organizations = data.get('organizations', [])
    households = data.get('households', [])

    # Filter households to home unit if specified
    if home_unit:
        households = [h for h in households if h.get('unitNumber') == home_unit]
    print(f"Processing {len(organizations)} organizations...")

    # Org type to display name mapping
    ORG_TYPE_NAMES = {
        'BISHOPRIC': 'Bishopric',
        'ELDERS_QUORUM': 'Elders Quorum',
        'RELIEF_SOCIETY': 'Relief Society',
        'YOUNG_MEN': 'Young Men',
        'YOUNG_WOMEN': 'Young Women',
        'PRIMARY': 'Primary',
        'SUNDAY_SCHOOL': 'Sunday School',
        'HIGH_PRIEST': 'High Priests',
        'MUSIC': 'Music',
    }

    # Position name patterns to organization mapping (for fallback when type doesn't match)
    POSITION_NAME_TO_ORG = {
        # Bishopric
        'Bishop': 'Bishopric',
        'Ward Clerk': 'Bishopric',
        'Ward Executive Secretary': 'Bishopric',
        'Assistant Ward Clerk': 'Bishopric',
        'Assistant Clerk': 'Bishopric',
        # Young Men (Aaronic Priesthood)
        'Deacons Quorum': 'Young Men',
        'Teachers Quorum': 'Young Men',
        'Priests Quorum': 'Young Men',
        'Aaronic Priesthood': 'Young Men',
        # Primary
        'Nursery': 'Primary',
        # Music
        'Music': 'Music',
        'Choir': 'Music',
        'Organist': 'Music',
        'Pianist': 'Music',
        'Accompanist': 'Music',
        # Other
        'Ward Mission': 'Other',
        'Ward Missionary': 'Other',
        'Temple and Family History': 'Other',
        'Activities Committee': 'Other',
        'Building Representative': 'Other',
    }

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

    # First, create organizations from the org structure
    for org in organizations:
        org_name = org.get('name', 'Unknown')
        get_or_create_org(org_name)

    # Now extract callings from member positions
    # Positions are stored in each member's 'positions' array
    callings_processed = 0
    for household in households:
        for member in household.get('members', []):
            member_uuid = member.get('uuid')
            if not member_uuid or member_uuid not in member_uuid_map:
                continue

            member_db_id = member_uuid_map[member_uuid]

            for position in member.get('positions', []):
                if not isinstance(position, dict):
                    continue

                # Filter positions to home unit if specified
                position_unit = position.get('unitNumber')
                if home_unit and position_unit and position_unit != home_unit:
                    continue

                position_name = position.get('name', 'Unknown Position')
                position_type = position.get('type', '')
                unit_name = position.get('unitName', '')
                active_date = position.get('activeDate')
                set_apart = position.get('setApart', False)

                # Parse active date
                sustained_date = None
                if active_date:
                    try:
                        sustained_date = datetime.strptime(str(active_date), '%Y-%m-%d').date()
                    except:
                        pass

                # Determine organization name from position type, position name, or unit name
                org_name = None

                # First try to match position type to org
                for org_type, display_name in ORG_TYPE_NAMES.items():
                    if org_type in position_type.upper():
                        org_name = display_name
                        break

                # If no match, try to match position name patterns
                if not org_name:
                    for pattern, target_org in POSITION_NAME_TO_ORG.items():
                        if pattern.lower() in position_name.lower():
                            org_name = target_org
                            break

                # Final fallback: use unit name or "Other"
                if not org_name:
                    org_name = 'Other'

                org_id = get_or_create_org(org_name)
                calling_id = get_or_create_calling(org_id, position_name)

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
                            assigned_date = COALESCE(%s, assigned_date),
                            sustained_date = COALESCE(%s, sustained_date),
                            set_apart_date = CASE WHEN %s THEN COALESCE(set_apart_date, %s) ELSE set_apart_date END
                        WHERE id = %s
                        """,
                        (
                            sustained_date,
                            sustained_date,
                            set_apart,
                            sustained_date,
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
                            sustained_date if set_apart else None,
                        ),
                    )
                callings_processed += 1

    conn.commit()
    cur.close()
    print(f"Synced {len(organizations)} organizations, {callings_processed} calling assignments")

    # Ensure all standard ward callings exist (including vacant ones)
    sync_standard_callings(conn)


def sync_standard_callings(conn):
    """Ensure all standard ward callings exist in the database.

    This creates callings from a seed file to ensure vacant positions
    are tracked even if no one currently holds them.

    Args:
        conn: Database connection
    """
    cur = conn.cursor()

    # Load seed file
    seed_file = Path(__file__).parent / 'ward_callings_seed.json'
    if not seed_file.exists():
        print("Warning: ward_callings_seed.json not found, skipping standard callings sync")
        return

    with open(seed_file, 'r') as f:
        seed_data = json.load(f)

    def get_or_create_org(name: str, display_order: int = 50) -> str:
        cur.execute(
            """SELECT id FROM organizations WHERE name = %s LIMIT 1""",
            (name,),
        )
        row = cur.fetchone()
        if row:
            # Update display_order if it exists
            cur.execute(
                """UPDATE organizations SET display_order = %s WHERE id = %s""",
                (display_order, row[0]),
            )
            return row[0]
        cur.execute(
            """INSERT INTO organizations (name, display_order) VALUES (%s, %s) RETURNING id""",
            (name, display_order),
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

    callings_created = 0
    for org_data in seed_data.get('organizations', []):
        org_name = org_data.get('name')
        if not org_name:
            continue

        display_order = org_data.get('display_order', 50)
        org_id = get_or_create_org(org_name, display_order)

        for calling_title in org_data.get('callings', []):
            calling_id = get_or_create_calling(org_id, calling_title)
            callings_created += 1

    conn.commit()
    cur.close()
    print(f"Ensured {callings_created} standard callings exist")


def sync_youth_interviews(data: Dict, conn, member_uuid_map: Dict[str, str]):
    """Sync youth interview data to the database."""
    interviews = data.get('actionInterviews', [])
    cur = conn.cursor()

    # Clear existing interview records (we'll re-sync fresh each time)
    cur.execute("DELETE FROM youth_interviews")

    byi_count = 0
    bcyi_count = 0

    for interview in interviews:
        itype = interview.get('type', '')
        members = interview.get('members', [])

        # Determine interview type
        if 'BISHOP_YOUTH_INTERVIEW' in itype:
            interview_type = 'BYI'
        elif 'COUNSELOR_YOUTH_INTERVIEW' in itype:
            interview_type = 'BCYI'
        else:
            # Skip non-youth interviews
            continue

        for member_data in members:
            member_uuid = member_data.get('uuid')
            if not member_uuid or member_uuid not in member_uuid_map:
                continue

            member_db_id = member_uuid_map[member_uuid]

            try:
                cur.execute(
                    """
                    INSERT INTO youth_interviews (member_id, interview_type, api_interview_type, is_due)
                    VALUES (%s, %s, %s, true)
                    ON CONFLICT (member_id, interview_type) DO UPDATE
                    SET api_interview_type = EXCLUDED.api_interview_type,
                        is_due = true,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (member_db_id, interview_type, itype)
                )
                if interview_type == 'BYI':
                    byi_count += 1
                else:
                    bcyi_count += 1
            except Exception as e:
                print(f"  Warning: Could not insert interview for member {member_uuid}: {e}")

    conn.commit()
    cur.close()

    print(f"\nYouth Interviews synced:")
    print(f"  Bishop Youth Interviews (BYI): {byi_count} youth")
    print(f"  Bishopric Counselor Youth Interviews (BCYI): {bcyi_count} youth")


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

        home_units = user.get('homeUnits', [])
        home_unit = home_units[0] if home_units else None
        print(f"Home unit: {home_unit}")

        if DRY_RUN:
            print("\nDRY_RUN=1: Skipping database writes")
            # Just print summaries in dry run mode
            interviews = data.get('actionInterviews', [])
            byi = sum(len(i.get('members', [])) for i in interviews if 'BISHOP_YOUTH_INTERVIEW' in i.get('type', ''))
            bcyi = sum(len(i.get('members', [])) for i in interviews if 'COUNSELOR_YOUTH_INTERVIEW' in i.get('type', ''))
            print(f"\nYouth Interviews (dry run):")
            print(f"  BYI: {byi}, BCYI: {bcyi}")
            print_temple_recommend_summary(data, {})
        else:
            # Connect to database
            print("\nConnecting to database...")
            conn = get_db_connection()
            print("Connected to database")

            # Sync members and households (filtered to home unit)
            member_uuid_map = sync_members_and_households(data, conn, home_unit)

            # Sync organizations and callings (filtered to home unit)
            sync_organizations_and_callings(data, conn, member_uuid_map, home_unit)

            # Sync youth interviews
            sync_youth_interviews(data, conn, member_uuid_map)

            # Print temple recommend summary (until we add DB tables)
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
