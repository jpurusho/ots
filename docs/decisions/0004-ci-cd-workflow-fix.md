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

Two mutually exclusive workflows with orchestration:

### deploy.yml — Web App Deployment
- **Triggers:** Manual workflow_dispatch ONLY
- **Purpose:** Deploys React web app to GitHub Pages from `main` branch
- **Use case:** Manual web-only deploys (development/hotfix)

### release.yml — Electron Release + Web Deploy
- **Triggers:** Push tags matching `v*`
- **Purpose:** 
  1. Builds macOS Electron .app with bundled Python backend
  2. Creates GitHub Release with .zip
  3. Triggers deploy.yml to deploy web from main
- **Use case:** Full releases

### Release Process
1. Bump `package.json` version
2. Commit changes: `git commit -m "Bump to vX.Y.Z"`
3. Tag commit: `git tag vX.Y.Z`
4. Push: `git push origin main --tags`
5. Result: **Only release.yml runs**, which:
   - Builds Electron app
   - Creates GitHub Release
   - Calls `gh workflow run deploy.yml` to deploy web from main

## Changes Made

1. **Removed redundant version sync:** Deleted `npm version "$TAG"` from release.yml
   - Package.json is correct at tag time (just committed)
   
2. **Made deploy.yml manual-only:** Removed `push: branches: [main]` trigger
   - Prevents duplicate runs
   - Still auto-triggered by release.yml via gh CLI
   
3. **Orchestrated web deploy:** release.yml runs `gh workflow run deploy.yml --ref main`
   - Works around GitHub Pages environment branch restriction
   - Web deploys from main context (allowed), not tag context (blocked)

4. **Updated documentation:** CLAUDE.md reflects new flow

## Consequences

**Positive:**
- No duplicate builds - only release.yml runs on tagged releases
- No version sync errors
- Clear separation: release.yml = releases, deploy.yml = manual web-only
- Web deployment works (orchestrated from main context)

**Neutral:**
- Web deploy happens ~30s after Electron build completes (sequential)

**Negative:**
- None identified

## Alternatives Considered

1. **Both workflows run on releases:**
   - Rejected: Wastes CI time, user explicitly wanted mutual exclusion

2. **deploy.yml with tag detection:** Git-based logic to skip when commit is tagged
   - Rejected: Fragile; GitHub sends separate events for branch push vs tag push

3. **Modify GitHub Pages environment to allow tag deployments:**
   - Rejected: Not recommended by GitHub; environment protection is branch-based by design

4. **Single unified workflow:**
   - Rejected: Can't deploy to GitHub Pages from tag context due to environment restrictions
