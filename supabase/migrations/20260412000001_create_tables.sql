-- OTS v2 Database Schema
-- Migrated from SQLite (v1) to PostgreSQL (v2)

-- Offerings: one row per scanned/entered offering
CREATE TABLE offerings (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT UNIQUE,
  file_hash TEXT,
  offering_date TEXT,
  date_conf TEXT,
  general NUMERIC DEFAULT 0,
  cash NUMERIC DEFAULT 0,
  sunday_school NUMERIC DEFAULT 0,
  building_fund NUMERIC DEFAULT 0,
  misc NUMERIC DEFAULT 0,
  notes TEXT,
  scan_data JSONB,
  scanned_at TIMESTAMPTZ,
  locked INT DEFAULT 0,
  locked_at TIMESTAMPTZ,
  created_by_email TEXT,
  approved_by_email TEXT,
  discarded_by_email TEXT,
  source_type TEXT DEFAULT 'scanned',
  status TEXT DEFAULT 'pending',
  image_path TEXT,
  scan_error TEXT,
  reviewed_at TIMESTAMPTZ,
  modified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Offering checks: bank check details linked to offerings
CREATE TABLE offering_checks (
  id BIGSERIAL PRIMARY KEY,
  offering_id BIGINT REFERENCES offerings(id) ON DELETE CASCADE,
  check_number TEXT,
  payer_name TEXT,
  bank_name TEXT,
  account_number_last4 TEXT,
  memo TEXT,
  amount NUMERIC,
  category TEXT,
  image_filename TEXT,
  content_hash TEXT UNIQUE,
  modified_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- App users: application-level roles, linked to Supabase auth.users
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  picture TEXT,
  role TEXT DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- App settings: key-value configuration store
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  category TEXT,
  data_type TEXT DEFAULT 'string',
  label TEXT,
  description TEXT,
  modified_at TIMESTAMPTZ DEFAULT now()
);

-- Activity log: audit trail of all user actions
CREATE TABLE activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_offerings_status ON offerings(status);
CREATE INDEX idx_offerings_date ON offerings(offering_date);
CREATE INDEX idx_offerings_locked ON offerings(locked);
CREATE INDEX idx_offering_checks_offering ON offering_checks(offering_id);
CREATE INDEX idx_activity_created ON activity_log(created_at);
CREATE INDEX idx_activity_action ON activity_log(action);
CREATE INDEX idx_app_settings_category ON app_settings(category);

-- Seed essential settings
INSERT INTO app_settings (key, value, category, data_type, label, description) VALUES
  ('church_name', '', 'general', 'string', 'Organization Name', 'Displayed in report headers'),
  ('scanner_model', 'claude-sonnet-4-6-20250929', 'ai', 'string', 'Scanner Model', 'Claude model for image scanning'),
  ('use_bedrock', 'false', 'ai', 'boolean', 'Use AWS Bedrock', 'Use Bedrock instead of direct Anthropic API'),
  ('items_per_page', '20', 'general', 'number', 'Items Per Page', 'Number of items shown in lists');
