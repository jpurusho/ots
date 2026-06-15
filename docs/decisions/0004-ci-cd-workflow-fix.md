# ADR 0004: CI/CD Workflow Orchestration

**Date:** 2026-06-15  
**Status:** Implemented

## Context

The CI/CD workflows had multiple issues:

1. **Version regression:** Tagged v3.5.12 instead of v3.8.1 (regressed from v3.8.0)
2. **Build failures:** `npm version "$TAG"` step failed when package.json already had the correct version
3. **Duplicate builds:** Both `deploy.yml` and `release.yml` fired on tagged commits
4. **Environment restrictions:** GitHub Pages environment only allows deployment from `main` branch, not tags

## Decision

Two mutually exclusive workflows:

### deploy.yml — Web App Deployment
- **Triggers:** Manual workflow_dispatch ONLY
- **Command:** `gh workflow run deploy.yml`
- **Purpose:** Deploys React web app to GitHub Pages from `main` branch
- **Use case:** After releases, or for standalone web-only deploys

### release.yml — Electron Release
- **Triggers:** Push tags matching `v*`
- **Purpose:** 
  1. Builds macOS Electron .app with bundled Python backend
  2. Creates GitHub Release with .zip
  3. Reminds in release notes to manually deploy web
- **Use case:** Version releases

### Release Process
1. Bump `package.json` version
2. Commit: `git commit -m "Bump to vX.Y.Z"`
3. Tag: `git tag vX.Y.Z`
4. Push: `git push origin main --tags`
5. Wait for release.yml to build Electron
6. Manually deploy web: `gh workflow run deploy.yml`

## Changes Made

1. **Removed redundant version sync:** Deleted `npm version "$TAG"` from release.yml
   - Package.json is correct at tag time (just committed)
   
2. **Made deploy.yml manual-only:** Removed `push: branches: [main]` trigger
   - Prevents duplicate runs on releases
   - Simple, explicit control
   
3. **Updated release notes:** Added reminder to manually deploy web
   - GitHub's GITHUB_TOKEN can't trigger workflows (security restriction)
   - Manual trigger required: `gh workflow run deploy.yml`

4. **Updated documentation:** CLAUDE.md reflects new flow

## Consequences

**Positive:**
- No duplicate builds - only release.yml runs on tagged releases
- No version sync errors
- Clear separation: release.yml = releases, deploy.yml = manual web
- Simple, explicit control (no token permission issues)

**Neutral:**
- Manual step required after releases (`gh workflow run deploy.yml`)

**Negative:**
- None identified (manual step is acceptable tradeoff for correctness)

## Alternatives Considered

1. **Auto-trigger deploy.yml from release.yml:**
   - Rejected: GITHUB_TOKEN can't trigger workflows (security restriction)
   - Would need PAT with broader permissions

2. **Both workflows run on releases:**
   - Rejected: Wastes CI time, user explicitly wanted mutual exclusion

3. **deploy.yml with tag detection:** Git-based logic to skip when commit is tagged
   - Rejected: Fragile; GitHub sends separate events for branch push vs tag push

4. **Modify GitHub Pages environment to allow tag deployments:**
   - Rejected: Not recommended by GitHub; environment protection is branch-based by design

5. **Single unified workflow:**
   - Rejected: Can't deploy to GitHub Pages from tag context due to environment restrictions

## Implementation Notes

The v3.8.3 release successfully validated this approach:
- ✅ Only release.yml triggered on tag push
- ✅ Electron build completed successfully
- ✅ GitHub Release created with .zip artifact
- ✅ Manual web deploy triggered via `gh workflow run deploy.yml`
