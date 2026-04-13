"""
OTS Backend — AI scanning service.

Connects to Supabase for image storage and DB updates.
Scans images via AWS Bedrock (dev) or Anthropic API (prod).

Usage:
    cd backend && source .venv/bin/activate
    uvicorn main:app --port 8000 --reload
"""

import json
import os
from contextlib import asynccontextmanager

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client

from scanner import scan_image

load_dotenv()

# ── Supabase client (service role for backend operations) ────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# ── Claude client ────────────────────────────────────────────────────────────
# Auto-detects: ANTHROPIC_API_KEY for direct API, or AWS credentials for Bedrock
USE_BEDROCK = os.getenv("USE_BEDROCK", "true").lower() == "true"


def get_claude_client() -> anthropic.Anthropic:
    if USE_BEDROCK:
        return anthropic.AnthropicBedrock(
            aws_region=os.getenv("AWS_REGION", "us-east-1"),
        )
    return anthropic.Anthropic()


def get_model_id() -> str:
    if USE_BEDROCK:
        return "us.anthropic.claude-sonnet-4-6"
    return os.getenv("SCANNER_MODEL", "claude-sonnet-4-6-20250929")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify connections."""
    print(f"[Backend] Supabase URL: {SUPABASE_URL}")
    print(f"[Backend] Using {'Bedrock' if USE_BEDROCK else 'Anthropic API'}")
    yield


app = FastAPI(title="OTS Scanner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    offering_id: int


@app.get("/health")
async def health():
    return {"status": "ok", "scanner": "bedrock" if USE_BEDROCK else "anthropic"}


@app.post("/api/scan")
async def scan_offering(req: ScanRequest):
    """
    Scan an offering image:
    1. Read offering record from Supabase
    2. Download image from Supabase Storage
    3. Send to Claude for extraction
    4. Write results back to offering record
    """
    # 1. Get offering record
    result = supabase.table("offerings").select("*").eq("id", req.offering_id).single().execute()
    offering = result.data
    if not offering:
        raise HTTPException(404, f"Offering {req.offering_id} not found")

    image_path = offering.get("image_path")
    if not image_path:
        raise HTTPException(400, "Offering has no image")

    # 2. Download image from Supabase Storage
    try:
        image_bytes = supabase.storage.from_("offering-images").download(image_path)
    except Exception as e:
        raise HTTPException(500, f"Failed to download image: {e}")

    # Determine media type from extension
    ext = image_path.rsplit(".", 1)[-1].lower() if "." in image_path else "jpg"
    media_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                 "heic": "image/jpeg", "heif": "image/jpeg"}
    media_type = media_map.get(ext, "image/jpeg")

    # 3. Scan with Claude
    try:
        client = get_claude_client()
        model = get_model_id()
        filename = offering.get("filename") or f"offering_{req.offering_id}"

        results = scan_image(image_bytes, media_type, filename, client, model)
    except Exception as e:
        # Write error to offering record
        supabase.table("offerings").update({
            "scan_error": str(e),
            "status": "scan_error",
        }).eq("id", req.offering_id).execute()
        raise HTTPException(500, f"Scan failed: {e}")

    if not results:
        supabase.table("offerings").update({
            "scan_error": "No offerings found in image",
            "status": "scan_error",
        }).eq("id", req.offering_id).execute()
        return {"success": False, "error": "No offerings found"}

    # Handle not-offering images
    if results[0].get("type") == "not_offering":
        supabase.table("offerings").update({
            "scan_error": results[0].get("notes", "Not an offering slip"),
            "status": "scan_error",
        }).eq("id", req.offering_id).execute()
        return {"success": False, "error": results[0].get("notes")}

    # 4. Write first result to offering record (multi-slip handling later)
    item = results[0]
    categories = item.get("categories", {})
    scan_data = item.get("scan_data", {})

    update = {
        "offering_date": item.get("date"),
        "date_conf": item.get("date_confidence"),
        "general": categories.get("general") or 0,
        "cash": categories.get("cash") or 0,
        "sunday_school": categories.get("sunday_school") or 0,
        "building_fund": categories.get("building_fund") or 0,
        "misc": categories.get("misc") or 0,
        "notes": item.get("clean_notes") or item.get("notes"),
        "scan_data": json.dumps(scan_data) if isinstance(scan_data, dict) else scan_data,
        "status": "scanned",
        "scanned_at": "now()",
        "scan_error": None,
    }

    supabase.table("offerings").update(update).eq("id", req.offering_id).execute()

    # Create offering_checks records if this is a bank check image
    # Check images have notes like "Check #2001 from Thomas Abraham - Building Fund"
    import re
    check_records_created = 0
    notes_text = item.get("notes") or item.get("clean_notes") or ""
    raw_notes = ""
    if isinstance(scan_data, dict):
        raw_notes = scan_data.get("notes", "") or ""

    combined_notes = f"{notes_text} {raw_notes}"

    # Look for check pattern in notes
    check_match = re.search(
        r'[Cc]heck\s*#?\s*(\d+)\s*(?:from|by)\s+([^-–—\n]+?)(?:\s*[-–—]\s*(.+?))?(?:\.|$)',
        combined_notes
    )

    if check_match:
        check_number = check_match.group(1)
        payer_name = check_match.group(2).strip()
        memo = (check_match.group(3) or "").strip()

        # Determine category and amount from the offering
        check_amount = 0
        check_category = "general"
        if categories.get("building_fund") and categories["building_fund"] > 0:
            check_amount = categories["building_fund"]
            check_category = "building_fund"
        elif categories.get("general") and categories["general"] > 0:
            check_amount = categories["general"]
            check_category = "general"

        if payer_name and check_amount > 0:
            import hashlib
            content_hash = hashlib.md5(
                f"{check_number}:{payer_name}:{check_amount}".encode()
            ).hexdigest()

            try:
                supabase.table("offering_checks").upsert({
                    "offering_id": req.offering_id,
                    "check_number": check_number,
                    "payer_name": payer_name,
                    "memo": memo or None,
                    "amount": check_amount,
                    "category": check_category,
                    "content_hash": content_hash,
                    "image_filename": offering.get("filename"),
                }, on_conflict="content_hash").execute()
                check_records_created = 1
            except Exception as e:
                print(f"[Scan] Failed to create check record: {e}")

    return {
        "success": True,
        "offering_id": req.offering_id,
        "date": item.get("date"),
        "total": item.get("computed_total", 0),
        "categories": categories,
        "slips_found": len(results),
        "checks_created": check_records_created,
    }


@app.post("/api/scan-all")
async def scan_all_pending():
    """Scan all uploaded offerings that haven't been scanned yet."""
    result = supabase.table("offerings").select("id, filename").eq("status", "uploaded").execute()
    offerings = result.data or []

    if not offerings:
        return {"success": True, "message": "No offerings to scan", "scanned": 0}

    scanned = 0
    errors = 0
    results = []

    for offering in offerings:
        try:
            scan_result = await scan_offering(ScanRequest(offering_id=offering["id"]))
            if scan_result.get("success"):
                scanned += 1
            else:
                errors += 1
            results.append({"id": offering["id"], "filename": offering["filename"], **scan_result})
        except Exception as e:
            errors += 1
            results.append({"id": offering["id"], "filename": offering["filename"],
                           "success": False, "error": str(e)})

    return {"success": True, "scanned": scanned, "errors": errors, "total": len(offerings), "results": results}
