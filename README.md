# OTS — Offering Tracking System

Cloud-first, multi-user system for tracking church offerings. Users sign in with Google, upload offering slip images, and AI extracts the data automatically.

**Live:** [jpurusho.github.io/ots](https://jpurusho.github.io/ots/)

## Features

- **AI Scanning** — Upload offering slip photos, Claude extracts dates, amounts, denomination breakdowns
- **Google Drive Import** — Pull images from shared Drive folder, auto-convert HEIC, auto-scan
- **Review** — Side-by-side image + data, zoom, line-item editing, denomination breakdown
- **Reports** — Monthly/Yearly/Range views, calendar, missing Sundays, PDF/Drive/CSV/Email export
- **Checks** — Bank check tracking, contributor statements, year-end reports
- **Manual Entry** — Expression parser (10x2+100x5), keyboard entry without images
- **Multi-user** — Google OAuth, admin/operator roles, real-time sync
- **Email** — Send styled HTML reports and offering cards to recipients

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| Backend | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| AI | Claude via AWS Bedrock (dev) / Anthropic API (prod) |
| Data Fetching | TanStack React Query |
| PDF | ReportLab (pure Python) |
| Drive | Google Drive API (service account) |
| Email | Gmail SMTP |
| Hosting | GitHub Pages (free) |
| Icons | Lucide React |

## Quick Start

```bash
# Install dependencies
npm install

# Start Supabase locally (requires Docker)
npx supabase start

# Copy env and set anon key from supabase start output
cp .env.example .env

# Start dev server
npm run dev

# Start Python backend (for scanning, Drive, email, PDF)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8000 --reload
```

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Previous Version

[ots-v0](https://github.com/jpurusho/ots-v0) — Local-first with SQLite + PIN auth + Google Drive sync
