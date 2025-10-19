#!/usr/bin/env python3
"""
Sync script to pull live data from LCR API and update the PostgreSQL database.

This script uses the existing church_of_jesus_christ_api from the frisco5th-lcr project
to fetch current ward data and update our callings management database.
"""

import sys
import os
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
import psycopg2
from psycopg2.extras import execute_values

# Add the frisco5th-lcr directory to Python path to import the API
sys.path.insert(0, '/Users/jarombrown/PycharmProjects/frisco5th-lcr')

# Import the standard API client (works with MFA disabled)
from church_of_jesus_christ_api import ChurchOfJesusChristAPI

# Database connection parameters
DB_CONFIG = {
    'dbname': 'ward_callings',
    'user': 'jarombrown',
    'password': '',
    'host': 'localhost',
    'port': 5432
}

# LCR Credentials file path
LCR_CREDENTIALS_FILE = '/Users/jarombrown/PycharmProjects/frisco5th-lcr/lcr.credentials.json'


def load_lcr_credentials() -> Dict[str, Any]:
    """Load LCR credentials from JSON file."""
    if not os.path.isfile(LCR_CREDENTIALS_FILE):
        raise ValueError(f"Missing LCR credentials file: {LCR_CREDENTIALS_FILE}")

    with open(LCR_CREDENTIALS_FILE, 'r') as f:
        return json.load(f)


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


def sync_members(api: ChurchOfJesusChristAPI, conn) -> Dict[int, str]:
    """
    Sync members from LCR to database.
    Returns a mapping of legacy_cmis_id -> member_uuid
    """
    print("Fetching member list from LCR...")
    member_data = api.get_member_list()

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


def sync_organizations_and_callings(api: ChurchOfJesusChristAPI, conn, member_id_map: Dict[int, str]):
    """Sync organizations and callings from LCR to database."""
    print("Fetching organization structure from LCR...")
    org_data = api.get_unit_organizations()

    cur = conn.cursor()

    # Track all calling assignments we see (to mark inactive ones later)
    active_assignments = set()

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

                active_assignments.add((calling_id, member_uuid))

        # Process child organizations recursively
        for child_org in org.get('children', []):
            process_organization(child_org, org_id)

    # Process top-level organizations
    process_organization(org_data)

    # Mark any assignments not seen as inactive
    cur.execute("""
        UPDATE calling_assignments
        SET is_active = false, released_date = CURRENT_DATE
        WHERE is_active = true
        AND (calling_id, member_id) NOT IN (
            SELECT calling_id, member_id FROM calling_assignments WHERE is_active = true
        )
    """)

    conn.commit()
    cur.close()

    print(f"Synced organizations and callings")


def main():
    """Main sync function."""
    print("=" * 60)
    print("LCR Data Sync")
    print("=" * 60)

    try:
        # Load credentials
        print("Loading LCR credentials...")
        credentials = load_lcr_credentials()

        # Connect to LCR API (MFA must be disabled for this to work)
        print("Connecting to LCR API...")
        print("Note: MFA must be disabled on your account for automated login")
        api = ChurchOfJesusChristAPI(
            username=credentials['username'],
            password=credentials['password']
        )
        print("Successfully authenticated with LCR!")

        # Connect to database
        print("Connecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        print("Connected to database")

        # Sync members
        member_id_map = sync_members(api, conn)

        # Sync organizations and callings
        sync_organizations_and_callings(api, conn, member_id_map)

        # Close connection
        conn.close()

        print("=" * 60)
        print("Sync completed successfully!")
        print("=" * 60)

    except Exception as e:
        print(f"Error during sync: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
