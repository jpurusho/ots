import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let _client: SupabaseClient | null = null

/**
 * Initialize or reinitialize the Supabase client.
 * Called from App.tsx after config is loaded (Electron) or immediately (browser).
 */
export function initSupabase(url: string, anonKey: string): SupabaseClient {
  _client = createClient(url, anonKey, {
    auth: { storageKey: 'ots-auth' },
  })
  return _client
}

/**
 * Reinitialize with new credentials (e.g., switching test/prod).
 * Signs out first to clear the old session.
 */
export async function reinitSupabase(url: string, anonKey: string): Promise<SupabaseClient> {
  if (_client) {
    try { await _client.auth.signOut() } catch { /* ignore */ }
  }
  return initSupabase(url, anonKey)
}

/**
 * Proxy-based Supabase export.
 * - In browser: auto-initializes from env vars on first access
 * - In Electron: must call initSupabase() first (from App.tsx after config load)
 *
 * This Proxy ensures all 15+ files that do `import { supabase } from '@/lib/supabase'`
 * work without any changes — the proxy delegates to the real client.
 */
function ensureClient(): SupabaseClient {
  if (!_client) {
    // Auto-init for browser mode (env vars)
    const url = import.meta.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    if (url && key) {
      _client = createClient(url, key, { auth: { storageKey: 'ots-auth' } })
    } else {
      throw new Error('Supabase not initialized. Call initSupabase() or set VITE_SUPABASE_URL.')
    }
  }
  return _client
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (ensureClient() as any)[prop]
  },
})
