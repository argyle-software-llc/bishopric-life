#!/usr/bin/env python3
"""
Import members and callings from LCR reports.

This script imports data from two LCR reports:
1. Members with callings report
2. Members without callings report

The reports should be tab-separated text files copied directly from LCR.
"""

import sys
import psycopg2
from datetime import datetime
from typing import Optional, Tuple
import uuid

# Database connection parameters
DB_CONFIG = {
    'dbname': 'ward_callings',
    'user': 'jarombrown',
    'password': '',
    'host': 'localhost',
    'port': 5432
}


def parse_name(full_name: str) -> Tuple[str, str]:
    """Parse 'Last, First Middle' format into first and last name."""
    if ',' in full_name:
        parts = full_name.split(',', 1)
        last_name = parts[0].strip()
        first_parts = parts[1].strip().split()
        first_name = first_parts[0] if first_parts else ""
        return first_name, last_name
    else:
        # Fallback for unusual formats
        parts = full_name.strip().split()
        if len(parts) >= 2:
            return parts[0], ' '.join(parts[1:])
        elif len(parts) == 1:
            return parts[0], ""
        else:
            return "", ""


def parse_date(date_str: str) -> Optional[str]:
    """Parse date in '29 Apr 1971' or '6 Apr 2025' format to YYYY-MM-DD."""
    if not date_str or date_str.strip() == '':
        return None

    try:
        # Parse format like "29 Apr 1971" or "6 Apr 2025"
        date_obj = datetime.strptime(date_str.strip(), '%d %b %Y')
        return date_obj.strftime('%Y-%m-%d')
    except ValueError:
        try:
            # Try without leading zero
            date_obj = datetime.strptime(date_str.strip(), '%-d %b %Y')
            return date_obj.strftime('%Y-%m-%d')
        except:
            print(f"Warning: Could not parse date: {date_str}")
            return None


def import_members_with_callings(filename: str, conn):
    """
    Import members with callings from tab-separated file.

    Format: Name    Gender    Age    Birth Date    Phone    Organizations    Calling    Sustained    Set Apart
    """
    print(f"\n{'='*60}")
    print(f"Importing Members WITH Callings from: {filename}")
    print(f"{'='*60}")

    cur = conn.cursor()

    with open(filename, 'r') as f:
        lines = f.readlines()

    members_added = 0
    callings_added = 0

    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue

        # Split by tab
        parts = line.split('\t')

        if len(parts) < 8:
            print(f"Line {line_num}: Not enough columns, skipping")
            continue

        # Parse columns
        name = parts[0].strip()
        gender = parts[1].strip() if len(parts) > 1 else None
        age = int(parts[2].strip()) if len(parts) > 2 and parts[2].strip() else None
        birth_date = parse_date(parts[3]) if len(parts) > 3 else None
        phone = parts[4].strip() if len(parts) > 4 and parts[4].strip() else None
        organization_name = parts[5].strip() if len(parts) > 5 and parts[5].strip() else None
        calling_title = parts[6].strip() if len(parts) > 6 and parts[6].strip() else None
        sustained_date = parse_date(parts[7]) if len(parts) > 7 else None
        set_apart = len(parts) > 8 and parts[8].strip() != ''

        if not name or not calling_title:
            continue

        first_name, last_name = parse_name(name)

        # Check if member exists
        cur.execute("""
            SELECT id FROM members
            WHERE first_name = %s AND last_name = %s
            LIMIT 1
        """, (first_name, last_name))

        result = cur.fetchone()

        if result:
            # Member exists, update it
            member_id = result[0]
            cur.execute("""
                UPDATE members
                SET gender = %s, age = %s, phone = %s, is_active = true
                WHERE id = %s
            """, (gender, age, phone, member_id))
        else:
            # New member, insert it
            member_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO members (id, first_name, last_name, gender, age, phone, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, true)
            """, (member_id, first_name, last_name, gender, age, phone))
            members_added += 1

        # Handle organization
        org_id = None
        if organization_name:
            # Check if organization exists
            cur.execute("""
                SELECT id FROM organizations WHERE name = %s LIMIT 1
            """, (organization_name,))
            result = cur.fetchone()

            if result:
                org_id = result[0]
            else:
                org_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO organizations (id, name)
                    VALUES (%s, %s)
                """, (org_id, organization_name))

        # Handle calling
        # Check if calling exists
        cur.execute("""
            SELECT id FROM callings
            WHERE title = %s AND (organization_id = %s OR (organization_id IS NULL AND %s IS NULL))
            LIMIT 1
        """, (calling_title, org_id, org_id))

        result = cur.fetchone()
        if result:
            calling_id = result[0]
        else:
            calling_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO callings (id, organization_id, title)
                VALUES (%s, %s, %s)
            """, (calling_id, org_id, calling_title))

        # Create or update calling assignment
        cur.execute("""
            SELECT id FROM calling_assignments
            WHERE calling_id = %s AND member_id = %s
            LIMIT 1
        """, (calling_id, member_id))

        assignment_exists = cur.fetchone()

        if assignment_exists:
            # Update existing assignment
            cur.execute("""
                UPDATE calling_assignments SET
                    is_active = true,
                    sustained_date = COALESCE(%s, sustained_date),
                    set_apart_date = CASE
                        WHEN %s THEN COALESCE(set_apart_date, CURRENT_DATE)
                        ELSE set_apart_date
                    END
                WHERE calling_id = %s AND member_id = %s
            """, (sustained_date, set_apart, calling_id, member_id))
        else:
            # Create new assignment
            cur.execute("""
                INSERT INTO calling_assignments (
                    calling_id, member_id, is_active, sustained_date, set_apart_date
                )
                VALUES (%s, %s, true, %s, %s)
            """, (calling_id, member_id, sustained_date,
                  sustained_date if set_apart else None))

        callings_added += 1

    conn.commit()
    cur.close()

    print(f"✓ Processed {members_added} members")
    print(f"✓ Processed {callings_added} calling assignments")


def import_members_without_callings(filename: str, conn):
    """
    Import members without callings from tab-separated file.

    Format: Name    Gender    Age    Birth Date    Phone
    """
    print(f"\n{'='*60}")
    print(f"Importing Members WITHOUT Callings from: {filename}")
    print(f"{'='*60}")

    cur = conn.cursor()

    with open(filename, 'r') as f:
        lines = f.readlines()

    members_added = 0

    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue

        # Split by tab
        parts = line.split('\t')

        # Need at least 4 columns: Name, Gender, Age, Birth Date (Phone is optional)
        if len(parts) < 4:
            print(f"Line {line_num}: Not enough columns, skipping")
            continue

        # Parse columns
        name = parts[0].strip()
        gender = parts[1].strip() if len(parts) > 1 else None
        age = int(parts[2].strip()) if len(parts) > 2 and parts[2].strip() else None
        birth_date = parse_date(parts[3]) if len(parts) > 3 else None
        phone = parts[4].strip() if len(parts) > 4 and parts[4].strip() else None

        if not name:
            continue

        first_name, last_name = parse_name(name)

        # Check if member exists
        cur.execute("""
            SELECT id FROM members
            WHERE first_name = %s AND last_name = %s
            LIMIT 1
        """, (first_name, last_name))

        result = cur.fetchone()

        if result:
            # Member exists, update it
            member_id = result[0]
            cur.execute("""
                UPDATE members
                SET gender = %s, age = %s, phone = %s, is_active = true
                WHERE id = %s
            """, (gender, age, phone, member_id))
        else:
            # New member, insert it
            member_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO members (id, first_name, last_name, gender, age, phone, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, true)
            """, (member_id, first_name, last_name, gender, age, phone))
            members_added += 1

    conn.commit()
    cur.close()

    print(f"✓ Processed {members_added} members")


def main():
    """Main import function."""
    print(f"\n{'='*60}")
    print("LCR Members and Callings Import")
    print(f"{'='*60}")

    # Check for file arguments
    if len(sys.argv) < 2:
        print("\nUsage:")
        print("  python3 import_members_from_lcr.py <with_callings.txt> [without_callings.txt]")
        print("\nExamples:")
        print("  python3 import_members_from_lcr.py members_with_callings.txt")
        print("  python3 import_members_from_lcr.py members_with_callings.txt members_without_callings.txt")
        sys.exit(1)

    with_callings_file = sys.argv[1]
    without_callings_file = sys.argv[2] if len(sys.argv) > 2 else None

    try:
        # Connect to database
        print("\nConnecting to database...")
        conn = psycopg2.connect(**DB_CONFIG)
        print("✓ Connected to database")

        # Import members with callings
        import_members_with_callings(with_callings_file, conn)

        # Import members without callings (if provided)
        if without_callings_file:
            import_members_without_callings(without_callings_file, conn)

        # Close connection
        conn.close()

        print(f"\n{'='*60}")
        print("✓ Import completed successfully!")
        print(f"{'='*60}\n")

    except FileNotFoundError as e:
        print(f"\n✗ Error: File not found - {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n✗ Error during import: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
