# CLAUDE.md — OTS v3

## Project
OTS (Offering Tracking System) — cloud-first multi-user system for tracking church offerings. Runs as a web app (GitHub Pages) or Electron desktop app with bundled Python backend.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + TanStack React Query
- **Desktop:** Electron 41 + electron-builder (macOS zip, unsigned)
- **Backend:** Supabase Cloud (PostgreSQL + Auth + Storage + Realtime)
- **Python Backend:** FastAPI bundled via PyInstaller (scanning, Drive, email, PDF)
- **AI:** Claude via Anthropic API (prod) / AWS Bedrock (dev option)
- **Icons:** Lucide React

## Commands
```bash
# Web development
npm run dev              # Vite dev server (port 5173)
npm run build            # Type-check + production build

# Electron development
npm run dev:electron     # Vite + Electron together (concurrently)
npm run build:electron   # Compile Electron + Vite for packaging

# Production builds (Makefile)
make build               # Backend binary + Electron app → release/*.zip
make build-run           # Build + launch OTS.app
make run                 # Launch last build (builds if needed)
make build-push          # Push code + tag → CI builds
make clean               # Remove build artifacts

# Python backend (standalone dev)
cd backend && source .venv/bin/activate
uvicorn main:app --port 8000 --reload
```

## Architecture
- All data in Supabase PostgreSQL (no local state)
- Auth via Supabase Auth + Google OAuth (PKCE flow)
- Electron auth: system browser + PKCE (skipBrowserRedirect → shell.openExternal)
- Browser auth: standard PKCE redirect to /auth/callback
- Images in Supabase Storage (private on cloud, public on local)
- Python backend bundled as PyInstaller binary in Electron, standalone in dev
- Supabase client uses Proxy pattern for dynamic init (15+ files import unchanged)
- Config stored in `~/.ots/config.json` (Electron), env vars (browser)
- Test/prod DB switching via EnvContext + config manager

## Electron Layer
- `electron/main.ts` — app lifecycle, window, menu, GitHub API update check on launch
- `electron/renderer-server.ts` — local HTTP server on port 48600 (serves SPA, handles OAuth callback from system browser)
- `electron/backend-manager.ts` — spawn/kill Python backend on random port
- `electron/config-manager.ts` — read/write ~/.ots/config.json (0600 perms)
- `electron/ipc-handlers.ts` — all IPC: backend, config, update check/download, app info/focus
- `electron/preload.ts` — contextBridge exposes window.electronAPI
- `tsconfig.main.json` — CommonJS for Electron main process

## Key Auth Pattern (CRITICAL — do not change)
- PKCE flow (`flowType: 'pkce'` in supabase.ts)
- Electron: `skipBrowserRedirect: true` → open auth URL in system browser → callback hits localhost:48600/auth/callback → renderer-server returns "close tab" HTML to browser → dispatches CustomEvent to Electron window → auth-context exchanges code for session
- `onAuthStateChange` callback must NOT call any Supabase methods directly (deadlock) — use `setTimeout(fn, 0)` to defer
- Browser mode: standard PKCE redirect to /auth/callback → AuthCallbackPage exchanges code

## Conventions
- Path alias: `@/` maps to `src/` (configured in vite.config.ts)
- Data fetching: TanStack Query (`useQuery`, `useMutation`) with Supabase client
- Auth: `useAuth()` hook from `src/lib/auth-context.tsx`
- Supabase client: `src/lib/supabase.ts` (Proxy pattern)
- Electron detection: `src/lib/electron-compat.ts` (`isElectron`, `getElectronAPI()`)
- Backend URL: `src/lib/backend.ts` (`getBackendUrl()` — IPC or env var)
- Env switching: `src/lib/env-context.tsx` (`useEnv()`, `switchEnvironment()`)
- Theme: `src/lib/theme-context.tsx` (light/dark/system, localStorage)
- Accent colors: `src/lib/accent-colors.ts` (`useAccentColors()` — reads from app_settings)
- Pages in `src/pages/`, shared components in `src/components/`
- Tailwind for styling, no CSS modules
- No confirm() dialogs — actions execute directly, logged to activity

## Database
- Schema: `supabase/migrations/` SQL files (CREATE IF NOT EXISTS for idempotent apply)
- Tables: offerings, offering_checks, app_users, app_settings, activity_log
- RLS policies: authenticated users can CRUD (all tables including DELETE on app_users)
- Settings: app_settings table with categories: general, ai, drive, email, themes

## Roles
- **Admin:** bootstrap email auto-creates first admin, can manage settings/users/activity
- **Operator:** added by admin, can upload/review/report — no settings/users/activity access
- Unknown emails get "Access Denied" screen

## Invite System
- Admin generates invite code (base64 JSON with url, anonKey, serviceKey, env)
- Can email invite directly from Users page (uses backend /api/email/send)
- Invite code encodes the active environment (prod or test)
- Operator enters code in Setup wizard → saves to ~/.ots/config.json

## CI/CD
- `.github/workflows/deploy.yml` — web app auto-deploy to GitHub Pages on push to main
- `.github/workflows/release.yml` — Electron build + GitHub Release on `v*` tag push
- `Makefile` — local build/run/release targets
- GitHub releases: manual zip upload via `gh release create`

## Auto-Update
- On launch: GitHub API check for latest release (no electron-updater/latest-mac.yml)
- Settings > About: check for updates, download zip with progress bar
- Sidebar: amber pulsing badge when update available, links to Settings

## Git
- Use jpurusho account (jerome.purushotham@gmail.com)
- HTTPS remote with GH_TOKEN (SSH resolves to wrong account)
- Main branch: `main`
- Previous version: github.com/jpurusho/ots-v0
