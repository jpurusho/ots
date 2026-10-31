# 0013 — Use npm install with --legacy-peer-deps for web deployment

**Status:** accepted
**Date:** 2026-10-31

## Context

The GitHub Pages deployment workflow previously used `npm ci` for reproducible builds. However, the package-lock.json contains TypeScript 7.0.2 while package.json specifies TypeScript ^6.0.3, and typescript-eslint requires TypeScript <6.1.0.

`npm ci` is strict and will not proceed when package.json and package-lock.json are out of sync, even with `--legacy-peer-deps`. This caused web deployment failures.

## Decision

Change the deploy workflow to use `npm install --legacy-peer-deps` instead of `npm ci`. This provides flexibility to resolve peer dependency conflicts while still installing the correct dependencies for the build.

**Trade-off:** Slightly less reproducible builds (npm install resolves versions on-the-fly) vs. ability to deploy successfully with current dependency constraints.

## Consequences

- Web deployments succeed with the current dependency setup
- Builds are slightly less deterministic but remain consistent for the deploy environment
- Electron builds continue using `npm install` (via `npm run build:electron`) and are unaffected
- Future cleanup: resolve the TypeScript version conflict properly and revert to `npm ci`
