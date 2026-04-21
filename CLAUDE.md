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
- PKCE flow (`flowType: 'pkce'` in supabase.ts), `detectSessionInUrl: false` everywhere
- **Production Electron:** `skipBrowserRedirect: true` → auth URL opens in system browser → callback hits localhost:48600/auth/callback → renderer-server sends IPC (`webContents.send('auth-callback', { code })`) → preload's `ipcRenderer.on` fires → `api.auth.onCallback` in auth-context exchanges code for session
- **Dev Electron:** standard browser redirect to `http://localhost:5173/auth/callback` → AuthCallbackPage exchanges code (IPC path skipped in dev: `if (isElectron && !import.meta.env.DEV)`)
- **Browser:** standard PKCE redirect to /auth/callback → AuthCallbackPage exchanges code
- `onAuthStateChange` callback must NOT call any Supabase methods directly (deadlock) — use `setTimeout(fn, 0)` to defer

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
- No confirm() dialogs — actions execute directly, logged to activity_log

## Pages
| Route | Page | Access |
|-------|------|--------|
| `/` | Dashboard | All |
| `/offerings` | Offerings — upload images from local or Google Drive | All |
| `/manual-entry` | ManualEntry — enter offering totals without scanning | All |
| `/review` | Review — scan images via AI, edit/approve/discard | All |
| `/reports` | Reports — monthly table reports + weekly cards, PDF/email/Drive | All |
| `/checks` | Checks — bank check tracking, contribution statements | All |
| `/about` | About — version, update check/download | All |
| `/settings` | Settings — admin configuration (6 tabs) | Admin only |
| `/users` | Users — manage users, generate/email invite codes | Admin only |
| `/activity` | Activity — audit log with pagination and purge | Admin only |
| `/invite` | Invite — operator setup wizard (enter invite code) | Unauthenticated |
| `/auth/callback` | AuthCallback — PKCE code exchange | Unauthenticated |

## Shared Components
- `Layout.tsx` — navbar/sidebar with role-aware menu links and update badge
- `AdminGuard.tsx` — authorization wrapper, redirects non-admins
- `SortableTable.tsx` — generic sortable/searchable table with client-side pagination (`pageSize` prop)
- `DriveFolderPicker.tsx` — Google Drive folder browser (calls backend `/api/drive/list-folders`)

## Database
- Schema: `supabase/migrations/` SQL files (CREATE IF NOT EXISTS, idempotent)
- Types: `src/types/database.ts` — manually maintained to match migrations

### Tables
| Table | Purpose |
|-------|---------|
| `offerings` | One row per scanned/entered offering envelope |
| `offering_checks` | Bank check details linked to offerings (ON DELETE CASCADE) |
| `app_users` | Application users with roles, linked to auth.users |
| `app_settings` | Key-value config store with category, label, description |
| `activity_log` | Immutable audit trail (INSERT only, no UPDATE) |

### Offering Status Lifecycle
`pending` → `uploaded` → `scanned` / `scan_error` → `reviewed` → `locked` → `approved` / `discarded`
- `source_type`: `'scanned'` (image upload) or `'manual'` (direct entry)
- `scan_error`: populated when AI scanning fails, displayed in Review

### Storage Buckets
- `offering-images` — scanned offering images (authenticated access, signed URLs for reads)
- `reports` — generated PDF reports (authenticated access)

### Database Functions
- `get_db_stats()` — SECURITY DEFINER; returns DB size, per-table row counts/sizes, storage bucket totals, auth user count. Used by Settings > Database tab. Grant: `authenticated`.

### Settings Categories
| Category | Keys |
|----------|------|
| `general` | church_name, items_per_page, filename_template_report, filename_template_cards |
| `ai` | scanner_model, use_bedrock, anthropic_api_key, api_total_input_tokens, api_total_output_tokens, api_total_scans, api_total_cost |
| `drive` | google_drive_credentials, drive_images_folder_id, drive_reports_folder_id |
| `email` | smtp_user, smtp_password, report_recipients |
| `themes` | report_accent_color, card_accent_color (+ UI-only preset selector) |
| `database` | read-only; live stats via `get_db_stats()` RPC |

### RLS
Authenticated users can SELECT/INSERT/UPDATE/DELETE on all public tables. `activity_log` is INSERT-only by convention (no RLS-level restriction, but app never updates/deletes except via admin purge).

## Roles
- **Admin:** bootstrap email auto-creates first admin; can manage settings, users, activity log
- **Operator:** added by admin; can upload, review, report — no access to settings/users/activity
- Unknown emails get "Access Denied" screen

## Invite System
- Admin generates invite code (base64 JSON: url, anonKey, serviceKey, env)
- Can email invite directly from Users page (uses backend `/api/email/send`)
- Invite code encodes the active environment (prod or test)
- Operator enters code in Setup wizard → saved to `~/.ots/config.json`

## Python Backend API (FastAPI)
Key endpoints used by the frontend:
- `POST /api/scan` — AI scan of offering image
- `POST /api/pdf/generate` — monthly table report PDF (optional Drive upload)
- `POST /api/pdf/generate-cards` — weekly cards PDF (optional Drive upload per card)
- `POST /api/drive/import` — import images from Google Drive folder
- `POST /api/drive/test` — verify Drive credentials and folder access
- `GET  /api/drive/list-folders` — list subfolders (for DriveFolderPicker)
- `GET  /api/drive/folder-info` — resolve folder ID → name/path
- `POST /api/email/send` — send report email via SMTP
- `POST /api/email/test` — send test email

Filename templates for generated PDFs are resolved in `_resolve_filename()` (backend) with variables: `{church}`, `{period}`, `{date}`, `{year}`, `{month}`. Unknown `{vars}` render as literal text (braces stripped).

## CI/CD
- `.github/workflows/deploy.yml` — web app auto-deploy to GitHub Pages on push to main
- `.github/workflows/release.yml` — Electron build + GitHub Release on `v*` tag push
- `Makefile` — local build/run/release targets

## Auto-Update
- On launch: GitHub API check for latest release (no electron-updater/latest-mac.yml)
- About page: manual check for updates, download zip with progress bar
- Sidebar: amber pulsing badge when update available

## Git
- Use jpurusho account (jerome.purushotham@gmail.com)
- HTTPS remote with GH_TOKEN (SSH resolves to wrong account)
- Main branch: `main`
