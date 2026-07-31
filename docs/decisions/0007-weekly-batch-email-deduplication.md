# 0007 — Weekly Batch Email Deduplication via Activity Log

**Status:** accepted  
**Date:** 2026-07-31

## Context

When using weekly_batch email mode, duplicate emails were being sent in multiple scenarios:
1. Manually approving offerings from an already-complete week
2. Running the pipeline after a week was already emailed
3. Re-approving offerings (e.g., after unlock/edit)

Initial attempts to prevent duplicates using timestamp comparison logic were complex and fragile. We needed a simple, reliable way to track which weeks had already been emailed.

## Decision

Use the `activity_log` table to track which weeks have received batch emails:
- Before sending a weekly batch email, check for an existing `activity_log` entry with:
  - `action = 'weekly_batch_email'`
  - `details = 'Week of {sunday_date}'`
- If found, skip sending (preventing duplicates)
- After successfully sending, log the action so future attempts are blocked

This applies to both:
- `/api/automation/auto-email` endpoint (manual approval triggers)
- `/api/automation/run-pipeline` endpoint (automated approval + email)

## Implementation

```python
# Before sending, check activity log
activity_check = supabase.table("activity_log").select("id")\
    .eq("action", "weekly_batch_email")\
    .eq("details", f"Week of {week_start}")\
    .execute()
if activity_check.data:
    return {"success": False, "skipped": True, "reason": "Already sent"}

# After sending, log the action
supabase.table("activity_log").insert({
    "user_email": "automation",
    "action": "weekly_batch_email",
    "details": f"Week of {week_start}",
    "target_type": "offering",
    "target_id": None,
}).execute()
```

## Consequences

**Positive:**
- Simple, reliable duplicate prevention
- Works for all duplicate scenarios (re-approval, pipeline re-run, concurrent approvals)
- Leverages existing activity_log table (no schema changes)
- Provides audit trail of when batch emails were sent

**Negative:**
- If the activity log entry is manually deleted, the email could be sent again (acceptable risk)
- Week detection relies on consistent date calculation (Sunday as week start)

**Edge cases handled:**
- Offerings with invalid dates skip the check (fallback to raw date string)
- Logging failures don't break the email send (wrapped in try/except)

## Alternatives Considered

1. **Timestamp comparison** — Compare `locked_at` timestamps to determine if this approval completed the week. Too complex, race conditions with concurrent approvals.

2. **Add `emailed_at` field to offerings** — Would require schema migration and logic to mark all offerings in a week as emailed. More invasive than using activity log.

3. **Track in app_settings** — JSON array of emailed weeks. Would require manual cleanup over time, less structured than activity log.
