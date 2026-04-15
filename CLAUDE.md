# CLAUDE.md — OTS v2

## Project
OTS (Offering Tracking System) — cloud-first multi-user system for tracking church offerings.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + TanStack React Query
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Python Backend:** FastAPI (scanning, Drive, email, PDF generation)
- **AI:** Claude via AWS Bedrock (dev) / Anthropic API (prod)
- **Icons:** Lucide React

## Commands
```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # Type-check + production build
npx supabase start   # Start local Supabase (Docker)
npx supabase stop    # Stop local Supabase
npx supabase db reset  # Reset DB and re-run migrations

# Backend (scanning, Drive, email, PDF)
cd backend && source .venv/bin/activate
uvicorn main:app --port 8000 --reload
```

## Architecture
- All data in Supabase PostgreSQL (no local SQLite)
- Auth via Supabase Auth + Google OAuth
- Images in Supabase Storage buckets (private on cloud, public on local)
- Python backend for: AI scanning, Google Drive import/export, email, PDF generation
- Row Level Security (RLS) for access control
- See ARCHITECTURE.md for full details

## Conventions
- Path alias: `@/` maps to `src/` (configured in vite.config.ts)
- Data fetching: TanStack Query (`useQuery`, `useMutation`) with Supabase client
- Auth: `useAuth()` hook from `src/lib/auth-context.tsx`
- Supabase client: `src/lib/supabase.ts`
- Pages in `src/pages/`, shared components in `src/components/`
- Shared utilities: `src/lib/print-utils.ts`, `src/lib/pdf-utils.ts`, `src/lib/activity.ts`, `src/lib/upload-manager.tsx`
- Tailwind for styling, no CSS modules
- No confirm() dialogs — actions execute directly, logged to activity

## Database
- Schema: `supabase/migrations/` SQL files
- Tables: offerings, offering_checks, app_users, app_settings, activity_log
- RLS policies: authenticated users can CRUD offerings/checks/activity; admin-only for settings/users via frontend guards

## Roles
- **Admin:** bootstrap email auto-creates first admin (VITE_BOOTSTRAP_ADMIN env var)
- **Operator:** added by admin, can upload/review/report — no settings/users/activity access
- Unknown emails get "Access Denied" screen

## Git
- Use jpurusho account (jerome.purushotham@gmail.com)
- HTTPS remote with GH_TOKEN (SSH resolves to wrong account)
- Main branch: `main`
- Previous version: github.com/jpurusho/ots-v0
