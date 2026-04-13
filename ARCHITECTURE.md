# OTS v2 Architecture

## Overview

OTS v2 is a cloud-first, multi-user offering tracking system. It replaces the v1 local-first architecture (SQLite + PIN auth + Google Drive sync) with a modern stack built on Supabase.

```
┌──────────────────────────────┐     ┌──────────────────────────────┐
│   OTS Client                 │     │   Supabase (Docker / Cloud)  │
│   (Web / Electron)           │     │                              │
│                              │     │   Auth (Google OAuth)        │
│   React + TypeScript ────────────→ │   PostgreSQL (all data)      │
│   TanStack Query             │     │   Storage (images, PDFs)     │
│   Tailwind CSS               │     │   Realtime (live sync)       │
│                              │     │   Edge Functions (AI scan)   │
└──────────────────────────────┘     └──────────────────────────────┘
```

## Core Principles

1. **No local state** — all data lives in Supabase (Postgres + Storage)
2. **Google OAuth** — users sign in with Google, no PINs
3. **Role-based access** — admins configure, operators use
4. **Real-time** — changes by one user are visible to others instantly
5. **Portable** — starts as web app, wraps in Electron for desktop

## Authentication

- Supabase Auth with Google OAuth provider
- PKCE flow for desktop (Electron) apps
- First user to sign in auto-promotes to admin
- Admin adds operator emails via User Management

## Database (PostgreSQL)

Tables:
- `offerings` — one row per scanned/entered offering
- `offering_checks` — check details linked to offerings
- `app_users` — application-level roles (admin/operator), linked to auth.users
- `app_settings` — configuration (AI keys, church name, etc.)
- `activity_log` — audit trail of all actions

Row Level Security (RLS) policies control access at the database level.

## Storage

- `offering-images` bucket — uploaded offering slip images (JPG, PNG, HEIC, PDF)
- `reports` bucket — generated PDF reports
- Images served via signed URLs for preview
- No local file storage required

## AI Scanning

| Environment | Provider | How |
|-------------|----------|-----|
| Development | AWS Bedrock | Python backend connects to Supabase, reads image, sends to Bedrock |
| Production | Anthropic API | Supabase Edge Function with API key as secret |

The scanning prompt extracts: date, denomination breakdown, check entries, notes.

## Data Flow

### Upload & Scan
```
User drops image → Supabase Storage upload
  → offering record created (status: uploaded)
  → AI scan triggered (Edge Function or Python)
  → scan results written to offering (status: scanned)
  → appears in Review queue for all users (real-time)
```

### Review & Approve
```
User opens Review → sees pending offerings (real-time query)
  → views image (signed URL from Storage) + scan data side by side
  → edits amounts if needed → clicks Approve
  → offering status → approved, locked
  → available for reports
```

### Reports
```
Admin selects date range → report generated (Python or Edge Function)
  → PDF uploaded to Storage
  → downloadable via signed URL
  → optionally copied to Google Drive reports folder
```

## Deployment Strategy

### Phase A — Development
- Supabase runs locally via `supabase start` (Docker)
- Python backend for AI scanning (Bedrock)
- React dev server (`npm run dev`)

### Phase B — Production
- `pg_dump` local → import to Supabase Cloud (free tier)
- Upload images to cloud Storage
- Edge Function handles scanning (Anthropic API key)
- React app deployed to Vercel/Netlify (free) or wrapped in Electron
- Other machines: download app → sign in → ready

## Role-Based UI

| Feature | Admin | Operator |
|---------|-------|----------|
| Offerings (upload, scan) | Yes | Yes |
| Review (approve, edit) | Yes | Yes |
| Reports (generate, download) | Yes | Yes |
| Settings (AI, email, church) | Yes | No |
| User Management | Yes | No |
| Activity Log | Yes | No |

## Google Drive (Optional)

Drive is a convenience layer, not the backbone:
- **Import from Drive** — pull phone camera uploads into Supabase
- **Export reports to Drive** — share PDFs with finance team
- Not required for the app to function

## Cost

| Service | Free Tier |
|---------|-----------|
| Supabase Cloud | 500 MB DB, 1 GB storage, 50K API calls/mo |
| Self-hosted (Docker) | Unlimited (runs on your hardware) |
| Vercel/Netlify | Static hosting for React app |
| AI Scanning | Bedrock (dev, free), Anthropic API (prod, ~$0.01/scan) |

## Version History

- **v2.0.0** — Cloud-first architecture with Supabase
- **v1.x** — Local-first with SQLite + PIN auth + Google Drive sync (see [ots-v0](https://github.com/jpurusho/ots-v0))
