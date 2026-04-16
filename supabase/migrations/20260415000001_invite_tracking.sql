-- Add invite tracking columns to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invite_status TEXT DEFAULT 'none' CHECK (invite_status IN ('none', 'pending', 'accepted'));
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS invite_env TEXT CHECK (invite_env IN ('prod', 'test'));
