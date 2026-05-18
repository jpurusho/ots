#!/usr/bin/env python3
"""
Sync data between cloud and local Supabase instances.

Usage:
    python3 scripts/sync-data.py --from cloud --to local
    python3 scripts/sync-data.py --from local --to cloud
    python3 scripts/sync-data.py --from cloud --to local --include-storage

Environment variables:
    CLOUD_URL, CLOUD_SERVICE_KEY — cloud Supabase credentials
    LOCAL_URL, LOCAL_SERVICE_KEY — local Supabase credentials (defaults to standard local keys)
"""

import argparse
import json
import os
import sys
import urllib.request
import urllib.error

# Default local Supabase keys (from `npx supabase start`)
LOCAL_DEFAULTS = {
    "url": "http://127.0.0.1:54321",
    "service_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
}

TABLES = ["app_settings", "app_users", "offerings", "offering_checks", "activity_log"]


def get_creds(env: str) -> tuple[str, str]:
    if env == "local":
        url = os.environ.get("LOCAL_URL", LOCAL_DEFAULTS["url"])
        key = os.environ.get("LOCAL_SERVICE_KEY", LOCAL_DEFAULTS["service_key"])
    else:
        url = os.environ.get("CLOUD_URL", "")
        key = os.environ.get("CLOUD_SERVICE_KEY", "")
        if not url or not key:
            # Try reading from ~/.ots/config.json
            config_path = os.path.expanduser("~/.ots/config.json")
            if os.path.exists(config_path):
                config = json.load(open(config_path))
                active = config.get("activeEnv", "prod")
                sb = config.get("supabase", {}).get(active, {})
                url = url or sb.get("url", "")
                key = key or sb.get("serviceKey", "")
        if not url or not key:
            print(f"ERROR: Set CLOUD_URL and CLOUD_SERVICE_KEY (or have ~/.ots/config.json)")
            sys.exit(1)
    return url, key


def fetch_table(url: str, key: str, table: str) -> list[dict]:
    """Fetch all rows from a table."""
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}?select=*",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise


def upsert_table(url: str, key: str, table: str, rows: list[dict]) -> int:
    """Upsert rows into a table."""
    if not rows:
        return 0
    data = json.dumps(rows).encode()
    req = urllib.request.Request(
        f"{url}/rest/v1/{table}",
        data=data,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        },
    )
    try:
        urllib.request.urlopen(req)
        return len(rows)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  WARNING: upsert {table} failed: {e.code} — {body[:200]}")
        return 0


def main():
    parser = argparse.ArgumentParser(description="Sync OTS data between Supabase instances")
    parser.add_argument("--from", dest="source", required=True, choices=["cloud", "local"])
    parser.add_argument("--to", dest="target", required=True, choices=["cloud", "local"])
    parser.add_argument("--include-storage", action="store_true", help="Also sync storage bucket files")
    parser.add_argument("--tables", nargs="*", help="Only sync specific tables")
    args = parser.parse_args()

    if args.source == args.target:
        print("ERROR: source and target must be different")
        sys.exit(1)

    src_url, src_key = get_creds(args.source)
    dst_url, dst_key = get_creds(args.target)

    tables = args.tables or TABLES
    print(f"Syncing {args.source} → {args.target}")
    print(f"  Source: {src_url}")
    print(f"  Target: {dst_url}")
    print()

    total = 0
    for table in tables:
        rows = fetch_table(src_url, src_key, table)
        if rows:
            count = upsert_table(dst_url, dst_key, table, rows)
            print(f"  {table}: {count} rows synced")
            total += count
        else:
            print(f"  {table}: empty (skipped)")

    print(f"\nDone. {total} total rows synced.")

    if args.include_storage:
        print("\nStorage sync not yet implemented — use supabase CLI for bucket sync:")
        print(f"  supabase storage cp -r {src_url}/storage/v1/object/offering-images ./backup/")


if __name__ == "__main__":
    main()
