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
from typing import Optional

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

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
else:
    print("[Backend] WARNING: SUPABASE_SERVICE_KEY not set — scanning, Drive, email, and PDF features will not work")

# ── Claude client ────────────────────────────────────────────────────────────


def _get_ai_config() -> dict:
    """Read AI config from Supabase settings, with env var fallbacks."""
    try:
        result = supabase.table("app_settings").select("key, value").in_("key", [
            "use_bedrock", "anthropic_api_key", "scanner_model"
        ]).execute()
        config = {r["key"]: r["value"] for r in (result.data or [])}
    except Exception:
        config = {}

    return {
        "use_bedrock": (config.get("use_bedrock") or os.getenv("USE_BEDROCK", "true")).lower() == "true",
        "api_key": config.get("anthropic_api_key") or os.getenv("ANTHROPIC_API_KEY", ""),
        "model": config.get("scanner_model") or os.getenv("SCANNER_MODEL", "claude-sonnet-4-6-20250929"),
    }


def get_claude_client() -> anthropic.Anthropic:
    config = _get_ai_config()
    if config["use_bedrock"]:
        return anthropic.AnthropicBedrock(
            aws_region=os.getenv("AWS_REGION", "us-east-1"),
        )
    # Use custom httpx client to handle SSL issues (corporate proxies, macOS cert issues)
    import httpx
    http_client = httpx.Client(verify=False)
    if config["api_key"]:
        return anthropic.Anthropic(api_key=config["api_key"], http_client=http_client)
    return anthropic.Anthropic(http_client=http_client)


def get_model_id() -> str:
    config = _get_ai_config()
    if config["use_bedrock"]:
        return "us.anthropic.claude-sonnet-4-6"
    return "claude-sonnet-4-6"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: verify connections."""
    print(f"[Backend] Supabase URL: {SUPABASE_URL}")
    if supabase:
        config = _get_ai_config()
        print(f"[Backend] Using {'Bedrock' if config['use_bedrock'] else 'Anthropic API'}")
    else:
        print("[Backend] Running without Supabase — configure service key for full functionality")
    yield


app = FastAPI(title="OTS Scanner", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    offering_id: int


@app.get("/health")
async def health():
    if not supabase:
        return {"status": "ok", "scanner": "unconfigured"}
    config = _get_ai_config()
    return {"status": "ok", "scanner": "bedrock" if config["use_bedrock"] else "anthropic"}


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

    # Convert HEIC/HEIF to JPEG (Claude API can't process HEIC directly)
    ext = image_path.rsplit(".", 1)[-1].lower() if "." in image_path else "jpg"
    if ext in ("heic", "heif"):
        try:
            import pillow_heif
            from PIL import Image
            import io as _io
            pillow_heif.register_heif_opener()
            img = Image.open(_io.BytesIO(image_bytes))
            buf = _io.BytesIO()
            img.save(buf, format="JPEG", quality=95)
            image_bytes = buf.getvalue()
            ext = "jpg"
        except Exception as e:
            print(f"[Scan] HEIC conversion failed: {e}, trying raw")

    media_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png"}
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

    # Track API usage
    usage = item.get("usage", {})
    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    if input_tokens > 0 or output_tokens > 0:
        try:
            # Sonnet pricing: $3/M input, $15/M output
            cost = (input_tokens * 3 + output_tokens * 15) / 1_000_000
            # Update cumulative counters
            for key, val in [("api_total_input_tokens", input_tokens), ("api_total_output_tokens", output_tokens),
                             ("api_total_scans", 1), ("api_total_cost", cost)]:
                current = _get_setting(key)
                new_val = float(current or 0) + val
                supabase.table("app_settings").update({"value": str(new_val)}).eq("key", key).execute()
        except Exception as e:
            print(f"[Scan] Usage tracking failed: {e}")

    return {
        "success": True,
        "offering_id": req.offering_id,
        "date": item.get("date"),
        "total": item.get("computed_total", 0),
        "categories": categories,
        "slips_found": len(results),
        "checks_created": check_records_created,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
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
    folder_id: Optional[str] = None
    auto_scan: bool = True


class DriveUploadReportRequest(BaseModel):
    filename: str
    content_base64: str
    mime_type: str = "application/pdf"


class GeneratePdfRequest(BaseModel):
    title: str
    subtitle: str
    headers: list[str]
    rows: list[list[str]]
    footer_row: Optional[list] = None
    filename: str = "report.pdf"
    upload_to_drive: bool = False
    accent_color: Optional[str] = None  # hex color for header/footer, default purple


@app.get("/api/drive/folder-info")
async def get_drive_folder_info(folder_id: str):
    """Resolve a Drive folder ID to its name and full path."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        raise HTTPException(400, "Drive not configured")
    try:
        service = get_drive_service(creds)
        path = get_folder_path(service, folder_id)
        name = path.split('/')[-1].strip() if path else folder_id
        return {"folder_id": folder_id, "name": name, "path": path}
    except Exception as e:
        raise HTTPException(500, f"Could not resolve folder: {e}")


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
    # Also track base names (without extension) for HEIC/JPEG duplicate detection
    existing_bases = {r["filename"].rsplit(".", 1)[0].upper() for r in (existing.data or []) if r.get("filename")}
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

        # Skip HEIC/JPEG variants (e.g., IMG_1234.heic when IMG_1234.jpeg exists)
        base_name = df["name"].rsplit(".", 1)[0].upper()
        if base_name in existing_bases:
            skipped += 1
            results.append({"name": df["name"], "status": "skipped", "reason": "Variant already exists"})
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

            # Convert HEIC to JPEG
            import time
            ext = df["name"].rsplit(".", 1)[-1].lower() if "." in df["name"] else "jpg"
            filename = df["name"]
            if ext in ("heic", "heif"):
                try:
                    import pillow_heif
                    from PIL import Image
                    import io as _io
                    pillow_heif.register_heif_opener()
                    img = Image.open(_io.BytesIO(content))
                    buf = _io.BytesIO()
                    img.save(buf, format="JPEG", quality=95)
                    content = buf.getvalue()
                    file_hash = compute_file_hash(content)
                    # Change filename to .jpg
                    filename = df["name"].rsplit(".", 1)[0] + ".jpg"
                    ext = "jpg"
                except Exception as e:
                    errors += 1
                    results.append({"name": df["name"], "status": "error", "reason": f"HEIC conversion failed: {e}"})
                    continue

            # Upload to Supabase Storage
            timestamp = int(time.time() * 1000)
            year = time.strftime("%Y")
            safe_name = filename.replace(" ", "_")
            storage_path = f"{year}/{timestamp}_{safe_name}"

            mime_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "pdf": "application/pdf"}
            content_type = mime_map.get(ext, "image/jpeg")

            supabase.storage.from_("offering-images").upload(
                storage_path, content,
                file_options={"content-type": content_type}
            )

            # Create offering record (use converted filename if HEIC was converted)
            result = supabase.table("offerings").insert({
                "filename": filename,
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


DEFAULT_FILENAME_TEMPLATES = {
    'filename_template_report': '{church}_Report_{period}_{date}',
    'filename_template_cards': '{church}_Cards_{period}_{date}',
}


def _resolve_filename(template_key: str, period: str) -> str:
    """Resolve a filename template from app_settings, substituting context variables.
    Only {church}, {period}, {date}, {year}, {month} are substituted.
    Any other {text} has its braces stripped and the content kept literally,
    so users can write e.g. {CCI} as a literal prefix without it being treated
    as a variable."""
    import re
    import datetime
    template = _get_setting(template_key) or DEFAULT_FILENAME_TEMPLATES[template_key]
    church = re.sub(r'\s+', '_', (_get_setting('church_name') or 'OTS').strip())
    church = re.sub(r'[^\w\-]', '', church)
    today = datetime.date.today()
    period_slug = re.sub(r'[^\w]', '_', period.strip())
    period_slug = re.sub(r'_+', '_', period_slug).strip('_')

    context = {
        'church': church,
        'period': period_slug,
        'date': today.strftime('%Y-%m-%d'),
        'year': str(today.year),
        'month': today.strftime('%B'),
    }

    # Safe substitution: replace known vars, strip braces from unknown ones
    name = re.sub(r'\{([^}]*)\}', lambda m: context.get(m.group(1), m.group(1)), template)

    # Strip chars not valid in filenames
    name = re.sub(r'[<>:"/\\|?*]', '_', name).strip('_')
    if not name.lower().endswith('.pdf'):
        name += '.pdf'
    return name


def _generate_pdf(title: str, subtitle: str, headers: list[str],
                   rows: list[list[str]], footer_row: Optional[list] = None,
                   accent_color: Optional[str] = None) -> bytes:
    """Generate a card-style PDF report. Title band is the first table row for perfect alignment."""
    import io
    import datetime
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter, landscape
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from xml.sax.saxutils import escape

    accent = colors.HexColor(accent_color or '#4f46e5')
    num_cols = len(headers)
    page = landscape(letter) if num_cols > 5 else letter

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=page, topMargin=0.5*inch, bottomMargin=0.5*inch,
                            leftMargin=0.5*inch, rightMargin=0.5*inch)
    avail_width = page[0] - 1.0 * inch
    styles = getSampleStyleSheet()
    elements = []

    # ── Styles ──
    title_style = ParagraphStyle('TitleCell', fontName='Helvetica-Bold', fontSize=14,
                                  textColor=colors.white, leading=18)
    sub_style = ParagraphStyle('SubCell', fontName='Helvetica', fontSize=9,
                                textColor=colors.Color(1, 1, 1, 0.8), leading=12)
    cell_style = ParagraphStyle('Cell', parent=styles['Normal'], fontSize=8.5, leading=11)
    cell_right = ParagraphStyle('CellRight', parent=cell_style, alignment=2)
    cell_bold = ParagraphStyle('CellBold', parent=cell_style, fontName='Helvetica-Bold')
    col_header = ParagraphStyle('ColHeader', fontName='Helvetica-Bold', fontSize=7.5,
                                 textColor=colors.HexColor('#475569'), leading=10)
    col_header_right = ParagraphStyle('ColHeaderR', parent=col_header, alignment=2)
    footer_cell = ParagraphStyle('FooterCell', parent=cell_bold, textColor=colors.white)
    footer_right = ParagraphStyle('FooterRight', parent=footer_cell, alignment=2)

    # Detect amount columns
    amount_cols = set()
    for i, h in enumerate(headers):
        hl = h.lower()
        if any(k in hl for k in ['amount', 'total', 'general', 'cash', 'sunday', 'building', 'misc']):
            amount_cols.add(i)
    if num_cols > 2:
        amount_cols.add(num_cols - 1)

    def make_row(cells, is_header=False, is_footer=False):
        result = []
        for i, cell in enumerate(cells):
            text = escape(str(cell)) if cell else ''
            if is_header:
                style = col_header_right if i in amount_cols else col_header
            elif is_footer:
                style = footer_right if i in amount_cols else footer_cell
            else:
                style = cell_right if i in amount_cols else cell_style
            result.append(Paragraph(text, style))
        return result

    # Row 0: Title band (spans all columns)
    title_content = Paragraph(escape(title), title_style)
    sub_content = Paragraph(escape(subtitle), sub_style) if subtitle else Paragraph('', sub_style)
    title_row = [title_content] + [''] * (num_cols - 1)
    sub_row = [sub_content] + [''] * (num_cols - 1)

    table_data = [title_row, sub_row, make_row(headers, is_header=True)]
    for row in rows:
        table_data.append(make_row(row))
    if footer_row:
        table_data.append(make_row(footer_row, is_footer=True))

    # Column widths — 13.5% gives enough room for amounts like "$15,970.00" in bold
    amt_width = avail_width * 0.135
    col_widths = []
    for i in range(num_cols):
        col_widths.append(amt_width if i in amount_cols else None)
    fixed = sum(w for w in col_widths if w is not None)
    auto_count = sum(1 for w in col_widths if w is None)
    if auto_count > 0:
        auto_width = (avail_width - fixed) / auto_count
        col_widths = [w if w is not None else auto_width for w in col_widths]

    t = Table(table_data, colWidths=col_widths)
    style_cmds = [
        # Title band (rows 0-1): accent background, span all columns
        ('SPAN', (0, 0), (-1, 0)),
        ('SPAN', (0, 1), (-1, 1)),
        ('BACKGROUND', (0, 0), (-1, 1), accent),
        ('TOPPADDING', (0, 0), (-1, 0), 14),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 0),
        ('TOPPADDING', (0, 1), (-1, 1), 0),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 12),
        ('LEFTPADDING', (0, 0), (-1, 1), 16),

        # Column headers (row 2)
        ('BACKGROUND', (0, 2), (-1, 2), colors.HexColor('#f1f5f9')),
        ('TOPPADDING', (0, 2), (-1, 2), 10),
        ('BOTTOMPADDING', (0, 2), (-1, 2), 10),

        # All cells padding
        ('LEFTPADDING', (0, 2), (-1, -1), 12),
        ('RIGHTPADDING', (0, 2), (-1, -1), 12),
        ('TOPPADDING', (0, 3), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 3), (-1, -1), 7),

        # Row dividers (below each data row, not below last)
        ('LINEBELOW', (0, 2), (-1, -2), 0.5, colors.HexColor('#e2e8f0')),

        # Outer border
        ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#e2e8f0')),

        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]

    # Zebra striping (data rows start at index 3)
    for i in range(3, len(table_data)):
        if (i - 3) % 2 == 1:
            style_cmds.append(('BACKGROUND', (0, i), (-1, i), colors.HexColor('#f8fafc')))

    # Footer row
    if footer_row:
        last_idx = len(table_data) - 1
        style_cmds.extend([
            ('BACKGROUND', (0, last_idx), (-1, last_idx), accent),
            ('TEXTCOLOR', (0, last_idx), (-1, last_idx), colors.white),
        ])

    t.setStyle(TableStyle(style_cmds))
    elements.append(t)

    elements.append(Spacer(1, 20))
    gen_style = ParagraphStyle('GenFooter', fontSize=8, textColor=colors.HexColor('#94a3b8'))
    elements.append(Paragraph(f'Generated by OTS on {datetime.date.today().strftime("%m/%d/%Y")}', gen_style))

    doc.build(elements)
    return buf.getvalue()


@app.post("/api/pdf/generate")
async def generate_pdf(req: GeneratePdfRequest):
    """Generate a PDF from structured data. Optionally upload to Drive.
    Returns the PDF as base64 for frontend download."""
    try:
        pdf_bytes = _generate_pdf(req.title, req.subtitle, req.headers, req.rows, req.footer_row, req.accent_color)

        # Resolve filename from admin template (subtitle is the period label)
        filename = _resolve_filename('filename_template_report', req.subtitle)

        result: dict = {"success": True, "size": len(pdf_bytes)}

        # Upload to Drive if requested
        if req.upload_to_drive:
            creds = _get_setting("google_drive_credentials")
            folder_id = _get_setting("drive_reports_folder_id")
            if creds and folder_id:
                service = get_drive_service(creds)
                drive_result = upload_to_drive(service, folder_id, filename, pdf_bytes, 'application/pdf')
                result["drive"] = {"file_id": drive_result.get("id"), "name": drive_result.get("name"),
                                   "link": drive_result.get("webViewLink")}
            else:
                result["drive_error"] = "Drive not configured"

        # Return PDF as base64 for download
        result["pdf_base64"] = base64.b64encode(pdf_bytes).decode()
        result["filename"] = filename
        return result
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")


class CardsPdfRequest(BaseModel):
    title: str
    period: str
    cards: list  # [{date: str, rows: [[label, amount]], total: str}]
    accent_color: Optional[str] = None
    upload_to_drive: bool = False


def _generate_cards_pdf(title: str, period: str, cards: list, accent_color: Optional[str] = None) -> bytes:
    """Generate a card-style PDF with 2 offering cards per row."""
    import io
    import datetime
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import ParagraphStyle
    from xml.sax.saxutils import escape

    accent = colors.HexColor(accent_color or '#4f46e5')
    margin = 0.5 * inch
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter,
                            topMargin=margin, bottomMargin=margin,
                            leftMargin=margin, rightMargin=margin)
    avail_w = letter[0] - 2 * margin

    pg_title  = ParagraphStyle('PT', fontName='Helvetica-Bold', fontSize=14, textColor=accent, leading=18)
    pg_sub    = ParagraphStyle('PS', fontName='Helvetica', fontSize=9, textColor=colors.HexColor('#64748b'), leading=12)
    hdr_name  = ParagraphStyle('HN', fontName='Helvetica-Bold', fontSize=10, textColor=colors.white, leading=13)
    hdr_date  = ParagraphStyle('HD', fontName='Helvetica', fontSize=8, textColor=colors.Color(1, 1, 1, 0.85), leading=10)
    cat_lbl   = ParagraphStyle('CL', fontName='Helvetica', fontSize=8.5, textColor=colors.HexColor('#6b7280'), leading=11)
    cat_amt   = ParagraphStyle('CA', fontName='Helvetica-Bold', fontSize=8.5, alignment=2, textColor=colors.HexColor('#111827'), leading=11)
    tot_lbl   = ParagraphStyle('TL', fontName='Helvetica-Bold', fontSize=9.5, textColor=accent, leading=12)
    tot_amt   = ParagraphStyle('TA', fontName='Helvetica-Bold', fontSize=9.5, alignment=2, textColor=accent, leading=12)
    gen_style = ParagraphStyle('GF', fontSize=7.5, textColor=colors.HexColor('#94a3b8'))

    gap = 10  # pts between card columns
    card_w = (avail_w - gap) / 2
    lbl_w = card_w * 0.60
    amt_w = card_w * 0.40

    def make_card(card: dict) -> Table:
        date_str = str(card.get('date', ''))
        cat_rows = card.get('rows', [])
        total_str = str(card.get('total', ''))

        data: list = [
            [[Paragraph(escape(title), hdr_name), Paragraph('Week of ' + escape(date_str), hdr_date)], ''],
        ]
        for row in cat_rows:
            data.append([Paragraph(escape(str(row[0])), cat_lbl), Paragraph(escape(str(row[1])), cat_amt)])
        data.append([Paragraph('Total', tot_lbl), Paragraph(escape(total_str), tot_amt)])

        n = len(data)
        cmds = [
            ('SPAN', (0, 0), (-1, 0)),
            ('BACKGROUND', (0, 0), (-1, 0), accent),
            ('TOPPADDING', (0, 0), (-1, 0), 10), ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('LEFTPADDING', (0, 0), (-1, 0), 12), ('RIGHTPADDING', (0, 0), (-1, 0), 12),
            ('LEFTPADDING', (0, n - 1), (-1, n - 1), 12), ('RIGHTPADDING', (0, n - 1), (-1, n - 1), 12),
            ('TOPPADDING', (0, n - 1), (-1, n - 1), 8), ('BOTTOMPADDING', (0, n - 1), (-1, n - 1), 8),
            ('LINEABOVE', (0, n - 1), (-1, n - 1), 1.5, accent),
            ('BOX', (0, 0), (-1, -1), 0.75, colors.HexColor('#e2e8f0')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]
        if n > 2:
            cmds += [
                ('LEFTPADDING', (0, 1), (-1, n - 2), 12), ('RIGHTPADDING', (0, 1), (-1, n - 2), 12),
                ('TOPPADDING', (0, 1), (-1, n - 2), 5), ('BOTTOMPADDING', (0, 1), (-1, n - 2), 5),
            ]
            for r in range(1, n - 2):
                cmds.append(('LINEBELOW', (0, r), (-1, r), 0.5, colors.HexColor('#e5e7eb')))
        t = Table(data, colWidths=[lbl_w, amt_w])
        t.setStyle(TableStyle(cmds))
        return t

    elements: list = [
        Paragraph(escape(title), pg_title),
        Paragraph(escape(period) + ' — Offering Cards', pg_sub),
        Spacer(1, 14),
    ]
    i = 0
    while i < len(cards):
        c1 = make_card(cards[i])
        c2 = make_card(cards[i + 1]) if i + 1 < len(cards) else ''
        row_t = Table([[c1, c2]], colWidths=[card_w, card_w])
        row_t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (0, -1), gap), ('RIGHTPADDING', (1, 0), (1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), gap),
        ]))
        elements.append(KeepTogether(row_t))
        i += 2

    elements.append(Spacer(1, 8))
    elements.append(Paragraph(f'Generated by OTS on {datetime.date.today().strftime("%m/%d/%Y")}', gen_style))
    doc.build(elements)
    return buf.getvalue()


@app.post("/api/pdf/generate-cards")
async def generate_cards_pdf(req: CardsPdfRequest):
    """Generate a PDF with offering cards (2 per row, portrait letter)."""
    try:
        pdf_bytes = _generate_cards_pdf(req.title, req.period, req.cards, req.accent_color)
        filename = _resolve_filename('filename_template_cards', req.period)
        result: dict = {
            "success": True,
            "pdf_base64": base64.b64encode(pdf_bytes).decode(),
            "filename": filename,
            "size": len(pdf_bytes),
        }
        if req.upload_to_drive:
            creds = _get_setting("google_drive_credentials")
            folder_id = _get_setting("drive_reports_folder_id")
            if creds and folder_id:
                service = get_drive_service(creds)
                drive_result = upload_to_drive(service, folder_id, filename, pdf_bytes, 'application/pdf')
                result["drive"] = {
                    "file_id": drive_result.get("id"),
                    "name": drive_result.get("name"),
                    "link": drive_result.get("webViewLink"),
                }
            else:
                result["drive_error"] = "Drive not configured"
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cards PDF failed: {e}")


@app.post("/api/drive/upload-report")
async def upload_report_to_drive(req: DriveUploadReportRequest):
    """Upload a generated report as PDF to Google Drive reports folder (legacy HTML route)."""
    creds = _get_setting("google_drive_credentials")
    if not creds:
        raise HTTPException(400, "No service account credentials configured")

    folder_id = _get_setting("drive_reports_folder_id")
    if not folder_id:
        raise HTTPException(400, "No Drive reports folder configured")

    try:
        html_content = base64.b64decode(req.content_base64).decode('utf-8')

        # For legacy HTML route, try to parse basic structure
        import re
        title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_content)
        title = title_match.group(1) if title_match else 'Report'
        # Generate a simple PDF
        pdf_bytes = _generate_pdf(title, '', ['Report'], [['See attached HTML']], None)

        filename = req.filename
        if filename.endswith('.html'):
            filename = filename[:-5] + '.pdf'
        elif not filename.endswith('.pdf'):
            filename = filename + '.pdf'

        service = get_drive_service(creds)
        result = upload_to_drive(service, folder_id, filename, pdf_bytes, 'application/pdf')
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
    to: Optional[str] = None


class SendEmailRequest(BaseModel):
    to: list[str]
    subject: str
    html_body: str
    cc: list[str] = []
    attachment_base64: Optional[str] = None
    attachment_filename: Optional[str] = None
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
        if req.cc:
            msg["Cc"] = ", ".join(req.cc)

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
        all_recipients = req.to + req.cc
        server.sendmail(smtp_user, all_recipients, msg.as_string())
        server.quit()

        return {"success": True, "message": f"Email sent to {len(req.to)} recipients"}
    except Exception as e:
        raise HTTPException(500, f"Failed to send email: {e}")


# ── Entry point for PyInstaller binary ──────────────────────────────────────
if __name__ == "__main__":
    import sys
    import uvicorn

    host = "127.0.0.1"
    port = 8000
    args = sys.argv[1:]
    for i, arg in enumerate(args):
        if arg == "--host" and i + 1 < len(args):
            host = args[i + 1]
        elif arg == "--port" and i + 1 < len(args):
            port = int(args[i + 1])

    uvicorn.run(app, host=host, port=port)
