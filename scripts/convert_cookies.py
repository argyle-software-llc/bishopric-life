#!/usr/bin/env python3
"""
Convert tab-separated cookie data to JSON format.

Paste your cookies from the browser and this will convert them to the
.lcr_cookies.json format needed by the sync script.
"""

import json
import sys

def parse_cookies_from_tsv(tsv_text):
    """Parse tab-separated cookie data."""
    cookies = {}

    lines = tsv_text.strip().split('\n')

    for line in lines:
        if not line.strip():
            continue

        # Split by tabs
        parts = line.split('\t')

        if len(parts) < 2:
            continue

        name = parts[0].strip()
        value = parts[1].strip()

        # Only include cookies from lcr.churchofjesuschrist.org or id.churchofjesuschrist.org
        domain = parts[2].strip() if len(parts) > 2 else ''

        if 'churchofjesuschrist.org' in domain:
            cookies[name] = value

    return cookies


def main():
    print("=" * 70)
    print("Cookie Converter - Tab-separated to JSON")
    print("=" * 70)
    print()
    print("Paste your cookie data below (from browser Developer Tools)")
    print("Press Enter, then Ctrl+D (Mac/Linux) or Ctrl+Z (Windows) when done:")
    print()

    # Read from stdin
    tsv_data = sys.stdin.read()

    if not tsv_data.strip():
        print("\nNo data provided. Exiting.")
        return

    # Parse cookies
    cookies = parse_cookies_from_tsv(tsv_data)

    if not cookies:
        print("\nNo valid cookies found. Make sure you copied from:")
        print("  - lcr.churchofjesuschrist.org")
        print("  - id.churchofjesuschrist.org")
        return

    # Create JSON structure
    output = {
        "cookies": cookies
    }

    # Save to file
    output_file = '/Users/jarombrown/PycharmProjects/church/callings/.lcr_cookies.json'

    with open(output_file, 'w') as f:
        json.dump(output, f, indent=2)

    print(f"\n✓ Success! Converted {len(cookies)} cookies")
    print(f"✓ Saved to: {output_file}")
    print()
    print("Cookie names found:")
    for name in sorted(cookies.keys()):
        print(f"  - {name}")
    print()
    print("Now you can run:")
    print("  python3 scripts/sync_from_lcr.py")
    print()


if __name__ == '__main__':
    main()
