# CLAUDE.md — OTS v3

## Project
OTS (Offering Tracking System) — church offering tracker. Web app (GitHub Pages) + Electron desktop with bundled Python backend.

## Stack
React 19 + TS + Vite + Tailwind + TanStack Query | Electron 41 | Supabase (PostgreSQL + Auth + Storage) | FastAPI/PyInstaller | Claude API / Bedrock | Lucide React

## Commands
- `npm run dev` / `npm run build` — web dev/build
- `npm run dev:electron` / `npm run build:electron` — Electron dev/build
- `make build` / `make build-run` / `make run` / `make build-push` / `make clean` — production
- `cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 --reload` — Python dev

## Auth (CRITICAL — do not change)
- PKCE flow (`flowType: 'pkce'` in supabase.ts), `detectSessionInUrl: false` everywhere
- **Prod Electron:** `skipBrowserRedirect: true` → system browser → localhost:48600/auth/callback → IPC `auth-callback` → auth-context exchanges code
- **Dev Electron:** redirect to `http://localhost:5173/auth/callback` (IPC skipped: `if (isElectron && !import.meta.env.DEV)`)
- **Browser:** standard PKCE redirect to /auth/callback → AuthCallbackPage exchanges code
- `onAuthStateChange`: never call Supabase directly — use `setTimeout(fn, 0)` to defer

## Conventions
- `@/` → `src/` | TanStack Query (`useQuery`, `useMutation`) | `useAuth()` from `src/lib/auth-context.tsx`
- Supabase via Proxy (`src/lib/supabase.ts`) | `isElectron`/`getElectronAPI()` in `electron-compat.ts`
- `getBackendUrl()` in `backend.ts` | `useEnv()` in `env-context.tsx` | `useAccentColors()` in `accent-colors.ts`
- Tailwind only, no CSS modules | No confirm() dialogs — actions log to activity_log

## Database
- Schema: `supabase/migrations/` | Types: `src/types/database.ts` (manually maintained)
- Status: `pending → uploaded → scanned/scan_error → reviewed → locked → approved/discarded`
- `source_type`: `'scanned'` or `'manual'` | RLS: authenticated full access; activity_log INSERT-only by convention

## Roles & Invite
- **Admin:** bootstrap email → first admin; manages settings/users/activity
- **Operator:** upload/review/report only
- **Invite:** base64 JSON (url, anonKey, serviceKey, env) → `~/.ots/config.json`

## Git
- Account: jpurusho (jerome.purushotham@gmail.com) — HTTPS + GH_TOKEN (SSH resolves to wrong account)

## Reference
See `.claude/skills/ots-architecture.md` for: Electron layer files, pages table, shared components, DB tables/settings/functions, backend API endpoints, CI/CD details.
