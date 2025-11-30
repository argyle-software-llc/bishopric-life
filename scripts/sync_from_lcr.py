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
import requests
import psycopg2

# Database connection parameters
DB_CONFIG = {
    'dbname': 'ward_callings',
    'user': 'jarombrown',
    'password': '',
    'host': 'localhost',
    'port': 5432
}

# Cookies file path
COOKIES_FILE = '/Users/jarombrown/PycharmProjects/church/callings/.lcr_cookies.json'

# LCR API endpoints
BASE_URL = 'https://lcr.churchofjesuschrist.org'
ENDPOINTS = {
    'member_list': f'{BASE_URL}/services/umlu/report/member-list',
    'org_structure': f'{BASE_URL}/services/orgs/sub-orgs-with-callings',
}


class LCRClient:
    """Simple LCR API client using browser cookies."""

    def __init__(self, cookies_file: str):
        self.session = requests.Session()
        # Set browser-like headers
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://lcr.churchofjesuschrist.org/',
            'Origin': 'https://lcr.churchofjesuschrist.org'
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
        # Debug: print cookies being sent
        print(f"Cookies in session: {list(self.session.cookies.keys())}")
        print(f"Making request to: {ENDPOINTS['member_list']}")

        response = self.session.get(ENDPOINTS['member_list'], timeout=30)

        print(f"Response status: {response.status_code}")
        if response.status_code != 200:
            print(f"Response headers: {dict(response.headers)}")
            print(f"Response body preview: {response.text[:500]}")

        response.raise_for_status()
        return response.json()

    def get_org_structure(self) -> Dict:
        """Fetch organization structure with callings."""
        response = self.session.get(ENDPOINTS['org_structure'], timeout=30)
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

        person_uuid = household_member.get('personUuid')
        legacy_cmis_id = household_member.get('legacyCmisId')
        name = household_member.get('nameListPreferredLocal', '')
        first_name, last_name = parse_name(name)

        email = household_member.get('email')
        phone = household_member.get('phoneNumber')
        sex = household_member.get('sex')
        age = household_member.get('age')
        is_adult = household_member.get('isAdult', False)

        household_uuid = household_info.get('uuid')
        household_name = household_info.get('directoryPreferredLocal')
        address = household_info.get('streetAddress')

        if not person_uuid or not legacy_cmis_id:
            continue

        # Insert or update household first
        if household_uuid:
            cur.execute("""
                INSERT INTO households (id, name, address)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    address = EXCLUDED.address
            """, (household_uuid, household_name, address))

        # Insert or update member
        cur.execute("""
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
                gender = EXCLUDED.gender,
                age = EXCLUDED.age,
                is_active = EXCLUDED.is_active
        """, (
            person_uuid, household_uuid, first_name, last_name,
            email, phone, sex, age, is_adult
        ))

        member_id_map[legacy_cmis_id] = person_uuid

    conn.commit()
    cur.close()

    print(f"Synced {len(member_id_map)} members")
    return member_id_map


def sync_organizations_and_callings(client: LCRClient, conn, member_id_map: Dict[int, str]):
    """Sync organizations and callings from LCR to database."""
    print("Fetching organization structure from LCR...")
    org_data = client.get_org_structure()

    cur = conn.cursor()

    def process_organization(org: Dict[str, Any], parent_id: Optional[str] = None):
        """Recursively process organization and its children."""
        org_id = str(org['subOrgId'])
        org_name = org['name']

        # Insert or update organization
        cur.execute("""
            INSERT INTO organizations (id, name, parent_id)
            VALUES (%s, %s, %s)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                parent_id = EXCLUDED.parent_id
        """, (org_id, org_name, parent_id))

        # Process callings in this organization
        for calling_data in org.get('callings', []):
            calling_id = str(calling_data['positionId'])
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

            # Insert or update calling
            cur.execute("""
                INSERT INTO callings (id, organization_id, title)
                VALUES (%s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    organization_id = EXCLUDED.organization_id,
                    title = EXCLUDED.title
            """, (calling_id, org_id, calling_title))

            # Create calling assignment if someone is assigned
            if member_id_lcr and member_id_lcr in member_id_map:
                member_uuid = member_id_map[member_id_lcr]

                # Mark old assignments as inactive
                cur.execute("""
                    UPDATE calling_assignments
                    SET is_active = false, released_date = CURRENT_DATE
                    WHERE calling_id = %s AND is_active = true AND member_id != %s
                """, (calling_id, member_uuid))

                # Insert or update current assignment
                cur.execute("""
                    INSERT INTO calling_assignments (
                        calling_id, member_id, is_active, assigned_date,
                        sustained_date, set_apart_date
                    )
                    VALUES (%s, %s, true, COALESCE(%s, CURRENT_DATE), %s, %s)
                    ON CONFLICT (calling_id, member_id) DO UPDATE SET
                        is_active = true,
                        sustained_date = COALESCE(EXCLUDED.sustained_date, calling_assignments.sustained_date),
                        set_apart_date = CASE
                            WHEN %s THEN COALESCE(calling_assignments.set_apart_date, CURRENT_DATE)
                            ELSE calling_assignments.set_apart_date
                        END
                """, (calling_id, member_uuid, sustained_date, sustained_date,
                      sustained_date if set_apart else None, set_apart))

        # Process child organizations recursively
        for child_org in org.get('children', []):
            process_organization(child_org, org_id)

    # Process top-level organizations
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

        # Connect to database
        print("Connecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
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
