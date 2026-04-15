# OTS v2 Architecture

## Overview

OTS v2 is a cloud-first, multi-user offering tracking system. Built on Supabase (PostgreSQL + Auth + Storage + Realtime) with a React frontend and Python backend for AI scanning.

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│   OTS Client                 │     │   Supabase (Docker / Cloud)  │
│   (Web / Electron)           │     │                              │
│                              │     │   Auth (Google OAuth)        │
│   React + TypeScript ────────────→ │   PostgreSQL (all data)      │
│   TanStack Query             │     │   Storage (images, PDFs)     │
│   Tailwind CSS               │     │   Realtime (live sync)       │
│                              │     │                              │
└──────────────────────────────┘     └──────────────────────────────┘
         │
         │  Python Backend (local)
         ├─→ AI Scanning (Bedrock / Anthropic API)
         ├─→ Google Drive (import images, export reports)
         ├─→ Email (SMTP/Gmail)
         └─→ PDF Generation (ReportLab)
```

## Core Principles

1. **No local state** — all data lives in Supabase (Postgres + Storage)
2. **Google OAuth** — users sign in with Google, no PINs
3. **Role-based access** — admins configure, operators use
4. **Real-time** — changes by one user are visible to others instantly
5. **Portable** — web app, wraps in Electron for desktop

## Authentication

- Supabase Auth with Google OAuth provider
- PKCE flow for desktop (Electron) apps
- Bootstrap admin: configurable email, auto-creates as first admin
- Admin adds operator emails via User Management
- Deactivated users blocked at login

## Database (PostgreSQL)

Tables:
- `offerings` — one row per scanned/entered offering
- `offering_checks` — bank check details linked to offerings (CASCADE delete)
- `app_users` — application-level roles (admin/operator), linked to auth.users
- `app_settings` — configuration (AI keys, Drive, email, church name)
- `activity_log` — audit trail of all actions

Row Level Security (RLS) policies control access at the database level.

## Storage

- `offering-images` bucket — uploaded offering slip images (JPG, PNG, HEIC→JPG, PDF)
- `reports` bucket — generated PDF reports
- Local dev: public bucket (fast, no auth issues)
- Production: private bucket with signed URLs

## AI Scanning

| Environment | Provider | How |
|-------------|----------|-----|
| Development | AWS Bedrock | Python backend, free on dev machine |
| Production | Anthropic API | API key in Settings, no AWS needed |

Scanning features:
- Multi-format support: handwritten slips, printed forms, bank checks
- HEIC auto-conversion to JPEG before scanning
- Denomination breakdown (100×8, 50×2, etc.)
- Check detection → creates offering_checks records
- Python-verified totals (never trust Claude's math)
- Structured scan_data JSON for line-item editing

## Google Drive Integration

- Service account credentials (admin uploads JSON key in Settings)
- **Import images**: Pull new photos from shared Drive folder
  - HEIC → JPEG conversion during import
  - Duplicate detection: filename, content hash, HEIC/JPEG variants
  - Auto-scan after import
- **Export reports**: Upload PDF reports to Drive reports folder
  - ReportLab generates styled PDFs (no system dependencies)
- **Folder picker**: Browse and select Drive folders by name

## Email

- Gmail SMTP with app password
- Admin configures in Settings → Email
- Default recipients saved for quick sending
- HTML email templates: styled table reports, offering cards
- Table-based layout (Gmail/Outlook compatible)

## Pages & Features

| Page | Features |
|------|----------|
| **Dashboard** | Stats cards, quick actions, activity feed |
| **Offerings** | Drag/drop upload, Drive import, auto-scan, duplicate detection |
| **Manual Entry** | Expression parser (10x2+100x5), date picker |
| **Review** | Image zoom, denomination breakdown, line-item editing, month filter, offering pills, approve/delete |
| **Reports** | Monthly/Yearly/Range views, calendar view, missing Sundays, table+cards toggle, PDF/Drive/CSV/Email export, YTD summary |
| **Checks** | Contributor tracking, year-end statements, date filter, PDF/Drive/CSV export |
| **Settings** | General, AI, Google Drive (folder picker), Email — admin only |
| **Users** | Add/remove, role management — admin only |
| **Activity** | Audit log, sort/filter, purge by range/selection — admin only |

## Role-Based Access

| Feature | Admin | Operator |
|---------|-------|----------|
| Upload, Review, Reports, Checks | Yes | Yes |
| Manual Entry | Yes | Yes |
| Settings, Users, Activity | Yes | No |

## Deployment

### Development
- Supabase locally via `npx supabase start` (Docker)
- Python backend: `cd backend && source .venv/bin/activate && uvicorn main:app --port 8000`
- React dev server: `npm run dev`

### Production
- Supabase Cloud (free tier: 500MB DB, 1GB storage)
- GitHub Pages (free, auto-deploy on push)
- Python backend: not needed for basic operations; needed for scanning, Drive, email, PDF

### Migration
- `scripts/migrate-to-cloud.py` — pushes local data + images to Supabase Cloud
- Safe to run multiple times (skips duplicates)

## Cost

| Service | Cost |
|---------|------|
| Supabase Cloud | Free (500MB DB, 1GB storage) |
| GitHub Pages | Free |
| AI Scanning | Bedrock (dev, free) / Anthropic (~$0.01/scan) |
| Domain (optional) | ~$12/year |

## Version History

- **v2.1.0** — Drive import, email, PDF reports, calendar view, expression parser, HEIC conversion
- **v2.0.0** — Cloud-first architecture with Supabase
- **v1.x** — Local-first with SQLite + PIN auth + Google Drive sync (see [ots-v0](https://github.com/jpurusho/ots-v0))
