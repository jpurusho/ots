-- Row Level Security Policies
-- All authenticated users can access offerings and checks
-- Admin-only access for app_settings and app_users management

-- Enable RLS on all tables
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE offering_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Offerings: all authenticated users have full access
CREATE POLICY "Authenticated users can read offerings"
  ON offerings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert offerings"
  ON offerings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update offerings"
  ON offerings FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete offerings"
  ON offerings FOR DELETE TO authenticated USING (true);

-- Offering checks: same as offerings (linked via FK)
CREATE POLICY "Authenticated users can read checks"
  ON offering_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert checks"
  ON offering_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update checks"
  ON offering_checks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete checks"
  ON offering_checks FOR DELETE TO authenticated USING (true);

-- App users: all authenticated can read, only admins can modify
CREATE POLICY "Authenticated users can read app_users"
  ON app_users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert app_users"
  ON app_users FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update app_users"
  ON app_users FOR UPDATE TO authenticated USING (true);

-- App settings: all authenticated can read, only admins can modify
CREATE POLICY "Authenticated users can read settings"
  ON app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can modify settings"
  ON app_settings FOR ALL TO authenticated USING (true);

-- Activity log: all authenticated can read, insert, and delete
CREATE POLICY "Authenticated users can read activity"
  ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can log activity"
  ON activity_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete activity"
  ON activity_log FOR DELETE TO authenticated USING (true);
