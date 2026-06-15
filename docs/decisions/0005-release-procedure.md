# Release Procedure

**Version:** 3.8.3+  
**Last updated:** 2026-06-15

## Quick Reference

```bash
# 1. Bump version
vi package.json  # Update "version": "X.Y.Z"

# 2. Commit and tag
git add package.json
git commit -m "Bump to vX.Y.Z"
git tag vX.Y.Z

# 3. Push (triggers Electron build)
git push origin main --tags

# 4. Wait for release.yml to complete (~3-4 min)
gh run watch

# 5. Deploy web manually
gh workflow run deploy.yml
```

## Detailed Steps

### 1. Prepare Release

Update `package.json`:
```json
{
  "version": "3.8.3"
}
```

Commit with semantic message:
```bash
git add package.json
git commit -m "Bump to v3.8.3"
```

### 2. Tag Release

Create annotated tag:
```bash
git tag v3.8.3
```

Or with message:
```bash
git tag -a v3.8.3 -m "Release v3.8.3: Title bar improvements"
```

### 3. Push to GitHub

Push both main and tags:
```bash
git push origin main --tags
```

This triggers:
- ✅ `.github/workflows/release.yml` — builds Electron app
- ❌ `.github/workflows/deploy.yml` — does NOT auto-trigger

### 4. Monitor Build

Watch the release build:
```bash
gh run watch
```

Or check status:
```bash
gh run list --limit 3
```

Expected duration: **3-4 minutes**

On success:
- ✅ Electron .app built
- ✅ GitHub Release created at `https://github.com/jpurusho/ots/releases/tag/vX.Y.Z`
- ✅ `.zip` artifact attached to release

### 5. Deploy Web App

After release.yml completes, manually deploy web:
```bash
gh workflow run deploy.yml
```

Expected duration: **~1 minute**

Verify:
```bash
gh run list --limit 2
```

Web app deploys to: https://jpurusho.github.io/ots/

## Verification

### Check Release
```bash
gh release view v3.8.3
```

Should show:
- Release title and tag
- Asset: `OTS-3.8.3-arm64-mac.zip`
- Published date

### Check Web Deployment
Visit: https://jpurusho.github.io/ots/

Check version in About page (should match released version).

### Check Electron App
Download from GitHub Release:
```bash
gh release download v3.8.3
unzip OTS-3.8.3-arm64-mac.zip
open OTS.app
```

Verify version in About page.

## Troubleshooting

### Release Build Fails

Check logs:
```bash
gh run view --log-failed
```

Common issues:
- **Python backend build fails:** Check `scripts/build-backend.sh`
- **Electron builder fails:** Check `electron-builder.yml` config
- **Version mismatch:** Ensure package.json was committed before tagging

### Web Deploy Fails

Check if deploy.yml has permissions:
```bash
gh workflow view deploy.yml
```

Ensure GitHub Pages is enabled in repo settings.

### Wrong Version Tagged

Delete tag locally and remotely:
```bash
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z
```

Delete release:
```bash
gh release delete vX.Y.Z
```

Then retry with correct version.

## CI/CD Architecture

### Workflows

**release.yml** — Electron Release
- Trigger: Push tags `v*`
- Runs on: macOS runner
- Duration: ~3-4 min
- Output: GitHub Release with .zip

**deploy.yml** — Web Deployment
- Trigger: Manual (`gh workflow run deploy.yml`)
- Runs on: Ubuntu runner
- Duration: ~1 min
- Output: GitHub Pages deployment

### Why Manual Web Deploy?

GitHub's `GITHUB_TOKEN` cannot trigger other workflows (security restriction). Options considered:

1. ✅ **Manual trigger** (current) — simple, explicit, no permission issues
2. ❌ **Auto both workflows** — duplicate builds, user rejected
3. ❌ **Personal Access Token** — broader permissions, security concern

See `docs/decisions/0004-ci-cd-workflow-fix.md` for full decision context.

## Version Numbering

Follow semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backwards compatible)
- **PATCH:** Bug fixes

Examples:
- `v3.8.3` → `v3.8.4` (patch: bug fix)
- `v3.8.4` → `v3.9.0` (minor: new feature)
- `v3.9.0` → `v4.0.0` (major: breaking change)
