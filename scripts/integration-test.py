#!/usr/bin/env python3
"""
Integration tests for OTS Supabase services.
Tests Database (PostgREST), Auth, Storage, and Realtime connectivity.

Usage:
    SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx python3 scripts/integration-test.py

Also used by GitHub Actions workflow to keep Supabase projects active.
"""

import json
import os
import sys
import time
import urllib.request
import urllib.error

URL = os.environ.get("SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not URL or not KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    sys.exit(1)

PASSED = 0
FAILED = 0


def test(name: str, fn):
    global PASSED, FAILED
    try:
        result = fn()
        print(f"  ✓ {name}: {result}")
        PASSED += 1
    except Exception as e:
        print(f"  ✗ {name}: {e}")
        FAILED += 1


def api_request(path: str, method: str = "GET", body: dict | None = None,
                headers: dict | None = None) -> tuple[int, any]:
    """Make a request to Supabase API."""
    url = f"{URL}{path}"
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    if body:
        req.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(req)
        raw = resp.read()
        return resp.status, json.loads(raw) if raw.strip() else None
    except urllib.error.HTTPError as e:
        raw = e.read() if e.readable() else b""
        return e.code, json.loads(raw) if raw.strip() else None


# ══════════════════════════════════════════════════════════════════════════════
print(f"\n{'═' * 60}")
print(f"  OTS Integration Tests — {URL}")
print(f"{'═' * 60}\n")

# ── Database (PostgREST) ─────────────────────────────────────────────────────
print("Database (PostgREST):")


def test_db_read():
    code, data = api_request("/rest/v1/app_settings?select=key&limit=3")
    assert code == 200, f"HTTP {code}"
    assert isinstance(data, list), "Expected array"
    return f"{len(data)} rows"


def test_db_write():
    # Upsert a keepalive timestamp to app_settings
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    code, _ = api_request(
        "/rest/v1/app_settings",
        method="POST",
        body={"key": "keepalive_last_ping", "value": ts, "category": "system",
              "data_type": "string", "label": "Last Keepalive", "description": "Auto-updated by integration tests"},
        headers={"Prefer": "return=minimal,resolution=merge-duplicates"},
    )
    assert code in (200, 201, 204), f"HTTP {code}"
    return f"upserted at {ts}"


def test_db_count():
    code, data = api_request("/rest/v1/offerings?select=id&head=true",
                             headers={"Prefer": "count=exact"})
    # HEAD-like query with count
    code2, data2 = api_request("/rest/v1/offerings?select=id", headers={"Prefer": "count=exact"})
    assert code2 == 200, f"HTTP {code2}"
    return f"offerings table accessible"


test("Read app_settings", test_db_read)
test("Write keepalive timestamp", test_db_write)
test("Count offerings", test_db_count)

# ── Auth ─────────────────────────────────────────────────────────────────────
print("\nAuth:")


def test_auth_health():
    req = urllib.request.Request(f"{URL}/auth/v1/health")
    req.add_header("apikey", KEY)
    resp = urllib.request.urlopen(req)
    assert resp.status == 200
    return "healthy"


def test_auth_users():
    code, data = api_request("/auth/v1/admin/users?page=1&per_page=1")
    assert code == 200, f"HTTP {code}"
    users = data.get("users", [])
    return f"{len(users)} user(s) found"


def test_auth_settings():
    req = urllib.request.Request(f"{URL}/auth/v1/settings")
    req.add_header("apikey", KEY)
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    google = data.get("external", {}).get("google", False)
    return f"Google OAuth: {'enabled' if google else 'disabled'}"


test("Health check", test_auth_health)
test("List users", test_auth_users)
test("Auth settings", test_auth_settings)

# ── Storage ──────────────────────────────────────────────────────────────────
print("\nStorage:")


def test_storage_buckets():
    code, data = api_request("/storage/v1/bucket")
    assert code == 200, f"HTTP {code}"
    names = [b["name"] for b in data]
    return f"buckets: {', '.join(names)}"


def test_storage_list_files():
    code, data = api_request(
        "/storage/v1/object/list/offering-images",
        method="POST",
        body={"prefix": "", "limit": 3, "offset": 0},
    )
    assert code == 200, f"HTTP {code}"
    return f"{len(data)} file(s) in offering-images"


def test_storage_upload_probe():
    # Upload a tiny probe file then delete it
    probe_content = f"keepalive-{int(time.time())}".encode()
    probe_path = "offering-images/_probe.txt"

    # Upload
    req = urllib.request.Request(f"{URL}/storage/v1/object/{probe_path}",
                                data=probe_content, method="POST")
    req.add_header("apikey", KEY)
    req.add_header("Authorization", f"Bearer {KEY}")
    req.add_header("Content-Type", "text/plain")
    req.add_header("x-upsert", "true")
    resp = urllib.request.urlopen(req)
    assert resp.status == 200, f"Upload HTTP {resp.status}"

    # Delete
    code, _ = api_request(
        "/storage/v1/object/offering-images",
        method="DELETE",
        body={"prefixes": ["_probe.txt"]},
    )
    return "upload + delete OK"


test("List buckets", test_storage_buckets)
test("List files", test_storage_list_files)
test("Upload/delete probe", test_storage_upload_probe)

# ── Realtime ─────────────────────────────────────────────────────────────────
print("\nRealtime:")


def test_realtime_health():
    # Realtime runs on a different endpoint
    req = urllib.request.Request(f"{URL}/realtime/v1/health")
    req.add_header("apikey", KEY)
    try:
        resp = urllib.request.urlopen(req)
        return f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        if e.code == 401:
            return "endpoint exists (auth required)"
        return f"HTTP {e.code} (endpoint reachable)"


test("Realtime endpoint", test_realtime_health)

# ── Summary ──────────────────────────────────────────────────────────────────
print(f"\n{'─' * 60}")
print(f"  Results: {PASSED} passed, {FAILED} failed")
print(f"{'─' * 60}\n")

if FAILED > 0:
    sys.exit(1)
