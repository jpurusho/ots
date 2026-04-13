import { supabase } from '@/lib/supabase'

/**
 * Log an activity to the activity_log table.
 * Fire-and-forget — errors are silently ignored.
 */
export function logActivity(
  userEmail: string | null,
  action: string,
  details?: string,
  resourceType?: string,
  resourceId?: string | number
) {
  supabase
    .from('activity_log')
    .insert({
      user_email: userEmail,
      action,
      details: details || null,
      resource_type: resourceType || null,
      resource_id: resourceId != null ? String(resourceId) : null,
    })
    .then(() => {})
}
