# CLAUDE.md — OTS v2

## Project
OTS (Offering Tracking System) — cloud-first multi-user system for tracking church offerings.

## Stack
- **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS + TanStack React Query
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **AI:** Claude via AWS Bedrock (dev) / Anthropic API (prod)
- **Desktop:** Electron (planned, not yet integrated)
- **Icons:** Lucide React

## Commands
```bash
npm run dev          # Start Vite dev server
npm run build        # Type-check + production build
npm run preview      # Preview production build
npx supabase start   # Start local Supabase (Docker)
npx supabase stop    # Stop local Supabase
npx supabase db reset  # Reset DB and re-run migrations
npx supabase gen types typescript --local > src/types/supabase.ts  # Generate types
```

## Architecture
- All data in Supabase PostgreSQL (no local SQLite)
- Auth via Supabase Auth + Google OAuth
- Images in Supabase Storage buckets
- Real-time subscriptions for live updates
- Row Level Security (RLS) for access control
- See ARCHITECTURE.md for full details

## Conventions
- Path alias: `@/` maps to `src/` (configured in vite.config.ts)
- Data fetching: use TanStack Query (`useQuery`, `useMutation`) with Supabase client
- Auth: use `useAuth()` hook from `src/lib/auth-context.tsx`
- Supabase client: import from `src/lib/supabase.ts`
- Pages in `src/pages/`, shared components in `src/components/`
- Tailwind for styling, no CSS modules

## Database
- Schema defined in `supabase/migrations/` SQL files
- Tables: offerings, offering_checks, app_users, app_settings, activity_log
- Types: auto-generated via `supabase gen types typescript`
- RLS policies enforce access control

## Roles
- **Admin:** first sign-in auto-promotes, can manage settings/users
- **Operator:** added by admin, can upload/review/report

## Git
- Use jpurusho account (jerome.purushotham@gmail.com)
- Main branch: `main`
- Previous version: github.com/jpurusho/ots-v0
