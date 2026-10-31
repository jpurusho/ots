# 0014 — Node.js 22+ requirement for builds

**Status:** accepted
**Date:** 2026-10-31

## Context

Electron 44 and recent Supabase packages (@supabase/supabase-js 2.117+) require Node.js >=22. The deploy workflow was using Node.js 20, causing dependency installation failures with "Unsupported engine" warnings.

## Decision

Update all CI/CD workflows (deploy.yml, release.yml) to use Node.js 22.

The release workflow (.github/workflows/release.yml) already used Node.js 22. The deploy workflow was updated from Node.js 20 to 22.

## Consequences

- CI/CD builds succeed with current dependencies
- Development machines should use Node.js 22+ for consistency
- Older Node.js versions (20.x and below) are no longer supported for OTS development
- Future Electron and dependency upgrades will continue to require recent Node.js versions
