# OTS Architecture Reference

## Electron Layer
- `electron/main.ts` — app lifecycle, window, menu, GitHub API update check on launch
- `electron/renderer-server.ts` — local HTTP server port 48600 (SPA + OAuth callback)
- `electron/backend-manager.ts` — spawn/kill Python backend on random port
- `electron/config-manager.ts` — read/write `~/.ots/config.json` (0600 perms)
- `electron/ipc-handlers.ts` — all IPC: backend, config, update check/download, app info/focus
- `electron/preload.ts` — contextBridge exposes `window.electronAPI`
- `tsconfig.main.json` — CommonJS for Electron main process

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

## Database Tables
| Table | Purpose |
|-------|---------|
| `offerings` | One row per scanned/entered offering envelope |
| `offering_checks` | Bank check details linked to offerings (ON DELETE CASCADE) |
| `app_users` | Application users with roles, linked to auth.users |
| `app_settings` | Key-value config store with category, label, description |
| `activity_log` | Immutable audit trail (INSERT only, no UPDATE) |

## Settings Categories
| Category | Keys |
|----------|------|
| `general` | church_name, items_per_page, filename_template_report, filename_template_cards |
| `ai` | scanner_model, use_bedrock, anthropic_api_key, api_total_input_tokens, api_total_output_tokens, api_total_scans, api_total_cost |
| `drive` | google_drive_credentials, drive_images_folder_id, drive_reports_folder_id |
| `email` | smtp_user, smtp_password, report_recipients |
| `themes` | report_accent_color, card_accent_color (+ UI-only preset selector) |
| `database` | read-only; live stats via `get_db_stats()` RPC |

## Database Functions
- `get_db_stats()` — SECURITY DEFINER; returns DB size, per-table row counts/sizes, storage bucket totals, auth user count. Grant: `authenticated`.

## Storage Buckets
- `offering-images` — scanned offering images (authenticated access, signed URLs for reads)
- `reports` — generated PDF reports (authenticated access)

## Python Backend API (FastAPI)
- `POST /api/scan` — AI scan of offering image
- `POST /api/pdf/generate` — monthly table report PDF (optional Drive upload)
- `POST /api/pdf/generate-cards` — weekly cards PDF (optional Drive upload per card)
- `POST /api/drive/import` — import images from Google Drive folder
- `POST /api/drive/test` — verify Drive credentials and folder access
- `GET  /api/drive/list-folders` — list subfolders (for DriveFolderPicker)
- `GET  /api/drive/folder-info` — resolve folder ID → name/path
- `POST /api/email/send` — send report email via SMTP
- `POST /api/email/test` — send test email

Filename template variables: `{church}`, `{period}`, `{date}`, `{year}`, `{month}` — resolved in `_resolve_filename()`.

## CI/CD & Auto-Update
- `.github/workflows/deploy.yml` — web app → GitHub Pages on push to main
- `.github/workflows/release.yml` — Electron build + GitHub Release on `v*` tag
- `Makefile` — local build/run/release targets
- Auto-update: GitHub API check on launch; About page manual check + download; sidebar amber badge when update available
