# 0003 — Auto-fill current date when slip has no date

**Status:** accepted  
**Date:** 2026-06-15

## Context

Some offering slips (especially special events or handwritten notes) do not include a date. Previously, these slips would be scanned with `date: null`, requiring manual date entry during review. For slips processed on the day they're received, the current date is almost always correct.

## Decision

When the scanner detects no date on a slip (or returns `date_confidence: "none"`), the backend auto-fills `offering_date` with the current date (`YYYY-MM-DD`) and sets `date_confidence: "auto-filled"`.

This happens in `scanner.py` after Claude returns the scan results:
```python
if not item.get("date") or item.get("date_confidence") == "none":
    items[i]["date"] = datetime.now().strftime("%Y-%m-%d")
    items[i]["date_confidence"] = "auto-filled"
```

The date field remains editable in the Review page, so operators can correct it if needed.

## Consequences

- Slips without dates get a sensible default immediately
- The `auto-filled` confidence marker shows the date was inferred, not extracted
- Reduces manual data entry for same-day processing
- If a slip is uploaded days after the event, the auto-filled date will be wrong — operators must review and correct
- Scanner prompt explicitly instructs Claude to return `date: null` when no date is visible, so the auto-fill logic triggers correctly
