# Local Supabase Setup (Full Mirror)

Run OTS entirely locally with a full copy of your cloud data. Useful for development, backup, and offline access.

## Prerequisites

- Docker Desktop (running)
- Supabase CLI: `brew install supabase/tap/supabase`
- Node.js 20+, Python 3.11+

## 1. Start Local Supabase

```bash
cd /path/to/ots
npx supabase start
```

This starts PostgreSQL, Auth, Storage, and all Supabase services locally. Note the output:

```
API URL: http://127.0.0.1:54321
anon key: eyJ...
service_role key: eyJ...
```

## 2. Apply Schema

```bash
npx supabase db reset
```

This runs all migrations from `supabase/migrations/` and seeds the database.

## 3. Mirror Data from Cloud

### Pull data from cloud to local:

```bash
# Set your cloud credentials
export CLOUD_URL="https://xtbzyficagznxatzxlzy.supabase.co"
export CLOUD_SERVICE_KEY="your-service-role-key"
export LOCAL_URL="http://127.0.0.1:54321"
export LOCAL_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU"

# Run the sync script
python3 scripts/sync-data.py --from cloud --to local
```

### Push data from local to cloud:

```bash
python3 scripts/sync-data.py --from local --to cloud
```

## 4. Run the App Locally

### Web dev (uses local Supabase):

```bash
# Create .env with local Supabase URLs
cat > .env << EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WO_XXhejksvRVRE8Z3pvn4piYOcLffUHhMBY
EOF

npm run dev
```

### Backend (uses local Supabase):

```bash
cd backend && source .venv/bin/activate
export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU
uvicorn main:app --port 8000 --reload
```

### Electron (uses local Supabase):

Update `~/.ots/config.json` to point to local:
```json
{
  "supabase": {
    "local": {
      "url": "http://127.0.0.1:54321",
      "anonKey": "eyJ...anon...",
      "serviceKey": "eyJ...service_role..."
    }
  },
  "activeEnv": "local"
}
```

## 5. Storage (Images)

Local Supabase Storage uses the same bucket structure. To copy images:

```bash
python3 scripts/sync-data.py --from cloud --to local --include-storage
```

## 6. OAuth (Local Auth)

Local Supabase Auth doesn't connect to Google OAuth by default. Options:

1. **Email login** — Use the local auth dashboard at http://127.0.0.1:54323 to create test users
2. **Skip auth** — Set `VITE_SKIP_AUTH=true` for local development (if you add this feature)
3. **Google OAuth** — Configure in `supabase/config.toml` with your Google OAuth client

## 7. Stop Local Supabase

```bash
npx supabase stop
```

Data persists in Docker volumes. Use `npx supabase stop --no-backup` to wipe.

## Scheduled Backup

Add to crontab for automatic nightly backup:

```bash
# Nightly backup at 2 AM
0 2 * * * cd /path/to/ots && python3 scripts/sync-data.py --from cloud --to local >> /tmp/ots-backup.log 2>&1
```
