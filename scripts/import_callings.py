#!/usr/bin/env python3
"""
Import ward callings from current_callings.txt into PostgreSQL database
"""

import re
import psycopg2
from datetime import datetime
from typing import Optional, Tuple
import os

# Database connection
DB_URL = os.getenv('DATABASE_URL', 'postgresql://jarombrown@localhost:5432/ward_callings')

def parse_name(full_name: str) -> Tuple[str, str]:
    """Parse 'Last, First Middle' format into first and last names"""
    if not full_name or full_name == "Calling Vacant":
        return None, None

    parts = full_name.split(',')
    if len(parts) >= 2:
        last_name = parts[0].strip()
        first_parts = parts[1].strip().split()
        first_name = first_parts[0] if first_parts else ""
        return first_name, last_name
    else:
        # Handle cases without comma
        parts = full_name.strip().split()
        if len(parts) >= 2:
            return parts[0], parts[-1]
        return full_name, ""

def parse_date(date_str: str) -> Optional[str]:
    """Parse date string to ISO format"""
    if not date_str or date_str.strip() == "":
        return None

    try:
        # Try parsing "14 Sep 2025" format
        dt = datetime.strptime(date_str.strip(), "%d %b %Y")
        return dt.strftime("%Y-%m-%d")
    except:
        return None

def get_or_create_member(cur, first_name: str, last_name: str):
    """Get existing member or create new one"""
    if not first_name or not last_name:
        return None

    # Check if member exists
    cur.execute(
        "SELECT id FROM members WHERE first_name = %s AND last_name = %s",
        (first_name, last_name)
    )
    result = cur.fetchone()

    if result:
        return result[0]

    # Create new member
    cur.execute(
        """INSERT INTO members (first_name, last_name, is_active)
           VALUES (%s, %s, true)
           RETURNING id""",
        (first_name, last_name)
    )
    return cur.fetchone()[0]

def get_or_create_organization(cur, org_name: str, parent_org_id=None, level=0):
    """Get existing organization or create new one"""
    # Check if organization exists
    cur.execute(
        "SELECT id FROM organizations WHERE name = %s",
        (org_name,)
    )
    result = cur.fetchone()

    if result:
        return result[0]

    # Create new organization
    cur.execute(
        """INSERT INTO organizations (name, parent_org_id, level, display_order)
           VALUES (%s, %s, %s, 0)
           RETURNING id""",
        (org_name, parent_org_id, level)
    )
    return cur.fetchone()[0]

def import_callings(file_path: str):
    """Import callings from text file"""
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    try:
        with open(file_path, 'r') as f:
            lines = f.readlines()

        current_org = None
        current_org_id = None
        current_parent_org_id = None
        current_level = 0

        i = 0
        while i < len(lines):
            line = lines[i].strip()

            # Skip empty lines and counts
            if not line or line.startswith('Count:') or line.startswith('*') or \
               line.startswith('Add Another') or line.startswith('Print') or \
               line.startswith('Search') or line.startswith('Organizations') or \
               line.startswith('Options') or line.startswith('Showing') or \
               line.startswith('When calling') or line.startswith('No matching') or \
               'filtered from' in line or line.startswith('custom calling'):
                i += 1
                continue

            # Check if this is a header row
            if line == "Position\tName\tSustained\tSet Apart" or \
               line.startswith("Position") and "Name" in line and "Sustained" in line:
                i += 1
                continue

            # Check if this is an organization header (not a tab-separated position)
            if '\t' not in line and not line[0].isdigit():
                # This might be an organization name or sub-organization
                org_name = line.strip()

                # Skip some specific non-org lines
                if org_name in ['Callings by Organization', 'Room:', ''] or \
                   org_name.startswith('Room:'):
                    i += 1
                    continue

                # Determine if it's a main org or sub-org
                # Sub-orgs are typically shorter and come after a main org
                is_sub_org = current_org_id is not None and len(org_name) < 50

                if is_sub_org:
                    # Create sub-organization
                    current_level = 1
                    current_org = org_name
                    current_org_id = get_or_create_organization(
                        cur, org_name, current_parent_org_id, current_level
                    )
                else:
                    # Create main organization
                    current_level = 0
                    current_org = org_name
                    current_parent_org_id = get_or_create_organization(
                        cur, org_name, None, current_level
                    )
                    current_org_id = current_parent_org_id

                print(f"Organization: {org_name} (Level {current_level})")
                i += 1
                continue

            # Parse position/calling line (tab-separated)
            if '\t' in line:
                parts = line.split('\t')
                if len(parts) >= 2:
                    position = parts[0].strip()
                    member_name = parts[1].strip()

                    # Skip if it's a header row we missed
                    if position == "Position" or position == "Name":
                        i += 1
                        continue

                    # Get dates from next lines if they exist
                    sustained_date = None
                    set_apart_date = None

                    # Check next line for sustained date
                    if i + 1 < len(lines):
                        next_line = lines[i + 1].strip()
                        # Check if it's a date (starts with digit)
                        if next_line and next_line[0].isdigit():
                            sustained_date = parse_date(next_line)
                            i += 1  # Skip the date line

                    # Create the calling
                    if current_org_id:
                        cur.execute(
                            """INSERT INTO callings (organization_id, title, requires_setting_apart)
                               VALUES (%s, %s, true)
                               RETURNING id""",
                            (current_org_id, position)
                        )
                        calling_id = cur.fetchone()[0]

                        # Create member and assignment if not vacant
                        if member_name and member_name != "Calling Vacant":
                            first_name, last_name = parse_name(member_name)
                            if first_name and last_name:
                                member_id = get_or_create_member(cur, first_name, last_name)

                                # Create calling assignment
                                cur.execute(
                                    """INSERT INTO calling_assignments
                                       (calling_id, member_id, assigned_date, sustained_date, is_active)
                                       VALUES (%s, %s, %s, %s, true)""",
                                    (calling_id, member_id, sustained_date, sustained_date)
                                )

                                print(f"  ✓ {position}: {first_name} {last_name} (Sustained: {sustained_date or 'N/A'})")
                            else:
                                print(f"  ○ {position}: VACANT")
                        else:
                            print(f"  ○ {position}: VACANT")

            i += 1

        conn.commit()
        print("\n✅ Import completed successfully!")

        # Print summary
        cur.execute("SELECT COUNT(*) FROM organizations")
        org_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM callings")
        calling_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM members")
        member_count = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM calling_assignments WHERE is_active = true")
        assignment_count = cur.fetchone()[0]

        print(f"\nSummary:")
        print(f"  Organizations: {org_count}")
        print(f"  Callings: {calling_count}")
        print(f"  Members: {member_count}")
        print(f"  Active Assignments: {assignment_count}")

    except Exception as e:
        conn.rollback()
        print(f"❌ Error during import: {e}")
        raise
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    import_file = "/Users/jarombrown/PycharmProjects/church/callings/current_callings.txt"
    print(f"Starting import from {import_file}...\n")
    import_callings(import_file)
