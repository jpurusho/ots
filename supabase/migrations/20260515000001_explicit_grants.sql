-- Explicit GRANTs for Data API access (required after Oct 30, 2026)
-- Ensures supabase-js, PostgREST, and GraphQL can access all tables.

-- Service role: full access
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Authenticated role: access to all tables (RLS enforces per-user restrictions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offerings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offering_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_users TO authenticated;
