import json
import sys
sys.path.insert(0, "/app/scripts")
from sync_from_membertools import OAuthClient

client = OAuthClient("/app/.oauth_tokens.json")
data = client.sync()

for org in data.get("organizations", []):
    name = org.get("name", "")
    if "Bishop" in name or "High Priest" in name:
        print(f"Org: {name}")
        print(f"  orgTypes: {org.get('orgTypes', [])}")
        print(f"  positions: {len(org.get('positions', []))} positions")
        for child in org.get("childOrgs", []):
            cname = child.get("name")
            print(f"  Child: {cname}")
            print(f"    orgTypes: {child.get('orgTypes', [])}")
            print(f"    positions: {len(child.get('positions', []))} positions")
        print("---")
