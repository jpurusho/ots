# 0011 — Card selection affects all exports

**Status:** accepted
**Date:** 2026-10-30

## Context

Reports page allows multi-select of offering cards (checkbox on each card/row). Original implementation only used selection for email, but PDF and CSV exports always included the full period regardless of selection.

User expectation: if specific cards are selected, all export actions (PDF, CSV, email, Drive upload) should respect that selection.

Edge cases:
- No cards selected → export all
- All cards selected → export all
- Partial selection → export only selected

## Decision

All export functions now use `exportOfferings` computed list:
- If `selectedOfferings.size > 0 && selectedOfferings.size < offerings.length` → use selected cards only
- Otherwise → use all offerings

Export label changes from period (e.g., "October 2026") to "Selected Cards (N)" when partial selection exists.

Affects:
- PDF report download and Drive upload
- Cards PDF generation
- Email report HTML
- CSV export
- Grand totals (recalculated from exportOfferings)
- Email template `{period}` variable resolution

## Consequences

- Consistent behavior across all export actions
- Users can generate subset reports for specific dates
- Period label clearly indicates when selection is active
- Selection state doesn't persist across page navigation (expected behavior)
- "Export all" vs "export selected" is inferred from selection state, no explicit toggle needed
