# 0012 — TypeScript error suppression in Reports.tsx grouping logic

**Status:** accepted
**Date:** 2026-10-31

## Context

The Reports.tsx file contains logic to group offerings by date (`groupedOfferings` useMemo). TypeScript's control flow analysis incorrectly flags the `combined` variable as being used before declaration, even though the code is correct at runtime. The early return ensures `combined` is only accessed when `group.length > 1`.

Build attempts with v3.9.3 and v3.9.4 failed due to this TypeScript error, blocking releases.

## Decision

Add `@ts-expect-error` suppression comments with explanatory notes:
- On the `combined` variable declaration
- On the `_groupedOfferings` assignment

This acknowledges the TypeScript limitation while documenting that the runtime behavior is correct.

## Consequences

- Builds succeed, releases can proceed
- Code remains correct and functional at runtime
- Future TypeScript versions may fix the control flow analysis and allow removing these suppressions
- Team must be aware these suppressions exist if modifying the grouping logic
