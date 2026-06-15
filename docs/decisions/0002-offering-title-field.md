# 0002 — Add title field for custom offering descriptions

**Status:** accepted  
**Date:** 2026-06-15

## Context

Offerings are not always "weekly offerings" — special events like "Operation Kid to Kid (NDS)", "Youth Group Fundraiser", or "Building Fund Drive" have custom descriptions written at the top of slips. Hardcoding "CCI SanRamon Weekly Offering" as a display title loses this context and makes reports less descriptive.

The scanner already sees this text when processing images, but it was being discarded.

## Decision

Add a `title` TEXT column to the `offerings` table. The scanner extracts the description from the top of the slip and stores it in this field. The UI displays the title in Review and Manual Entry, defaulting to "CCI SanRamon Weekly Offering" when empty for backwards compatibility.

The title is:
- Extracted by the scanner via updated prompt instructions
- Stored in the database (nullable)
- Editable in the Review page
- Optional in Manual Entry
- Used in reports to identify the offering type

## Consequences

- Offering reports now show the actual event name instead of a generic title
- Historical data without titles still works (falls back to default)
- Operators can see at a glance what type of offering it is
- Scanner prompt is slightly longer but captures more semantic information
- Migration required: `ALTER TABLE offerings ADD COLUMN title TEXT`

## Implementation Notes

### Bug Fix (v3.8.5)
The initial implementation allowed editing the title in the Review page UI, but the `saveMutation` did not include the `title` field in the database update. This caused edited titles (e.g., correcting OCR errors like "NDS" → "VBS") to not persist to the database, resulting in the wrong title appearing in PDF and email cards.

**Fix:** Added `title: values.title` to the Supabase update in `saveMutation`, and initialized `title` in the `startEdit` function.

**Why this matters:** The backend's `_build_card_html` function uses `offering.get("title")` to render email/PDF cards. If edits don't persist, operators see the wrong title in emails sent to the congregation.
