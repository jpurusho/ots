# 0008 — Summary Card for Yearly/Range Reports

**Status:** accepted  
**Date:** 2026-07-31

## Context

Users can view reports in three modes: monthly, yearly, and date range. For weekly offerings, individual cards show breakdown by category. For yearly and range reports spanning many weeks, users requested:
1. A summary card showing aggregated totals (not just individual weekly cards)
2. Ability to email/PDF/export this summary card like individual cards

The existing email functionality only supported tabular reports or individual weekly cards.

## Decision

Add a summary card feature for yearly and range reports:

### Email
- New `buildEmailSummaryCard()` function generates HTML card with aggregated totals
- "Email Summary" button appears for yearly/range views (alongside "Email Report")
- Uses same card styling as weekly cards but shows period totals instead of single week

### UI Display
- In Reports page Cards view, yearly/range views show a styled summary card at the top
- Card displays:
  - Church name in colored header
  - Period label (e.g., "2024" or "Jan 1 - Dec 31") 
  - Subtitle: "Yearly Summary" or "Date Range Summary"
  - Offering count
  - Category breakdown with aggregated amounts
  - Total with accent color
- PDF, Drive, and Email action buttons on the card
- Uses `accentColors.card` from Settings → Themes

### Monthly View
- Keeps existing simple text summary (no styled card)
- Avoids visual confusion with individual weekly cards below it

## Implementation

```tsx
// Email HTML generation
function buildEmailSummaryCard(
  churchName: string,
  periodLabel: string,
  offerings: ApprovedOffering[],
  catList: Category[],
  accent: string
): string {
  // Aggregate totals across all offerings
  // Build card HTML matching weekly card style
}

// UI display with actions
{(viewMode === 'yearly' || viewMode === 'range') && (
  <div className="summary-card">
    {/* Styled card with totals */}
    <div className="actions">
      <button onClick={exportSummaryCardAsPdf}>PDF</button>
      <button onClick={uploadSummaryCardToDrive}>Drive</button>
      <button onClick={emailSummaryCard}>Email</button>
    </div>
  </div>
)}
```

## Consequences

**Positive:**
- Provides at-a-glance yearly/range summary in card format
- Consistent export/share experience across all card types
- Users can email a clean summary card instead of a large table for yearly reports
- Reuses existing PDF/Drive/Email infrastructure (same backend endpoint)

**Negative:**
- Adds slight complexity to Reports page (conditional rendering based on view mode)
- Summary card state management (Drive upload status, email target)

**User Experience:**
- Summary card matches the visual style of weekly cards
- "Yearly Summary" / "Date Range Summary" subtitle clarifies what the totals represent
- Offering count provides context (e.g., "52 offerings" for a full year)

## Backend Support

The summary card uses the existing `/api/pdf/generate-cards` endpoint by passing aggregated totals as a single card:
```json
{
  "cards": [{
    "title": "Church Name",
    "date": "2024",
    "rows": [["General", "$10000.00"], ...],
    "total": "$50000.00"
  }]
}
```

No backend changes required — the endpoint already supports arbitrary card data.
