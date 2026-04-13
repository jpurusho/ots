# OTS — Offering Tracking System

Cloud-first, multi-user system for tracking church offerings. Users sign in with Google, upload offering slip images, and AI extracts the data automatically.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| AI Scanning | Claude via AWS Bedrock (dev) / Anthropic API (prod) |
| Desktop | Electron (planned) |
| Data Fetching | TanStack React Query |
| Icons | Lucide React |

## Quick Start

```bash
# Install dependencies
npm install

# Start Supabase locally (requires Docker)
npx supabase start

# Copy the anon key from supabase start output into .env
cp .env.example .env
# Edit .env with your VITE_SUPABASE_ANON_KEY

# Start dev server
npm run dev
```

## Project Structure

```
ots/
├── src/
│   ├── lib/            # Supabase client, auth context
│   ├── pages/          # Route pages
│   ├── components/     # Shared components
│   └── types/          # TypeScript types
├── supabase/
│   ├── migrations/     # Database schema (Postgres)
│   └── functions/      # Edge Functions (AI scanning)
└── backend/            # Python (report gen, local AI scanning)
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.
