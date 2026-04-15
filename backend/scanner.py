"""
AI Scanner — extracts offering data from images using Claude.

Connects to Supabase for image storage and DB updates.
Uses AWS Bedrock (dev) or Anthropic API (prod) for scanning.
"""

import base64
import json
import re
from typing import Optional

import anthropic

# ── Scan Prompt ──────────────────────────────────────────────────────────────

_EXTRACTION_RULES = """\
General Rules:
- Offerings are almost always on Sundays — use this to resolve ambiguous dates.
- "5×10" or "5*10" means denomination × count = $50.  "$250 × 3" means $750.
- If a value is absent use null (not 0).  Trust pre-written totals when available.
- Dates may be mm/dd/yy, dd/mm/yy, or mm/dd — infer year from context.
- DO NOT combine cash and check amounts. Keep them separate in the output.

HANDWRITING RECOGNITION — Commonly confused digits:
- "8" vs "2" vs "3": Look at loops carefully. 8 has two loops, 2 has none.
- "1" vs "7": Check for crossbar on 7.
- "6" vs "0": 6 has a tail, 0 is closed.
- "5" vs "6": 5 has a flat top, 6 is rounded.
- When in doubt, consider which value makes more sense in context.

GRAND TOTAL CROSS-CHECK:
- If a "GRAND TOTAL" or "Total" line is visible at the bottom of the slip,
  read it and compare to the sum of all your computed section totals.
- If your sum differs from the written grand total, re-examine EVERY digit.
- Report the written grand total in notes: "Written grand total: $XXXX"

STEP 1 — Identify the slip format:

FORMAT A: "Handwritten / Informal Slip"
  - Handwritten notes on paper, index card, or plain sheet
  - Categories like "Checks", "Cash", "SS", "Bldg" written informally

FORMAT B: "Printed Denomination Form"
  - Printed form with structured denomination rows: "100 x ___ = ___"
  - Labeled sections: "General Cash", "Sunday School (Cash)",
    "General Offering (Checks)", "Building Fund (Checks)", "Others (Checks)"

FORMAT C: "Bank Check Image"
  - Photograph of an actual US bank check
  - Shows payee, amount, check number, bank name

STEP 2 — Extract using the correct rules:

FOR FORMAT A (Handwritten):
  - "Cash" or "Cash - General" → cash column
  - "Checks" or "General" → general column
  - "SS" or "Sunday School" → sunday_school column
  - "Bldg" or "Building" → building_fund column
  - Anything else → misc column

FOR FORMAT B (Printed):
  - "General Cash" section (denomination rows) → cash column
  - "Sunday School (Cash)" section → sunday_school column
  - "General Offering (Checks)" section → general column
  - "Building Fund (Checks)" section → building_fund column
  - "Others (Checks)" section → misc column

FOR FORMAT C (Bank Check):
  - If memo contains "building", "bldg" → building_fund column
  - Otherwise → general column
  - Include: "notes": "Check #<number> from <payer> - <memo>"
"""

SYSTEM_PROMPT = f"""\
You are a precise data extraction assistant for church offering slips.

IMPORTANT: Images may contain 1-4 offering slips. Extract ALL of them.

Return a JSON array with one object per slip (even if only 1):
[
  {{
    "slip_number": 1,
    "type": "offering_slip",
    "date": "MM/DD/YYYY",
    "date_confidence": "high|medium|low",
    "sections": {{
      "general_cash": {{
        "denominations": {{"100": <count>, "50": <count>, "20": <count>, "10": <count>, "5": <count>, "1": <count>}},
        "total": <number>
      }},
      "general_checks": {{
        "items": [{{"amount": <number>, "count": <number>}}, ...],
        "total": <number>
      }},
      "sunday_school_cash": {{
        "denominations": {{}},
        "total": <number>
      }},
      "building_fund_checks": {{
        "items": [{{"amount": <number>, "count": <number>}}, ...],
        "total": <number>
      }},
      "other_checks": {{
        "items": [{{"amount": <number>, "count": <number>}}, ...],
        "total": <number>
      }}
    }},
    "categories": {{
      "general":       <general_checks.total>,
      "cash":          <general_cash.total>,
      "sunday_school": <sunday_school_cash.total>,
      "building_fund": <building_fund_checks.total>,
      "misc":          <other_checks.total>
    }},
    "notes": "<ambiguities or assumptions>"
  }}
]

{_EXTRACTION_RULES}

SECTION EXTRACTION RULES:
- Only include sections that have data (omit empty sections)
- For denominations: count for each bill type, total = sum(denomination × count)
- For checks: each entry as amount × count, total = sum(amount × count)
- "general" = general_checks.total (checks only)
- "cash" = general_cash.total (cash denominations only)
- Total = general + cash + sunday_school + building_fund + misc

ACCURACY VERIFICATION (CRITICAL):
1. Read EVERY row/entry from the image carefully
2. For denominations: verify count × denomination = row total
3. Sum all rows to get section total
4. Double-check: re-read each line from the image
5. Use COMPUTED sum if it differs from pre-written total

NOT AN OFFERING:
If the image is NOT an offering slip, return:
[ {{"type": "not_offering", "notes": "Brief description"}} ]

CRITICAL: Return ONLY the JSON array. No explanatory text. Start with [ end with ].
"""


# ── JSON Parsing ─────────────────────────────────────────────────────────────

def parse_json_response(text: str) -> list[dict]:
    """Robustly parse JSON from Claude's response."""
    text = text.strip()

    # Strategy 1: Direct parse
    try:
        result = json.loads(text)
        return result if isinstance(result, list) else [result]
    except json.JSONDecodeError:
        pass

    # Strategy 2: raw_decode (ignores trailing text)
    try:
        decoder = json.JSONDecoder()
        for i, ch in enumerate(text):
            if ch in '[{':
                result, _ = decoder.raw_decode(text, i)
                return result if isinstance(result, list) else [result]
    except (json.JSONDecodeError, ValueError):
        pass

    # Strategy 3: Bracket-counting for outermost [...]
    start = text.find('[')
    if start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '[':
                depth += 1
            elif text[i] == ']':
                depth -= 1
                if depth == 0:
                    try:
                        result = json.loads(text[start:i + 1])
                        return result if isinstance(result, list) else [result]
                    except json.JSONDecodeError:
                        break

    raise ValueError(f"Failed to parse JSON from response: {text[:300]}...")


# ── Total Verification ───────────────────────────────────────────────────────

SECTION_CAT_MAP = {
    "general_checks": "general",
    "general_cash": "cash",
    "sunday_school_cash": "sunday_school",
    "building_fund_checks": "building_fund",
    "other_checks": "misc",
}


def verify_and_compute_totals(item: dict) -> dict:
    """Recompute category totals from sections using Python math (source of truth)."""
    sections = item.get("sections", {})
    categories = item.get("categories", {})

    if not sections:
        return item

    scan_data: dict = {"sections": {}, "categories": {}, "total": 0}

    for section_key, cat_key in SECTION_CAT_MAP.items():
        sec = sections.get(section_key)
        if not sec:
            continue

        sd: dict = {}
        computed_total = 0

        if "denominations" in sec:
            denoms = sec["denominations"]
            expr_parts = []
            for denom, count in sorted(denoms.items(), key=lambda x: -int(x[0]) if str(x[0]).isdigit() else 0):
                if count and int(count) > 0:
                    expr_parts.append(f"{denom}*{count}")
                    computed_total += int(denom) * int(count)
            sd["denominations"] = denoms
            sd["expr"] = " + ".join(expr_parts)
            sd["total"] = computed_total if computed_total > 0 else (sec.get("total") or 0)

        if "items" in sec:
            items_list = sec["items"]
            expr_parts = []
            for entry in items_list:
                if isinstance(entry, dict):
                    amt = entry.get("amount", 0) or 0
                    cnt = entry.get("count", 1) or 1
                else:
                    amt, cnt = entry, 1
                if amt and cnt:
                    expr_parts.append(f"{amt}*{cnt}")
                    computed_total += amt * cnt
            sd["items"] = items_list
            sd["expr"] = " + ".join(expr_parts)
            sd["total"] = computed_total if computed_total > 0 else (sec.get("total") or 0)

        if computed_total > 0:
            categories[cat_key] = computed_total
        scan_data["sections"][section_key] = sd

    # Build scan_data categories
    total = 0
    for cat_key in ["general", "cash", "sunday_school", "building_fund", "misc"]:
        val = categories.get(cat_key)
        if val and val > 0:
            scan_data["categories"][cat_key] = {"value": val}
            total += val

    scan_data["total"] = total

    # Preserve notes
    raw_notes = item.get("notes", "") or ""
    if raw_notes:
        scan_data["notes"] = raw_notes

    item["categories"] = categories
    item["scan_data"] = scan_data
    item["computed_total"] = total

    # Build clean summary notes
    cat_labels = {"general": "General", "cash": "Cash", "sunday_school": "Sunday School",
                  "building_fund": "Building Fund", "misc": "Misc"}
    parts = [f"{label}: ${categories.get(key, 0):.2f}" for key, label in cat_labels.items()
             if categories.get(key) and categories[key] > 0]
    if total > 0:
        parts.append(f"Total: ${total:.2f}")
    item["clean_notes"] = " | ".join(parts)

    return item


# ── Scan Function ────────────────────────────────────────────────────────────

def scan_image(image_bytes: bytes, media_type: str, filename: str,
               client: Optional[anthropic.Anthropic] = None,
               model: str = "claude-sonnet-4-6-20250929") -> list[dict]:
    """
    Scan an offering image using Claude API.

    Args:
        image_bytes: Raw image bytes
        media_type: MIME type (image/jpeg, image/png, etc.)
        filename: Original filename for reference
        client: Anthropic client (creates new if not provided)
        model: Model ID

    Returns:
        List of scan results, one per slip found
    """
    if client is None:
        client = anthropic.Anthropic()

    data = base64.standard_b64encode(image_bytes).decode()

    resp = client.messages.create(
        model=model,
        max_tokens=4096,
        timeout=120.0,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": data}},
                {"type": "text", "text": "Return the JSON array for ALL offerings/slips in this image:"},
            ],
        }],
    )

    # Extract usage info
    usage = {
        "input_tokens": getattr(resp.usage, 'input_tokens', 0),
        "output_tokens": getattr(resp.usage, 'output_tokens', 0),
    }

    text = resp.content[0].text.strip()
    if not text:
        raise ValueError(f"Claude returned empty response for {filename}")

    items = parse_json_response(text)

    # Filter not-offering images
    not_offerings = [i for i in items if i.get("type") == "not_offering"]
    items = [i for i in items if i.get("type") != "not_offering"]

    if not items and not_offerings:
        return [{"type": "not_offering", "filename": filename,
                 "notes": not_offerings[0].get("notes", "Not an offering slip")}]

    # Verify totals with Python math and build scan_data
    for i, item in enumerate(items):
        items[i] = verify_and_compute_totals(item)
        items[i]["filename"] = filename
        items[i]["slip_number"] = item.get("slip_number", i + 1)
        items[i]["usage"] = usage

    return items
