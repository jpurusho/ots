#!/usr/bin/env python3
"""
Simulates organic app usage to keep Supabase active.
Each run varies randomly: different tables, queries, timing, and order.
Only reads + one timestamp upsert (no data accumulation).
"""

import json
import os
import random
import sys
import time
import urllib.request
import urllib.error

URL = os.environ.get("SUPABASE_URL", "")
KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not URL or not KEY:
    print("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_KEY")
    sys.exit(1)

random.seed(int(time.time()))


def api_get(path):
    req = urllib.request.Request(f"{URL}{path}",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Accept": "application/json"})
    try:
        resp = urllib.request.urlopen(req)
        return resp.status, json.loads(resp.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, None


def api_post(path, body):
    req = urllib.request.Request(f"{URL}{path}", data=json.dumps(body).encode(), method="POST",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}",
                 "Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    try:
        resp = urllib.request.urlopen(req)
        return resp.status
    except urllib.error.HTTPError:
        return 0


# ── Available operations ──────────────────────────────────────────────────────

TABLES = ["offerings", "offering_checks", "app_users", "app_settings", "activity_log"]
SETTINGS_KEYS = ["church_name", "smtp_user", "scanner_model", "use_bedrock", "items_per_page",
                 "report_accent_color", "card_accent_color", "app_theme"]


def op_read_random_table():
    table = random.choice(TABLES)
    limit = random.randint(1, 10)
    offset = random.randint(0, 20)
    code, data = api_get(f"/rest/v1/{table}?select=id&limit={limit}&offset={offset}")
    return f"read {table} limit={limit} offset={offset} → HTTP {code}"


def op_read_settings():
    keys = random.sample(SETTINGS_KEYS, k=random.randint(1, 4))
    keys_param = ",".join(keys)
    code, data = api_get(f"/rest/v1/app_settings?key=in.({keys_param})&select=key,value")
    count = len(data) if isinstance(data, list) else 0
    return f"read settings [{keys_param}] → {count} rows"


def op_count_table():
    table = random.choice(TABLES)
    code, data = api_get(f"/rest/v1/{table}?select=id")
    count = len(data) if isinstance(data, list) else "?"
    return f"count {table} → {count} rows"


def op_read_storage():
    limit = random.randint(1, 5)
    req = urllib.request.Request(f"{URL}/storage/v1/object/list/offering-images",
        data=json.dumps({"prefix": "", "limit": limit, "offset": random.randint(0, 10)}).encode(),
        method="POST",
        headers={"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    try:
        resp = urllib.request.urlopen(req)
        data = json.loads(resp.read())
        return f"list storage files limit={limit} → {len(data)} files"
    except:
        return "storage list → error"


def op_auth_check():
    code, data = api_get("/auth/v1/admin/users?page=1&per_page=3")
    users = len(data.get("users", [])) if isinstance(data, dict) else 0
    return f"auth users → {users} found"


def op_upsert_timestamp():
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    nonce = random.randint(1000, 9999)
    code = api_post("/rest/v1/app_settings", {
        "key": "keepalive_last_ping",
        "value": f"{ts}-{nonce}",
        "category": "system",
        "data_type": "string",
        "label": "Last Activity",
        "description": "Auto-updated by organic activity script",
    })
    return f"upsert timestamp {ts}-{nonce} → HTTP {code}"


def op_read_recent_activity():
    limit = random.randint(2, 8)
    code, data = api_get(f"/rest/v1/activity_log?select=action,details&order=created_at.desc&limit={limit}")
    count = len(data) if isinstance(data, list) else 0
    return f"recent activity limit={limit} → {count} entries"


ALL_OPS = [
    op_read_random_table, op_read_settings, op_count_table,
    op_read_storage, op_auth_check, op_upsert_timestamp,
    op_read_recent_activity,
]

# ── Main ──────────────────────────────────────────────────────────────────────

print(f"\n  Organic Activity — {URL}")
print(f"  Time: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
print(f"  Seed: {int(time.time())}\n")

# Pick 3-6 random operations (always include timestamp upsert)
num_ops = random.randint(3, 6)
ops = random.sample([op for op in ALL_OPS if op != op_upsert_timestamp], k=min(num_ops - 1, len(ALL_OPS) - 1))
ops.append(op_upsert_timestamp)
random.shuffle(ops)

for i, op in enumerate(ops):
    # Random delay 0.5–3s between operations
    if i > 0:
        delay = random.uniform(0.5, 3.0)
        time.sleep(delay)
    result = op()
    print(f"  [{i+1}/{len(ops)}] {result}")

print(f"\n  Done. {len(ops)} operations completed.\n")
