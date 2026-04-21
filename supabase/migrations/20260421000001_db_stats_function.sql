-- Function to return live Supabase usage stats (DB size, table sizes, storage, auth users).
-- SECURITY DEFINER so it can access storage and auth schemas.
-- SET search_path = '' to prevent search_path injection.

CREATE OR REPLACE FUNCTION public.get_db_stats()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  result JSON;
  offerings_count BIGINT;
  checks_count BIGINT;
  users_count BIGINT;
  activity_count BIGINT;
  settings_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO offerings_count FROM public.offerings;
  SELECT COUNT(*) INTO checks_count FROM public.offering_checks;
  SELECT COUNT(*) INTO users_count FROM public.app_users;
  SELECT COUNT(*) INTO activity_count FROM public.activity_log;
  SELECT COUNT(*) INTO settings_count FROM public.app_settings;

  SELECT json_build_object(
    'db_size_bytes', pg_database_size(current_database()),
    'tables', json_build_array(
      json_build_object('name', 'offerings',      'rows', offerings_count, 'size_bytes', pg_total_relation_size('public.offerings')),
      json_build_object('name', 'offering_checks','rows', checks_count,    'size_bytes', pg_total_relation_size('public.offering_checks')),
      json_build_object('name', 'activity_log',   'rows', activity_count,  'size_bytes', pg_total_relation_size('public.activity_log')),
      json_build_object('name', 'app_users',      'rows', users_count,     'size_bytes', pg_total_relation_size('public.app_users')),
      json_build_object('name', 'app_settings',   'rows', settings_count,  'size_bytes', pg_total_relation_size('public.app_settings'))
    ),
    'storage_size_bytes', COALESCE((
      SELECT SUM(COALESCE((metadata->>'size')::bigint, 0))
      FROM storage.objects
      WHERE bucket_id = 'offering-images'
        AND name NOT LIKE '%/.emptyFolderPlaceholder'
    ), 0),
    'storage_count', COALESCE((
      SELECT COUNT(*)
      FROM storage.objects
      WHERE bucket_id = 'offering-images'
        AND name NOT LIKE '%/.emptyFolderPlaceholder'
    ), 0),
    'auth_user_count', COALESCE((
      SELECT COUNT(*) FROM auth.users
    ), 0)
  ) INTO result;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_db_stats() TO authenticated;
