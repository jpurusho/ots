#!/bin/bash
# OTS — Browser-only dev environment setup (optional)
#
# NOT needed for Electron builds. The desktop app uses ~/.ots/config.json
# configured through the Setup Wizard on first launch.
#
# This script is only for running the web app with: npm run dev
# It requires a local Supabase instance (Docker).
#
# Usage: bash scripts/setup-env.sh

echo "Setting up for LOCAL browser dev (Docker Supabase)..."
echo ""
echo "1. Start Docker Desktop"
echo "2. Run: npx supabase start"
echo "3. Run this script again"
echo ""

# Check if supabase is running
ANON_KEY=$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)
SERVICE_KEY=$(npx supabase status -o env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d'"' -f2)

if [ -z "$ANON_KEY" ]; then
  echo "Supabase not running. Start it first: npx supabase start"
  exit 1
fi

cat > .env << EOF
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=${ANON_KEY}
VITE_BOOTSTRAP_ADMIN=jerome.purushotham@gmail.com
EOF

cat > backend/.env << EOF
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_KEY=${SERVICE_KEY}
USE_BEDROCK=true
AWS_REGION=us-east-1
EOF

echo "Created .env and backend/.env for local dev."
echo ""
echo "For Google OAuth, create supabase/.env with:"
echo "  GOOGLE_OAUTH_CLIENT_ID=<your-client-id>"
echo "  GOOGLE_OAUTH_CLIENT_SECRET=<your-client-secret>"
echo ""
echo "Run: npm run dev"
echo "Backend: cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 --reload"
