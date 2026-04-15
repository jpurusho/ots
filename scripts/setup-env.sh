#!/bin/bash
# OTS Environment Setup
# Run: bash scripts/setup-env.sh [local|prod]

MODE=${1:-local}

if [ "$MODE" = "prod" ]; then
  echo "Setting up for PRODUCTION (Supabase Cloud)..."

  cat > .env << 'EOF'
VITE_SUPABASE_URL=https://xtbzyficagznxatzxlzy.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Ynp5ZmljYWd6bnhhdHp4bHp5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjUxMjQsImV4cCI6MjA5MTcwMTEyNH0.wsaOtKL5QjXwwaD_uo_PerB9f9Ma6AKRbPspTTirMks
VITE_BOOTSTRAP_ADMIN=jerome.purushotham@gmail.com
EOF

  cat > backend/.env << 'EOF'
SUPABASE_URL=https://xtbzyficagznxatzxlzy.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0Ynp5ZmljYWd6bnhhdHp4bHp5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjEyNTEyNCwiZXhwIjoyMDkxNzAxMTI0fQ.6v0S37xySmDCHrkHyyRWeWv6f1C1LWRpwy_v7eBFwPQ
USE_BEDROCK=false
EOF

  echo "Done. Run: npm run dev"
  echo "Backend: cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 --reload"

elif [ "$MODE" = "local" ]; then
  echo "Setting up for LOCAL DEV (Docker Supabase)..."
  echo ""
  echo "1. Start Docker Desktop"
  echo "2. Run: npx supabase start"
  echo "3. Copy the ANON_KEY from the output"
  echo ""

  # Check if supabase is running
  ANON_KEY=$(npx supabase status -o env 2>/dev/null | grep ANON_KEY | cut -d'"' -f2)
  SERVICE_KEY=$(npx supabase status -o env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d'"' -f2)

  if [ -z "$ANON_KEY" ]; then
    echo "Supabase not running. Start it first: npx supabase start"
    echo "Then run this script again: bash scripts/setup-env.sh local"
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

  echo "Create supabase/.env manually with your Google OAuth credentials:"
  echo "  GOOGLE_OAUTH_CLIENT_ID=<your-client-id>"
  echo "  GOOGLE_OAUTH_CLIENT_SECRET=<your-client-secret>"
  echo ""
  echo "Get these from: https://console.cloud.google.com/apis/credentials?project=ots-application-491609"
  if [ ! -f supabase/.env ]; then
    cat > supabase/.env << 'EOF'
# Google OAuth credentials — get from Google Cloud Console
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
EOF
    echo "Created supabase/.env — fill in the values above"
  else
    echo "supabase/.env already exists — skipping"
  fi

  echo ""
  echo "Done. All .env files created."
  echo ""
  echo "Run: npm run dev"
  echo "Backend: cd backend && source .venv/bin/activate && uvicorn main:app --port 8000 --reload"

else
  echo "Usage: bash scripts/setup-env.sh [local|prod]"
  echo ""
  echo "  local  — Docker Supabase + Bedrock scanning (dev)"
  echo "  prod   — Supabase Cloud + Anthropic API (production)"
fi
