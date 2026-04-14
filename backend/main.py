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


# ── Google Drive Endpoints ───────────────────────────────────────────────────

from drive_service import (
    get_drive_service, list_drive_images, download_drive_file,
    upload_to_drive, test_drive_connection, compute_file_hash,
    list_drive_folders, get_folder_path,
)


def _get_setting(key: str) -> str:
    """Get a setting value from Supabase."""
    result = supabase.table("app_settings").select("value").eq("key", key).single().execute()
    return result.data.get("value", "") if result.data else ""


class DriveTestRequest(BaseModel):
    folder_id: str


class DriveImportRequest(BaseModel):
    folder_id: str | None = None
    auto_scan: bool = True


class DriveUploadReportRequest(BaseModel):
    filename: str
    content_base64: str
    mime_type: str = "application/pdf"


@app.get("/api/drive/folders")
async def browse_drive_folders(parent: str = "root"):
    """Browse Drive folders for the folder picker."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        raise HTTPException(400, "No service account credentials configured")
    try:
        service = get_drive_service(creds)
        folders = list_drive_folders(service, parent)
        # Get current folder path if not root
        path = ""
        if parent != "root":
            path = get_folder_path(service, parent)
        return {"folders": folders, "parent": parent, "path": path}
    except Exception as e:
        raise HTTPException(500, f"Failed to browse folders: {e}")


@app.post("/api/drive/test")
async def test_drive(req: DriveTestRequest):
    """Test Google Drive connection with service account credentials."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        return {"success": False, "error": "No service account credentials configured. Add them in Settings."}
    return test_drive_connection(creds, req.folder_id)


@app.post("/api/drive/import")
async def import_from_drive(req: DriveImportRequest):
    """Import new images from Google Drive folder into Supabase."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        raise HTTPException(400, "No service account credentials configured")

    folder_id = req.folder_id or _get_setting("drive_images_folder_id")
    if not folder_id:
        raise HTTPException(400, "No Drive images folder configured")

    try:
        service = get_drive_service(creds)
        drive_files = list_drive_images(service, folder_id)
    except Exception as e:
        raise HTTPException(500, f"Failed to list Drive folder: {e}")

    if not drive_files:
        return {"success": True, "message": "No image files found in folder", "imported": 0}

    # Get existing filenames and hashes to detect duplicates
    existing = supabase.table("offerings").select("filename, file_hash").execute()
    existing_names = {r["filename"] for r in (existing.data or [])}
    existing_hashes = {r["file_hash"] for r in (existing.data or []) if r.get("file_hash")}

    imported = 0
    skipped = 0
    errors = 0
    results = []

    for df in drive_files:
        # Skip by filename
        if df["name"] in existing_names:
            skipped += 1
            results.append({"name": df["name"], "status": "skipped", "reason": "Already uploaded"})
            continue

        try:
            # Download from Drive
            content = download_drive_file(service, df["id"])
            file_hash = compute_file_hash(content)

            # Skip by content hash
            if file_hash in existing_hashes:
                skipped += 1
                results.append({"name": df["name"], "status": "skipped", "reason": "Duplicate content"})
                continue

            # Upload to Supabase Storage
            import time
            timestamp = int(time.time() * 1000)
            year = time.strftime("%Y")
            safe_name = df["name"].replace(" ", "_")
            storage_path = f"{year}/{timestamp}_{safe_name}"

            ext = df["name"].rsplit(".", 1)[-1].lower() if "." in df["name"] else "jpg"
            mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                       "heic": "image/jpeg", "heif": "image/jpeg", "pdf": "application/pdf"}
            content_type = mime_map.get(ext, "image/jpeg")

            supabase.storage.from_("offering-images").upload(
                storage_path, content,
                file_options={"content-type": content_type}
            )

            # Create offering record
            result = supabase.table("offerings").insert({
                "filename": df["name"],
                "file_hash": file_hash,
                "image_path": storage_path,
                "status": "uploaded",
                "source_type": "scanned",
            }).execute()

            offering_id = result.data[0]["id"] if result.data else None

            # Auto-scan if requested
            scan_result = None
            if req.auto_scan and offering_id:
                try:
                    scan_result = await scan_offering(ScanRequest(offering_id=offering_id))
                except Exception as e:
                    scan_result = {"success": False, "error": str(e)}

            imported += 1
            results.append({
                "name": df["name"],
                "status": "imported",
                "offering_id": offering_id,
                "scan": scan_result,
            })

        except Exception as e:
            errors += 1
            results.append({"name": df["name"], "status": "error", "reason": str(e)})

    return {
        "success": True,
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "total": len(drive_files),
        "results": results,
    }


@app.post("/api/drive/upload-report")
async def upload_report_to_drive(req: DriveUploadReportRequest):
    """Upload a generated report to Google Drive reports folder."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        raise HTTPException(400, "No service account credentials configured")

    folder_id = _get_setting("drive_reports_folder_id")
    if not folder_id:
        raise HTTPException(400, "No Drive reports folder configured")

    import base64
    try:
        content = base64.b64decode(req.content_base64)
        service = get_drive_service(creds)
        result = upload_to_drive(service, folder_id, req.filename, content, req.mime_type)
        return {
            "success": True,
            "file_id": result.get("id"),
            "name": result.get("name"),
            "link": result.get("webViewLink"),
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to upload to Drive: {e}")


# ── Email Endpoints ──────────────────────────────────────────────────────────

import smtplib
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication


class EmailTestRequest(BaseModel):
    to: str | None = None


class SendEmailRequest(BaseModel):
    to: list[str]
    subject: str
    html_body: str
    attachment_base64: str | None = None
    attachment_filename: str | None = None
    attachment_mime: str = "application/pdf"


@app.post("/api/email/test")
async def test_email(req: EmailTestRequest):
    """Test SMTP connection."""
    smtp_user = _get_setting("smtp_user")
    smtp_pass = _get_setting("smtp_password")
    if not smtp_user or not smtp_pass:
        return {"success": False, "error": "SMTP not configured. Add Gmail user and app password in Settings."}

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        if req.to:
            msg = MIMEText("This is a test email from OTS.", "plain")
            msg["Subject"] = "OTS Test Email"
            msg["From"] = smtp_user
            msg["To"] = req.to
            server.sendmail(smtp_user, [req.to], msg.as_string())
        server.quit()
        return {"success": True, "message": f"SMTP connection OK{' — test email sent to ' + req.to if req.to else ''}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/email/send")
async def send_email(req: SendEmailRequest):
    """Send an HTML email with optional PDF attachment."""
    smtp_user = _get_setting("smtp_user")
    smtp_pass = _get_setting("smtp_password")
    if not smtp_user or not smtp_pass:
        raise HTTPException(400, "SMTP not configured")

    try:
        msg = MIMEMultipart("mixed")
        msg["Subject"] = req.subject
        msg["From"] = smtp_user
        msg["To"] = ", ".join(req.to)

        # HTML body
        html_part = MIMEText(req.html_body, "html")
        msg.attach(html_part)

        # Optional attachment
        if req.attachment_base64 and req.attachment_filename:
            attachment_data = base64.b64decode(req.attachment_base64)
            attachment = MIMEApplication(attachment_data, Name=req.attachment_filename)
            attachment["Content-Disposition"] = f'attachment; filename="{req.attachment_filename}"'
            msg.attach(attachment)

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.sendmail(smtp_user, req.to, msg.as_string())
        server.quit()

        return {"success": True, "message": f"Email sent to {len(req.to)} recipients"}
    except Exception as e:
        raise HTTPException(500, f"Failed to send email: {e}")
