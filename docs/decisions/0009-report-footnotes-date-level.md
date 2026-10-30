# 0009 — Date-level footnotes for offering reports

**Status:** accepted
**Date:** 2026-10-30

## Context

Offering slips may have line-item descriptions (e.g., "Harvest Festival" written on a check entry). These descriptions need to appear in PDF and email reports, not just on individual cards.

Reports are aggregated tables showing totals by date and category, not detailed line-item breakdowns. Three options were considered:
- **Option A:** Date-level citations (e.g., "10/20/2024¹,²") with footnotes at bottom
- **Option B:** Cell-level citations on each category cell
- **Option C:** Separate "Notes" column in the table

## Decision

Implement Option A: date-level citations with superscripts on the date column, footnotes listed at the bottom of the report.

Example:
```
Date          | General | Cash    | Total
10/20/2024¹   | $500.00 | $200.00 | $700.00

Footnotes:
¹ Harvest Festival ($500.00)
```

Rationale:
- Keeps table width manageable (no extra column)
- All descriptions for a date are grouped together logically
- Consistent with academic citation style user is familiar with
- Footnote numbering is sequential across all dates in the report

## Consequences

- Backend `_generate_pdf()` now processes `^1,2,3` notation and renders superscripts
- Frontend extracts descriptions from scan_data and builds footnote arrays
- Email HTML includes footnotes section with light background styling
- Footnotes only appear when descriptions exist in scan_data
- Works seamlessly with card selection filtering
