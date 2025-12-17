#!/usr/bin/env python3
"""
Standalone LCR sync script that doesn't depend on external projects.
Uses browser session cookies to authenticate with LCR.
"""

import sys
import os
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from pathlib import Path
from urllib.parse import urlparse
import requests
try:
    import psycopg2  # type: ignore
except ImportError:
    psycopg2 = None

"""Database configuration

By default connects to a local Postgres. If `DATABASE_URL` is set in the
environment (e.g., `postgresql://user:pass@host:5432/dbname`), that will be
used instead. This mirrors the server/.env configuration.
"""

DB_CONFIG = {
    'dbname': 'ward_callings',
    'user': os.getenv('USER', ''),
    'password': '',
    'host': 'localhost',
    'port': 5432,
}


def get_db_connection():
    database_url = os.getenv('DATABASE_URL')
    if database_url:
        # psycopg2 can accept a DSN directly
        if psycopg2 is None:
            raise RuntimeError("psycopg2 not installed; install it or set DRY_RUN=1")
        return psycopg2.connect(database_url)
    if psycopg2 is None:
        raise RuntimeError("psycopg2 not installed; install it or set DRY_RUN=1")
    return psycopg2.connect(**DB_CONFIG)

# Cookies file path (override with LCR_COOKIES_FILE). Defaults to repo root.
REPO_ROOT = Path(__file__).resolve().parents[1]
COOKIES_FILE = os.getenv('LCR_COOKIES_FILE', str(REPO_ROOT / '.lcr_cookies.json'))
DRY_RUN = os.getenv('DRY_RUN', '0') == '1'

# LCR API endpoints
BASE_URL = 'https://lcr.churchofjesuschrist.org'
ENDPOINTS = {
    # Member list endpoint observed in working browser call
    'member_list': f'{BASE_URL}/api/umlu/report/member-list',
    # Org structure endpoint (with callings)
    'org_structure': f'{BASE_URL}/api/orgs/sub-orgs-with-callings',
}


class LCRClient:
    """Simple LCR API client using browser cookies."""

    def __init__(self, cookies_file: str):
        self.session = requests.Session()
        # Set browser-like headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://lcr.churchofjesuschrist.org/',
            'Origin': 'https://lcr.churchofjesuschrist.org',
        })
        self._load_cookies(cookies_file)

    def _load_cookies(self, cookies_file: str):
        """Load cookies from JSON file."""
        with open(cookies_file, 'r') as f:
            cookie_data = json.load(f)

        # Handle {"cookies": {...}} format
        cookies = cookie_data.get('cookies', cookie_data)

        for name, value in cookies.items():
            self.session.cookies.set(name, value, domain='.churchofjesuschrist.org')

        print(f"Loaded {len(cookies)} cookies")

    def get_member_list(self) -> List[Dict]:
        """Fetch member list from LCR."""
        unit_number = os.getenv('LCR_UNIT_NUMBER')
        params = {'lang': 'eng'}
        if unit_number:
            params['unitNumber'] = unit_number

        # Debug: print cookies being sent
        print(f"Cookies in session: {list(self.session.cookies.keys())}")
        print(f"Making request to: {ENDPOINTS['member_list']} with params {params}")

        response = self.session.get(ENDPOINTS['member_list'], params=params, timeout=30)

        print(f"Response status: {response.status_code}")
        if response.status_code != 200:
            print(f"Response headers: {dict(response.headers)}")
            print(f"Response body preview: {response.text[:500]}")

        response.raise_for_status()
        return response.json()

    def get_org_structure(self) -> Dict:
        """Fetch organization structure with callings."""
        unit_number = os.getenv('LCR_UNIT_NUMBER')
        params = {'lang': 'eng', 'ip': 'true'}
        if unit_number:
            params['unitNumber'] = unit_number

        print(f"Making request to: {ENDPOINTS['org_structure']} with params {params}")
        response = self.session.get(ENDPOINTS['org_structure'], params=params, timeout=30)
        print(f"Response status: {response.status_code}")
        if response.status_code != 200:
            try:
                print(f"Response body preview: {response.text[:500]}")
            except Exception:
                pass
        response.raise_for_status()
        return response.json()


def parse_name(full_name: str) -> tuple[str, str]:
    """Parse a full name into first and last name."""
    if not full_name:
        return "", ""

    # Handle "Last, First Middle" format
    if ',' in full_name:
        parts = full_name.split(',')
        last_name = parts[0].strip()
        first_parts = parts[1].strip().split()
        first_name = first_parts[0] if first_parts else ""
        return first_name, last_name
    else:
        # Handle "First Last" format
        parts = full_name.strip().split()
        if len(parts) >= 2:
            first_name = parts[0]
            last_name = ' '.join(parts[1:])
            return first_name, last_name
        elif len(parts) == 1:
            return parts[0], ""
        else:
            return "", ""


def first_or_none(seq):
    if not seq:
        return None
    return seq[0]


def normalize_email_field(item: Any) -> Optional[str]:
    if not item:
        return None
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        return item.get('email') or item.get('value') or item.get('address')
    return None


def format_address(address_obj: Any) -> Optional[str]:
    if not isinstance(address_obj, dict):
        return address_obj if isinstance(address_obj, str) else None
    # Prefer explicit address lines
    lines = address_obj.get('addressLines')
    if isinstance(lines, list) and lines:
        parts = [str(x).strip() for x in lines if x]
        return ', '.join(parts) if parts else None
    # Fall back to formattedLine1..4
    parts = [
        address_obj.get('formattedLine1'),
        address_obj.get('formattedLine2'),
        address_obj.get('formattedLine3'),
        address_obj.get('formattedLine4'),
    ]
    parts = [str(x).strip() for x in parts if x]
    return ', '.join(parts) if parts else None


def sync_members(client: LCRClient, conn) -> Dict[int, str]:
    """
    Sync members from LCR to database.
    Returns a mapping of legacy_cmis_id -> member_uuid
    """
    print("Fetching member list from LCR...")
    member_data = client.get_member_list()

    cur = conn.cursor()
    member_id_map = {}

    print(f"Processing {len(member_data)} members...")

    for member_record in member_data:
        household_member = member_record.get('householdMember', {})
        household_info = household_member.get('household', {})

        # Identifiers
        person_uuid = member_record.get('uuid')
        legacy_cmis_id = member_record.get('legacyCmisId')

        # Names
        name_formats = member_record.get('nameFormats', {}) or {}
        first_name = name_formats.get('givenPreferredLocal') or ''
        last_name = name_formats.get('familyPreferredLocal') or ''

        # Contact
        email = None
        emails = member_record.get('emails')
        if isinstance(emails, list):
            email = normalize_email_field(first_or_none(emails))
        phone = member_record.get('phoneNumber')

        # Demographics
        sex = member_record.get('sex')
        age = member_record.get('age')
        is_adult = True if (isinstance(age, int) and age >= 18) else False

        # Household
        household_uuid = (household_info or {}).get('uuid')
        household_name = (household_info or {}).get('directoryPreferredLocal')
        address_obj = (household_info or {}).get('address')
        address = format_address(address_obj)

        if not person_uuid:
            # As a fallback, synthesize a stable UUID from legacy id or MRN
            import uuid as _uuid
            base = str(legacy_cmis_id or member_record.get('mrn') or '')
            if not base:
                # Without a stable id, skip
                continue
            person_uuid = str(_uuid.uuid5(_uuid.NAMESPACE_URL, f"lcr-member-{base}"))

        # Insert or update household first (schema uses household_name)
        if household_uuid:
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

        # Insert or update member
        # Upsert member (map legacy_cmis_id -> church_id column)
        # Pre-merge: if an existing member matches by name and lacks church_id, set it
        # Only do this if no row already exists with this church_id to avoid unique violations
        if legacy_cmis_id is not None and first_name and last_name:
            cur.execute("SELECT id FROM members WHERE church_id = %s LIMIT 1", (legacy_cmis_id,))
            exists_with_church = cur.fetchone()
            if not exists_with_church:
                cur.execute(
                    """
                    SELECT id FROM members
                    WHERE lower(first_name) = lower(%s)
                      AND lower(last_name) = lower(%s)
                      AND church_id IS NULL
                    LIMIT 1
                    """,
                    (first_name, last_name),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        UPDATE members
                        SET church_id = %s,
                            household_id = COALESCE(%s, household_id),
                            email = COALESCE(%s, email),
                            phone = COALESCE(%s, phone),
                            gender = COALESCE(%s, gender),
                            age = COALESCE(%s, age),
                            is_active = COALESCE(%s, is_active)
                        WHERE id = %s
                        """,
                        (
                            legacy_cmis_id,
                            household_uuid,
                            email,
                            phone,
                            sex,
                            age,
                            is_adult,
                            row[0],
                        ),
                    )

        # Upsert preferring unique key on church_id to dedupe existing rows
        # Return the actual member.id so downstream relations use the correct UUID
        cur.execute(
            """
            INSERT INTO members (
                id, household_id, first_name, last_name,
                email, phone, gender, age, is_active, church_id
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (church_id) DO UPDATE SET
                household_id = EXCLUDED.household_id,
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                email = EXCLUDED.email,
                phone = EXCLUDED.phone,
                gender = EXCLUDED.gender,
                age = EXCLUDED.age,
                is_active = EXCLUDED.is_active
            RETURNING id
            """,
            (
                person_uuid,
                household_uuid,
                first_name,
                last_name,
                email,
                phone,
                sex,
                age,
                is_adult,
                legacy_cmis_id,
            ),
        )

        returned_member_id = cur.fetchone()[0]
        if legacy_cmis_id is not None:
            member_id_map[legacy_cmis_id] = returned_member_id

    conn.commit()
    cur.close()

    print(f"Synced {len(member_id_map)} members")
    return member_id_map


def sync_organizations_and_callings(client: LCRClient, conn, member_id_map: Dict[int, str]):
    """Sync organizations and callings from LCR to database."""
    print("Fetching organization structure from LCR...")
    org_data = client.get_org_structure()

    cur = conn.cursor()

    def get_or_create_org(name: str, parent_id: Optional[str]) -> str:
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

    def process_organization(org: Dict[str, Any], parent_id: Optional[str] = None):
        """Recursively process organization and its children."""
        org_name = org['name']
        org_id = get_or_create_org(org_name, parent_id)

        # Process callings in this organization
        for calling_data in org.get('callings', []):
            calling_title = calling_data['position']
            member_id_lcr = calling_data.get('memberId')
            active_date = calling_data.get('activeDate')
            set_apart = calling_data.get('setApart', False)

            # Convert activeDate from YYYYMMDD to date
            sustained_date = None
            if active_date:
                try:
                    sustained_date = datetime.strptime(str(active_date), '%Y%m%d').date()
                except:
                    pass

            # Get or create calling by (organization_id, title)
            calling_id = get_or_create_calling(org_id, calling_title)

            # Create calling assignment if someone is assigned
            if member_id_lcr and member_id_lcr in member_id_map:
                member_uuid = member_id_map[member_id_lcr]

                # Mark other active assignments for this calling as inactive
                cur.execute(
                    """
                    UPDATE calling_assignments
                    SET is_active = false
                    WHERE calling_id = %s AND is_active = true AND member_id <> %s
                    """,
                    (calling_id, member_uuid),
                )

                # Try to update existing assignment for this member/calling
                cur.execute(
                    """SELECT id, assigned_date, sustained_date, set_apart_date FROM calling_assignments
                        WHERE calling_id = %s AND member_id = %s LIMIT 1""",
                    (calling_id, member_uuid),
                )
                row = cur.fetchone()
                if row:
                    # Update existing
                    cur.execute(
                        """
                        UPDATE calling_assignments
                        SET is_active = true,
                            assigned_date = COALESCE(%s, assigned_date),
                            sustained_date = COALESCE(%s, sustained_date),
                            set_apart_date = COALESCE(%s, set_apart_date)
                        WHERE id = %s
                        """,
                        (
                            sustained_date or datetime.today().date(),
                            sustained_date,
                            datetime.today().date() if set_apart else None,
                            row[0],
                        ),
                    )
                else:
                    # Insert new assignment
                    cur.execute(
                        """
                        INSERT INTO calling_assignments (
                            calling_id, member_id, is_active, assigned_date, sustained_date, set_apart_date
                        ) VALUES (%s, %s, true, %s, %s, %s)
                        """,
                        (
                            calling_id,
                            member_uuid,
                            sustained_date or datetime.today().date(),
                            sustained_date,
                            datetime.today().date() if set_apart else None,
                        ),
                    )
            else:
                # No member assigned: mark any active assignments for this calling as inactive
                cur.execute(
                    """
                    UPDATE calling_assignments
                    SET is_active = false
                    WHERE calling_id = %s AND is_active = true
                    """,
                    (calling_id,),
                )

        # Process child organizations recursively
        for child_org in org.get('children', []):
            process_organization(child_org, org_id)

    # Process top-level organizations (handle list or single root)
    if isinstance(org_data, list):
        for root in org_data:
            process_organization(root)
    else:
        process_organization(org_data)

    conn.commit()
    cur.close()

    print(f"Synced organizations and callings")


def main():
    """Main sync function."""
    print("=" * 60)
    print("LCR Data Sync (Standalone)")
    print("=" * 60)

    try:
        # Check if cookies file exists
        if not os.path.isfile(COOKIES_FILE):
            print(f"\nError: Cookies file not found at {COOKIES_FILE}")
            print("\nTo get your cookies:")
            print("1. Log into https://lcr.churchofjesuschrist.org in your browser")
            print("2. Use browser developer tools to export cookies")
            print("3. Save them to .lcr_cookies.json in this format:")
            print('   {"cookies": {"appSession.0": "...", "appSession.1": "...}}')
            sys.exit(1)

        # Connect to LCR API using browser cookies
        print("Connecting to LCR with browser cookies...")
        client = LCRClient(COOKIES_FILE)

        if DRY_RUN:
            print("\nDRY_RUN=1 set: fetching endpoints only, skipping database writes...")
            members = client.get_member_list()
            if isinstance(members, list):
                print(f"Member list items: {len(members)}")
                if members:
                    sample = members[0]
                    print(f"Member sample keys: {list(sample.keys())[:15]}")
                    if isinstance(sample.get('nameFormats'), dict):
                        print(f"nameFormats keys: {list(sample['nameFormats'].keys())[:15]}")
                    if isinstance(sample.get('householdMember'), dict):
                        print(f"householdMember keys: {list(sample['householdMember'].keys())[:15]}")
                        if isinstance(sample['householdMember'].get('household'), dict):
                            print(f"household keys: {list(sample['householdMember']['household'].keys())[:15]}")
            orgs = client.get_org_structure()
            if isinstance(orgs, dict):
                child_count = len(orgs.get('children', []))
                callings_count = len(orgs.get('callings', []))
                print(f"Org root children: {child_count}, callings at root: {callings_count}")
                print(f"Org root keys: {list(orgs.keys())[:15]}")
            elif isinstance(orgs, list):
                print(f"Org roots: {len(orgs)}")
                if orgs:
                    print(f"First org keys: {list(orgs[0].keys())[:15]}")
                    first = orgs[0]
                    if isinstance(first.get('callings'), list):
                        print(f"First org callings: {len(first['callings'])}")
                        if first['callings']:
                            print(f"Calling sample keys: {list(first['callings'][0].keys())[:15]}")
            print("\nDry run complete.")
        else:
            # Connect to database
            print("Connecting to database...")
            conn = get_db_connection()
            print("Connected to database")

            # Sync members
            member_id_map = sync_members(client, conn)

            # Sync organizations and callings
            sync_organizations_and_callings(client, conn, member_id_map)

            # Close connection
            conn.close()

        print("=" * 60)
        print("Sync completed successfully!")
        print("=" * 60)

    except requests.exceptions.HTTPError as e:
        print(f"\nHTTP Error: {e}")
        print("\nYour cookies may have expired. Please:")
        print("1. Log into LCR in your browser")
        print("2. Export fresh cookies")
        print("3. Update .lcr_cookies.json")
        sys.exit(1)
    except Exception as e:
        print(f"Error during sync: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
