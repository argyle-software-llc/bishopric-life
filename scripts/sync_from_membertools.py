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


def get_calling_display_order(title: str) -> int:
    """
    Determine display order for a calling based on its title.
    Lower numbers appear first. Typical org structure:
    1-9: Leadership (President, Bishop, Counselors)
    10-19: Administrative (Secretary, Clerk)
    20-29: Instructors/Teachers
    30-39: Coordinators/Committee
    40-49: Advisors/Specialists
    50+: Other positions
    """
    title_lower = title.lower()

    # Leadership positions (1-9)
    if 'bishop' in title_lower and 'counselor' not in title_lower:
        return 1
    if 'president' in title_lower and 'counselor' not in title_lower:
        return 1
    if 'first counselor' in title_lower:
        return 2
    if 'second counselor' in title_lower:
        return 3
    if '1st counselor' in title_lower:
        return 2
    if '2nd counselor' in title_lower:
        return 3
    # "Leader" positions (like Ward Mission Leader, Temple and Family History Leader)
    if 'leader' in title_lower and 'adult' not in title_lower:
        return 5

    # Administrative positions (10-19)
    if 'secretary' in title_lower and 'executive' in title_lower:
        return 10
    if 'secretary' in title_lower:
        return 11
    if 'clerk' in title_lower and 'assistant' not in title_lower:
        return 12
    if 'assistant' in title_lower and 'clerk' in title_lower:
        return 13

    # Instructors/Teachers (20-29)
    if 'instructor' in title_lower:
        return 20
    if 'teacher' in title_lower:
        return 21

    # Coordinators/Committee (30-39)
    if 'coordinator' in title_lower:
        return 30
    if 'committee' in title_lower:
        return 31

    # Advisors/Specialists (40-49)
    if 'advisor' in title_lower or 'adviser' in title_lower:
        return 40
    if 'specialist' in title_lower:
        return 41

    # Music positions (specific ordering)
    if 'chorister' in title_lower or 'music chairman' in title_lower:
        return 25
    if 'organist' in title_lower or 'pianist' in title_lower:
        return 26
    if 'choir' in title_lower and 'director' in title_lower:
        return 24
    if 'choir' in title_lower:
        return 27

    # Default
    return 50

# Database configuration - use POSTGRES_* env vars if available (Docker), fallback to local defaults
DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'ward_callings'),
    'user': os.getenv('POSTGRES_USER', os.getenv('USER', '')),
    'password': os.getenv('POSTGRES_PASSWORD', ''),
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', '5432')),
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
# In-Flight Detection Functions
# =============================================================================

def capture_pre_sync_snapshot(conn):
    """
    Capture the current state of calling assignments before sync.

    This snapshot is used to detect "in-flight" callings - assignments that
    changed in MemberTools but weren't initiated through our app.
    """
    cur = conn.cursor()

    print("\nCapturing pre-sync calling snapshot...")

    # Clear old snapshot
    cur.execute("DELETE FROM pre_sync_calling_snapshot")

    # Capture current state of active calling assignments
    # Include expected_release_date and release_notes to preserve user-entered data
    cur.execute("""
        INSERT INTO pre_sync_calling_snapshot (
            calling_org_name, calling_title, member_church_id,
            member_first_name, member_last_name,
            sustained_date, set_apart_date, is_active,
            expected_release_date, release_notes
        )
        SELECT
            o.name as calling_org_name,
            c.title as calling_title,
            m.church_id as member_church_id,
            m.first_name,
            m.last_name,
            ca.sustained_date,
            ca.set_apart_date,
            ca.is_active,
            ca.expected_release_date,
            ca.release_notes
        FROM calling_assignments ca
        JOIN callings c ON ca.calling_id = c.id
        JOIN organizations o ON c.organization_id = o.id
        JOIN members m ON ca.member_id = m.id
        WHERE ca.is_active = true
          AND m.church_id IS NOT NULL
    """)

    snapshot_count = cur.rowcount
    conn.commit()
    cur.close()

    print(f"  - Captured {snapshot_count} active calling assignments")


def detect_in_flight_callings(conn):
    """
    Detect calling changes that happened in MemberTools but weren't initiated
    through our app.

    Detects two types:
    1. New assignments - People who appear in callings after sync but we have
       no calling_change record for them (possibly sustained externally)
    2. Releases - People who were in the snapshot but are no longer assigned
       (released externally)
    """
    cur = conn.cursor()

    print("\nDetecting in-flight callings...")

    new_assignments = 0
    releases = 0

    # -------------------------------------------------------------------------
    # Detect NEW ASSIGNMENTS
    # Find members now in callings that weren't in the pre-sync snapshot
    # and don't already have a calling_change tracking them
    # -------------------------------------------------------------------------
    cur.execute("""
        SELECT
            c.id as calling_id,
            o.name as org_name,
            c.title as calling_title,
            m.id as member_id,
            m.church_id as member_church_id,
            m.first_name,
            m.last_name,
            ca.sustained_date,
            ca.set_apart_date
        FROM calling_assignments ca
        JOIN callings c ON ca.calling_id = c.id
        JOIN organizations o ON c.organization_id = o.id
        JOIN members m ON ca.member_id = m.id
        WHERE ca.is_active = true
          AND m.church_id IS NOT NULL
          -- Not in pre-sync snapshot (new assignment)
          AND NOT EXISTS (
              SELECT 1 FROM pre_sync_calling_snapshot pss
              WHERE pss.calling_org_name = o.name
                AND pss.calling_title = c.title
                AND pss.member_church_id = m.church_id
          )
          -- No existing calling_change tracking this assignment
          AND NOT EXISTS (
              SELECT 1 FROM calling_changes cc
              WHERE cc.calling_org_name = o.name
                AND cc.calling_title = c.title
                AND cc.new_member_church_id = m.church_id
                AND cc.status != 'completed'
          )
    """)

    new_assignment_rows = cur.fetchall()

    for row in new_assignment_rows:
        (calling_id, org_name, calling_title, member_id, member_church_id,
         first_name, last_name, sustained_date, set_apart_date) = row

        print(f"  - New assignment detected: {first_name} {last_name} -> {calling_title} ({org_name})")

        create_in_flight_calling_change(
            conn=conn,
            calling_id=calling_id,
            calling_org_name=org_name,
            calling_title=calling_title,
            new_member_id=member_id,
            new_member_church_id=member_church_id,
            current_member_id=None,
            current_member_church_id=None,
            sustained_date=sustained_date,
            set_apart_date=set_apart_date,
            is_release=False
        )
        new_assignments += 1

    # -------------------------------------------------------------------------
    # Detect RELEASES
    # Find members who were in the snapshot but are no longer in any calling
    # with the same org/title combination
    # -------------------------------------------------------------------------
    cur.execute("""
        SELECT
            pss.calling_org_name,
            pss.calling_title,
            pss.member_church_id,
            pss.member_first_name,
            pss.member_last_name,
            c.id as calling_id,
            m.id as member_id
        FROM pre_sync_calling_snapshot pss
        -- Find the current calling record (if exists)
        LEFT JOIN organizations o ON o.name = pss.calling_org_name
        LEFT JOIN callings c ON c.organization_id = o.id AND c.title = pss.calling_title
        LEFT JOIN members m ON m.church_id = pss.member_church_id
        WHERE pss.is_active = true
          -- Member no longer has this calling
          AND NOT EXISTS (
              SELECT 1 FROM calling_assignments ca2
              JOIN callings c2 ON ca2.calling_id = c2.id
              JOIN organizations o2 ON c2.organization_id = o2.id
              JOIN members m2 ON ca2.member_id = m2.id
              WHERE o2.name = pss.calling_org_name
                AND c2.title = pss.calling_title
                AND m2.church_id = pss.member_church_id
                AND ca2.is_active = true
          )
          -- No existing calling_change tracking this release
          AND NOT EXISTS (
              SELECT 1 FROM calling_changes cc
              WHERE cc.calling_org_name = pss.calling_org_name
                AND cc.calling_title = pss.calling_title
                AND cc.current_member_church_id = pss.member_church_id
                AND cc.status != 'completed'
          )
    """)

    release_rows = cur.fetchall()

    for row in release_rows:
        (org_name, calling_title, member_church_id, first_name, last_name,
         calling_id, member_id) = row

        if calling_id is None or member_id is None:
            # Calling or member no longer exists - skip
            continue

        print(f"  - Release detected: {first_name} {last_name} from {calling_title} ({org_name})")

        create_in_flight_calling_change(
            conn=conn,
            calling_id=calling_id,
            calling_org_name=org_name,
            calling_title=calling_title,
            new_member_id=None,
            new_member_church_id=None,
            current_member_id=member_id,
            current_member_church_id=member_church_id,
            sustained_date=None,
            set_apart_date=None,
            is_release=True
        )
        releases += 1

    conn.commit()
    cur.close()

    print(f"  Done. New assignments: {new_assignments}, Releases: {releases}")


def create_in_flight_calling_change(conn, calling_id, calling_org_name, calling_title,
                                     new_member_id, new_member_church_id,
                                     current_member_id, current_member_church_id,
                                     sustained_date, set_apart_date, is_release):
    """
    Create a calling_change record for an auto-detected in-flight calling.

    Also creates the appropriate tasks:
    - For new assignments: set_apart (if needed) + notify_organization
    - For releases: notify_organization only
    """
    cur = conn.cursor()

    # Create the calling_change record
    cur.execute("""
        INSERT INTO calling_changes (
            calling_id, calling_org_name, calling_title,
            new_member_id, new_member_church_id,
            current_member_id, current_member_church_id,
            status, source, detected_at, created_date
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'in_flight', 'auto_detected', CURRENT_TIMESTAMP, CURRENT_DATE)
        RETURNING id
    """, (
        calling_id, calling_org_name, calling_title,
        new_member_id, new_member_church_id,
        current_member_id, current_member_church_id
    ))

    calling_change_id = cur.fetchone()[0]

    if is_release:
        # For releases, just create notify_organization task
        cur.execute("""
            INSERT INTO tasks (
                calling_change_id, task_type, member_id, member_church_id,
                status, notes
            ) VALUES (%s, 'notify_organization', %s, %s, 'pending', %s)
        """, (calling_change_id, current_member_id, current_member_church_id, calling_org_name))
    else:
        # For new assignments, create set_apart (if needed), record_set_apart, and notify_organization
        if set_apart_date is None:
            cur.execute("""
                INSERT INTO tasks (
                    calling_change_id, task_type, member_id, member_church_id,
                    status
                ) VALUES (%s, 'set_apart', %s, %s, 'pending')
            """, (calling_change_id, new_member_id, new_member_church_id))

            cur.execute("""
                INSERT INTO tasks (
                    calling_change_id, task_type, member_id, member_church_id,
                    status
                ) VALUES (%s, 'record_set_apart', %s, %s, 'pending')
            """, (calling_change_id, new_member_id, new_member_church_id))

        # Always notify the organization
        cur.execute("""
            INSERT INTO tasks (
                calling_change_id, task_type, member_id, member_church_id,
                status, notes
            ) VALUES (%s, 'notify_organization', %s, %s, 'pending', %s)
        """, (calling_change_id, new_member_id, new_member_church_id, calling_org_name))

    cur.close()


# =============================================================================
# Hard Refresh Functions
# =============================================================================

def hard_refresh_synced_tables(conn):
    """
    Clear synced tables before re-inserting fresh data.

    Tables cleared (in order to respect foreign keys):
    - calling_assignments (leaf)
    - youth_interviews (leaf)
    - callings (depends on orgs)
    - organizations (root)

    Members and households are NOT cleared because they use stable LCR UUIDs
    and app data references them by church_id natural key.
    """
    cur = conn.cursor()

    print("\nClearing synced tables for fresh data...")

    # Clear in order of dependencies
    cur.execute("DELETE FROM calling_assignments")
    print(f"  - Cleared calling_assignments")

    cur.execute("DELETE FROM youth_interviews")
    print(f"  - Cleared youth_interviews")

    cur.execute("DELETE FROM callings")
    print(f"  - Cleared callings")

    cur.execute("DELETE FROM organizations")
    print(f"  - Cleared organizations")

    conn.commit()
    cur.close()
    print("  Done.")


def relink_cached_ids(conn):
    """
    Re-link cached UUID references in app tables after sync.

    App tables store natural keys (org_name, calling_title, church_id) which
    are stable across syncs. This function updates the cached UUID references
    to point to the newly synced records.
    """
    cur = conn.cursor()

    print("\nRe-linking cached IDs in app tables...")

    # Re-link calling_changes.calling_id
    cur.execute("""
        UPDATE calling_changes cc SET calling_id = c.id
        FROM callings c
        JOIN organizations o ON c.organization_id = o.id
        WHERE o.name = cc.calling_org_name
          AND c.title = cc.calling_title
          AND cc.calling_org_name IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} calling_changes.calling_id")

    # Re-link calling_changes.new_member_id
    cur.execute("""
        UPDATE calling_changes cc SET new_member_id = m.id
        FROM members m
        WHERE m.church_id = cc.new_member_church_id
          AND cc.new_member_church_id IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} calling_changes.new_member_id")

    # Re-link calling_changes.current_member_id
    cur.execute("""
        UPDATE calling_changes cc SET current_member_id = m.id
        FROM members m
        WHERE m.church_id = cc.current_member_church_id
          AND cc.current_member_church_id IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} calling_changes.current_member_id")

    # Re-link calling_considerations.member_id
    cur.execute("""
        UPDATE calling_considerations cc SET member_id = m.id
        FROM members m
        WHERE m.church_id = cc.member_church_id
          AND cc.member_church_id IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} calling_considerations.member_id")

    # Re-link tasks.member_id
    cur.execute("""
        UPDATE tasks t SET member_id = m.id
        FROM members m
        WHERE m.church_id = t.member_church_id
          AND t.member_church_id IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} tasks.member_id")

    # Re-link member_calling_needs.member_id
    cur.execute("""
        UPDATE member_calling_needs mcn SET member_id = m.id
        FROM members m
        WHERE m.church_id = mcn.member_church_id
          AND mcn.member_church_id IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} member_calling_needs.member_id")

    # Re-link bishopric_stewardships.organization_id
    cur.execute("""
        UPDATE bishopric_stewardships bs SET organization_id = o.id
        FROM organizations o
        WHERE o.name = bs.organization_name
          AND bs.organization_name IS NOT NULL
    """)
    print(f"  - Re-linked {cur.rowcount} bishopric_stewardships.organization_id")

    conn.commit()
    cur.close()
    print("  Done.")


def restore_user_entered_data(conn):
    """
    Restore user-entered data from the pre-sync snapshot.

    This preserves data that users manually entered, such as:
    - expected_release_date: When the bishopric expects to release someone
    - release_notes: Notes about why/when someone will be released

    This data is not provided by MemberTools API, so we must preserve it across syncs.
    """
    cur = conn.cursor()

    print("\nRestoring user-entered data from snapshot...")

    # Restore expected_release_date and release_notes from snapshot
    cur.execute("""
        UPDATE calling_assignments ca
        SET expected_release_date = pss.expected_release_date,
            release_notes = pss.release_notes
        FROM pre_sync_calling_snapshot pss, members m, callings c, organizations o
        WHERE m.church_id = pss.member_church_id
          AND ca.calling_id = c.id
          AND c.organization_id = o.id
          AND ca.member_id = m.id
          AND o.name = pss.calling_org_name
          AND c.title = pss.calling_title
          AND (pss.expected_release_date IS NOT NULL OR pss.release_notes IS NOT NULL)
    """)

    restored_count = cur.rowcount
    conn.commit()
    cur.close()

    print(f"  - Restored release data for {restored_count} calling assignments")


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

            # Get numeric church ID (CMIS ID) - this is the stable identifier
            church_id = member.get('legacyCmisId') or member.get('id')
            # Ensure it's numeric if it's a string representation
            if church_id and isinstance(church_id, str) and church_id.isdigit():
                church_id = int(church_id)
            elif church_id and not isinstance(church_id, int):
                church_id = None  # Skip non-numeric IDs

            # Upsert member
            cur.execute(
                """
                INSERT INTO members (
                    id, household_id, first_name, last_name,
                    email, phone, gender, age, is_active, church_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    household_id = EXCLUDED.household_id,
                    first_name = EXCLUDED.first_name,
                    last_name = EXCLUDED.last_name,
                    email = EXCLUDED.email,
                    phone = EXCLUDED.phone,
                    gender = COALESCE(EXCLUDED.gender, members.gender),
                    age = COALESCE(EXCLUDED.age, members.age),
                    is_active = EXCLUDED.is_active,
                    church_id = COALESCE(EXCLUDED.church_id, members.church_id)
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
                    church_id,
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

    # Build position UUID → org name lookup by traversing the org hierarchy
    # This captures age-group specific orgs like "Young Women 12-15"
    position_to_org_map: Dict[str, str] = {}

    # Generic sub-org names that need parent prefix to avoid collisions
    # (e.g., both Elders Quorum and Relief Society have "Teachers", "Activities", "Service")
    GENERIC_SUBORG_NAMES = ['Teachers', 'Activities', 'Service', 'Ministering']

    def traverse_org_hierarchy(org: Dict, parent_org_name: Optional[str] = None):
        """Recursively traverse org hierarchy and map position UUIDs to org names."""
        org_name = org.get('name', 'Unknown')

        # For class presidencies and adult leaders, use the parent org name (the age group)
        # e.g., "Young Women Class Presidency" under "Young Women 12-15" → use "Young Women 12-15"
        effective_org_name = org_name
        if parent_org_name and any(keyword in org_name for keyword in [
            'Class Presidency', 'Class Adult Leaders', 'Additional Callings',
            'Quorum Presidency', 'Quorum Adult Leaders'
        ]):
            effective_org_name = parent_org_name
        # For generic sub-org names, prefix with parent to avoid collisions
        elif parent_org_name and org_name in GENERIC_SUBORG_NAMES:
            effective_org_name = f"{parent_org_name} - {org_name}"

        # Map each position UUID to this org
        for position_uuid in org.get('positions', []):
            position_to_org_map[position_uuid] = effective_org_name

        # Recurse into child orgs, passing current org name as parent
        for child_org in org.get('childOrgs', []):
            traverse_org_hierarchy(child_org, org_name)

    # Build the lookup for all organizations
    for org in organizations:
        traverse_org_hierarchy(org)

    print(f"Built position lookup with {len(position_to_org_map)} position mappings")

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

    def get_org_display_order(name: str) -> int:
        """Determine display order for an organization based on its name."""
        name_lower = name.lower()

        # Top-level ward orgs
        if name == 'Bishopric':
            return 1
        if name == 'Elders Quorum':
            return 2
        if name == 'Relief Society':
            return 3
        if name == 'Young Men':
            return 4
        if name == 'Young Women':
            return 5
        if name == 'Aaronic Priesthood Quorums':
            return 6
        if name == 'Primary':
            return 7
        if name == 'Sunday School':
            return 8
        if name == 'Music':
            return 9
        if name == 'Temple and Family History':
            return 10
        if name == 'Ward Missionaries':
            return 11
        if name == 'Other' or name == 'Other Callings':
            return 12

        # Stake orgs at end
        if name_lower.startswith('stake') or name == 'High Council' or name == 'Patriarch':
            return 80
        if name == 'High Priests Quorum':
            return 81

        # Presidency always first within parent org
        if 'presidency' in name_lower:
            return 1

        # Age-based classes (old to young)
        # Aaronic Priesthood quorums (old to young)
        if 'priests quorum' in name_lower:
            return 10
        if 'teachers quorum' in name_lower:
            return 11
        if 'deacons quorum' in name_lower:
            return 12

        # Young Women classes (old to young)
        if 'young women 16-18' in name_lower:
            return 10
        if 'young women 14-15' in name_lower:
            return 11
        if 'young women 12-15' in name_lower:
            return 12
        if 'young women 12-13' in name_lower:
            return 13
        if 'young women 12-18' in name_lower:
            return 20

        # Primary - Valiant (oldest)
        if 'valiant 10' in name_lower:
            return 10
        if 'valiant 9' in name_lower:
            return 14
        if 'valiant 8' in name_lower:
            return 16
        if 'valiant 7' in name_lower:
            return 18

        # Primary - CTR
        if 'ctr 6' in name_lower:
            return 20
        if 'ctr 5' in name_lower:
            return 22
        if 'ctr 4' in name_lower:
            return 24

        # Primary - Sunbeam/Nursery (youngest)
        if 'sunbeam' in name_lower:
            return 30
        if 'nursery' in name_lower:
            return 40

        # Sunday School courses (old to young)
        if 'course 17' in name_lower or 'gospel doctrine' in name_lower:
            return 10
        if 'course 16' in name_lower:
            return 12
        if 'course 15' in name_lower:
            return 14
        if 'course 14' in name_lower:
            return 16
        if 'course 13' in name_lower:
            return 18
        if 'course 12' in name_lower:
            return 20
        if 'course 11' in name_lower:
            return 22
        if 'youth sunday school' in name_lower:
            return 40

        # Activities at the end
        if 'activities' in name_lower:
            return 90
        if 'additional' in name_lower:
            return 99

        # Other sub-orgs
        if 'teachers' in name_lower:
            return 50
        if 'service' in name_lower:
            return 51
        if 'ministering' in name_lower:
            return 52
        if 'unassigned' in name_lower or 'resource' in name_lower:
            return 95

        return 50

    def get_or_create_org(name: str, parent_id: Optional[str] = None) -> str:
        # Check by name only to avoid duplicates (org names should be unique)
        cur.execute(
            """SELECT id FROM organizations WHERE name = %s LIMIT 1""",
            (name,),
        )
        row = cur.fetchone()
        if row:
            return row[0]
        display_order = get_org_display_order(name)
        cur.execute(
            """INSERT INTO organizations (name, parent_org_id, display_order) VALUES (%s, %s, %s) RETURNING id""",
            (name, parent_id, display_order),
        )
        return cur.fetchone()[0]

    def get_or_create_calling(org_id: str, title: str) -> str:
        display_order = get_calling_display_order(title)
        cur.execute(
            """SELECT id FROM callings WHERE organization_id = %s AND title = %s LIMIT 1""",
            (org_id, title),
        )
        row = cur.fetchone()
        if row:
            # Update display_order if calling exists
            cur.execute(
                """UPDATE callings SET display_order = %s WHERE id = %s""",
                (display_order, row[0]),
            )
            return row[0]
        cur.execute(
            """INSERT INTO callings (organization_id, title, requires_setting_apart, display_order) VALUES (%s, %s, true, %s) RETURNING id""",
            (org_id, title, display_order),
        )
        return cur.fetchone()[0]

    # Organizations that should always be top-level (no parent)
    # MemberTools sometimes nests these under other orgs incorrectly
    TOP_LEVEL_ORGS = ['Music', 'Sunday School', 'Other']

    # Create organizations from the org structure, including age-group specific orgs
    def create_orgs_recursive(org: Dict, parent_db_id: Optional[str] = None, parent_org_name: Optional[str] = None):
        """Recursively create organizations from the hierarchy."""
        org_name = org.get('name', 'Unknown')

        # Skip internal org types we don't need (e.g., "Young Women Class Presidency")
        # These positions will use the parent org (the age group)
        skip_keywords = ['Class Presidency', 'Class Adult Leaders', 'Additional Callings',
                        'Quorum Presidency', 'Quorum Adult Leaders']
        if any(keyword in org_name for keyword in skip_keywords):
            # Still recurse into children but don't create this org
            for child_org in org.get('childOrgs', []):
                create_orgs_recursive(child_org, parent_db_id, parent_org_name)
            return

        # For generic sub-org names, prefix with parent to avoid collisions
        effective_org_name = org_name
        if parent_org_name and org_name in GENERIC_SUBORG_NAMES:
            effective_org_name = f"{parent_org_name} - {org_name}"

        # Force certain orgs to be top-level regardless of API hierarchy
        effective_parent_id = parent_db_id
        if org_name in TOP_LEVEL_ORGS:
            effective_parent_id = None

        org_db_id = get_or_create_org(effective_org_name, effective_parent_id)

        # Recurse into child orgs
        for child_org in org.get('childOrgs', []):
            create_orgs_recursive(child_org, org_db_id, org_name)

    for org in organizations:
        create_orgs_recursive(org)

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

                position_name = position.get('name', 'Unknown Position')
                position_type = position.get('type', '')
                unit_name = position.get('unitName', '')

                # Filter positions to home unit OR stake positions
                # Ward members may have stake callings which we want to track
                position_unit = position.get('unitNumber')
                is_stake_position = 'stake' in unit_name.lower() if unit_name else False
                if home_unit and position_unit and position_unit != home_unit and not is_stake_position:
                    continue
                active_date = position.get('activeDate')
                set_apart = position.get('setApart', False)

                # Parse active date
                sustained_date = None
                if active_date:
                    try:
                        sustained_date = datetime.strptime(str(active_date), '%Y-%m-%d').date()
                    except:
                        pass

                # Determine organization name
                # Priority: 1) Position UUID lookup (most accurate, includes age groups)
                #           2) Position type mapping
                #           3) Position name patterns
                #           4) Fallback to "Other"
                org_name = None
                position_uuid = position.get('uuid')

                # First try position UUID lookup (captures age-group specific orgs)
                if position_uuid and position_uuid in position_to_org_map:
                    org_name = position_to_org_map[position_uuid]

                # Override: Force Bishopric positions to "Bishopric" org regardless of where they appear
                # (MemberTools places Bishop/counselors under High Priests Quorum)
                bishopric_patterns = ['bishop', 'ward clerk', 'ward executive secretary', 'ward assistant']
                if any(pattern in position_name.lower() for pattern in bishopric_patterns):
                    org_name = 'Bishopric'

                # Fallback: try to match position type to org
                if not org_name:
                    for org_type, display_name in ORG_TYPE_NAMES.items():
                        if org_type in position_type.upper():
                            org_name = display_name
                            break

                # Fallback: try to match position name patterns
                if not org_name:
                    for pattern, target_org in POSITION_NAME_TO_ORG.items():
                        if pattern.lower() in position_name.lower():
                            org_name = target_org
                            break

                # Final fallback: use "Other"
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
        display_order = get_calling_display_order(title)
        cur.execute(
            """SELECT id FROM callings WHERE organization_id = %s AND title = %s LIMIT 1""",
            (org_id, title),
        )
        row = cur.fetchone()
        if row:
            # Update display_order if calling exists
            cur.execute(
                """UPDATE callings SET display_order = %s WHERE id = %s""",
                (display_order, row[0]),
            )
            return row[0]
        cur.execute(
            """INSERT INTO callings (organization_id, title, requires_setting_apart, display_order) VALUES (%s, %s, true, %s) RETURNING id""",
            (org_id, title, display_order),
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

            # STEP 1: Sync members and households (upsert - stable UUIDs)
            # This must come BEFORE hard refresh so member IDs exist for assignments
            member_uuid_map = sync_members_and_households(data, conn, home_unit)

            # STEP 2: Capture pre-sync snapshot (for in-flight detection)
            # Must happen BEFORE hard refresh so we can compare before/after
            capture_pre_sync_snapshot(conn)

            # STEP 3: Hard refresh synced tables (orgs, callings, assignments, interviews)
            # This clears stale data and prevents duplicates
            hard_refresh_synced_tables(conn)

            # STEP 4: Re-insert fresh orgs, callings, and assignments
            sync_organizations_and_callings(data, conn, member_uuid_map, home_unit)

            # STEP 5: Sync youth interviews (fresh insert after hard refresh)
            sync_youth_interviews(data, conn, member_uuid_map)

            # STEP 6: Re-link cached IDs in app tables
            # This restores references that were set to NULL during hard refresh
            relink_cached_ids(conn)

            # STEP 7: Restore user-entered data from snapshot
            # This preserves expected_release_date and release_notes across syncs
            restore_user_entered_data(conn)

            # STEP 8: Detect in-flight callings
            # Compare post-sync state with pre-sync snapshot to find external changes
            detect_in_flight_callings(conn)

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
