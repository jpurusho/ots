"""
Migrate local Supabase data and images to cloud Supabase.

Usage:
    cd backend && source .venv/bin/activate
    python ../scripts/migrate-to-cloud.py

Reads from local Supabase (Docker) and writes to cloud Supabase.
Migrates: offerings, offering_checks, app_settings, images.
Does NOT migrate: auth users (they sign in fresh on cloud), activity_log (starts fresh).
"""

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

# Load env
load_dotenv(Path(__file__).parent.parent / "backend" / ".env")

# ── Configuration ────────────────────────────────────────────────────────────

LOCAL_URL = "http://127.0.0.1:54321"
LOCAL_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

CLOUD_URL = os.getenv("CLOUD_SUPABASE_URL", "https://xtbzyficagznxatzxlzy.supabase.co")
CLOUD_KEY = os.getenv("CLOUD_SUPABASE_SERVICE_KEY", "")

if not CLOUD_KEY:
    print("ERROR: Set CLOUD_SUPABASE_SERVICE_KEY environment variable")
    print("  export CLOUD_SUPABASE_SERVICE_KEY='eyJ...'")
    sys.exit(1)

local = create_client(LOCAL_URL, LOCAL_KEY)
cloud = create_client(CLOUD_URL, CLOUD_KEY)


def migrate_settings():
    """Migrate app_settings (upsert to preserve cloud-specific values)."""
    print("\n=== Migrating app_settings ===")
    result = local.table("app_settings").select("*").execute()
    settings = result.data or []
    print(f"  Found {len(settings)} settings locally")

    for s in settings:
        try:
            cloud.table("app_settings").upsert(s, on_conflict="key").execute()
            print(f"  OK: {s['key']} = {s['value'][:50] if s.get('value') else 'null'}")
        except Exception as e:
            print(f"  SKIP: {s['key']} — {e}")


def migrate_offerings():
    """Migrate offerings and their images."""
    print("\n=== Migrating offerings ===")
    result = local.table("offerings").select("*").order("id").execute()
    offerings = result.data or []
    print(f"  Found {len(offerings)} offerings locally")

    migrated = 0
    skipped = 0
    errors = 0

    for o in offerings:
        # Check if already exists on cloud (by filename)
        existing = cloud.table("offerings").select("id").eq("filename", o["filename"]).execute()
        if existing.data:
            print(f"  SKIP: {o['filename']} — already exists on cloud (id={existing.data[0]['id']})")
            skipped += 1
            continue

        image_path = o.get("image_path")

        # Upload image to cloud storage
        if image_path:
            try:
                # Download from local storage
                image_bytes = local.storage.from_("offering-images").download(image_path)

                # Upload to cloud storage
                cloud.storage.from_("offering-images").upload(
                    image_path, image_bytes,
                    file_options={"content-type": "image/jpeg", "upsert": "true"}
                )
                print(f"  IMAGE: {image_path} uploaded to cloud")
            except Exception as e:
                err = str(e)
                if "already exists" in err.lower() or "duplicate" in err.lower():
                    print(f"  IMAGE: {image_path} already on cloud")
                else:
                    print(f"  IMAGE ERROR: {image_path} — {e}")

        # Insert offering record (without id — let cloud generate new id)
        offering_data = {k: v for k, v in o.items() if k != "id"}

        # Handle scan_data — ensure it's proper JSON
        if offering_data.get("scan_data") and isinstance(offering_data["scan_data"], str):
            try:
                offering_data["scan_data"] = json.loads(offering_data["scan_data"])
            except (json.JSONDecodeError, TypeError):
                pass

        try:
            result = cloud.table("offerings").insert(offering_data).execute()
            new_id = result.data[0]["id"] if result.data else None
            print(f"  OK: {o['filename']} (local id={o['id']} → cloud id={new_id})")
            migrated += 1

            # Migrate linked check records
            if new_id:
                migrate_checks_for_offering(o["id"], new_id)

        except Exception as e:
            print(f"  ERROR: {o['filename']} — {e}")
            errors += 1

    print(f"\n  Summary: {migrated} migrated, {skipped} skipped, {errors} errors")


def migrate_checks_for_offering(local_offering_id: int, cloud_offering_id: int):
    """Migrate offering_checks for a specific offering."""
    result = local.table("offering_checks").select("*").eq("offering_id", local_offering_id).execute()
    checks = result.data or []

    for c in checks:
        check_data = {k: v for k, v in c.items() if k != "id"}
        check_data["offering_id"] = cloud_offering_id  # Map to new cloud ID

        try:
            cloud.table("offering_checks").upsert(
                check_data, on_conflict="content_hash"
            ).execute()
            print(f"    CHECK: #{c.get('check_number', '?')} {c.get('payer_name', 'Unknown')} — ${c.get('amount', 0)}")
        except Exception as e:
            print(f"    CHECK ERROR: {c.get('payer_name')} — {e}")


def verify_cloud():
    """Verify cloud data after migration."""
    print("\n=== Verification ===")
    for table in ["offerings", "offering_checks", "app_settings"]:
        result = cloud.table(table).select("*", count="exact", head=True).execute()
        print(f"  {table}: {result.count} rows")

    # Check storage
    files = cloud.storage.from_("offering-images").list("2026")
    print(f"  offering-images/2026: {len(files)} files")


if __name__ == "__main__":
    print(f"Local:  {LOCAL_URL}")
    print(f"Cloud:  {CLOUD_URL}")
    print()

    migrate_settings()
    migrate_offerings()
    verify_cloud()

    print("\n✓ Migration complete!")
    print(f"  Production URL: {CLOUD_URL}")
    print(f"  App: https://jpurusho.github.io/ots/")
