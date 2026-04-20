import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import type { AppUser } from '@/types/database'

interface AuthState {
  session: Session | null
  user: User | null
  appUser: AppUser | null | undefined  // undefined = loading, null = denied
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Listen for auth changes (catches OAuth redirects, session restore, token refresh).
    // IMPORTANT: onAuthStateChange fires inside Supabase's internal lock.
    // We must NOT call any Supabase methods (getSession, from().select, etc.) inside
    // this callback — it will deadlock. Use setTimeout(0) to defer to next microtask.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, s) => {
        console.log('[Auth] state change:', event, s?.user?.email)
        setSession(s)
        if (s?.user?.email) {
          setTimeout(() => loadAppUser(s.user.email!, s), 0)
        } else {
          setAppUser(undefined)
          setLoading(false)
        }
      }
    )

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession:', s?.user?.email || 'no session')
      if (s?.user?.email) {
        setSession(s)
        loadAppUser(s.user.email, s)
      } else {
        setLoading(false)
      }
    })

    // Production Electron: listen for OAuth code forwarded from renderer-server via IPC
    // (system browser hits localhost:48600/auth/callback → webContents.send → ipcRenderer.on)
    // Dev Electron uses window.location.href navigation so AuthCallbackPage handles it directly.
    if (isElectron && !import.meta.env.DEV) {
      const api = getElectronAPI()
      const removeListener = api?.auth.onCallback(async (code) => {
        console.log('[Auth] Received OAuth code via IPC, exchanging...')
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('[Auth] Code exchange failed:', error.message)
        }
      })
      return () => {
        subscription.unsubscribe()
        removeListener?.()
      }
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function loadAppUser(email: string, currentSession: Session) {
    try {
      console.log('[Auth] loadAppUser:', email)

      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        console.error('[Auth] query app_user error:', error)
        setAppUser(null)
        return
      }

      if (!data) {
        // User not found — check if bootstrap admin should be auto-created
        let bootstrapAdmin = import.meta.env.VITE_BOOTSTRAP_ADMIN || 'jerome.purushotham@gmail.com'
        if (isElectron) {
          try {
            const config = await getElectronAPI()?.config.get()
            if (config?.bootstrapAdmin) bootstrapAdmin = config.bootstrapAdmin
          } catch { /* use fallback */ }
        }

        const { count } = await supabase
          .from('app_users')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin')

        if ((count ?? 0) === 0 && email === bootstrapAdmin) {
          const user = currentSession.user
          const { data: newUser, error: insertError } = await supabase
            .from('app_users')
            .insert({
              auth_id: user.id,
              email,
              name: user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0],
              picture: user.user_metadata?.avatar_url || null,
              role: 'admin',
              is_active: true,
              last_login: new Date().toISOString(),
            })
            .select()
            .single()

          if (insertError) {
            console.error('[Auth] bootstrap admin insert failed:', insertError)
            setAppUser(null)
          } else {
            setAppUser(newUser)
          }
        } else {
          console.log('[Auth] User not authorized:', email)
          setAppUser(null)
        }
        return
      }

      // User found
      if (!data.is_active) {
        console.log('[Auth] User deactivated:', email)
        setAppUser(null)
        return
      }

      console.log('[Auth] User authorized:', data.email, data.role)
      setAppUser(data)

      // Update last_login in background
      const updates: Record<string, unknown> = {
        auth_id: data.auth_id || currentSession.user.id,
        name: data.name || currentSession.user.user_metadata?.full_name || currentSession.user.user_metadata?.name || email.split('@')[0],
        picture: currentSession.user.user_metadata?.avatar_url || data.picture || null,
        last_login: new Date().toISOString(),
      }
      if (data.invite_status === 'pending') {
        updates.invite_status = 'accepted'
      }
      supabase.from('app_users').update(updates).eq('email', email).then(() => {})
    } catch (err) {
      console.error('[Auth] loadAppUser error:', err)
      setAppUser(null)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    const callbackPath = '/auth/callback'

    if (isElectron) {
      if (import.meta.env.DEV) {
        // Dev: navigate the BrowserWindow directly through OAuth.
        // The callback returns to localhost:5173/auth/callback (Vite), where
        // AuthCallbackPage exchanges the code. localStorage is preserved across
        // the navigation so the PKCE verifier is always found.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            skipBrowserRedirect: true,
            redirectTo: window.location.origin + callbackPath,
          },
        })
        if (error) throw error
        if (data.url) window.location.href = data.url
      } else {
        // Production: system browser + renderer-server at port 48600.
        // PKCE verifier stored in Electron's localStorage; renderer-server
        // intercepts the callback and forwards the code via IPC.
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            skipBrowserRedirect: true,
            redirectTo: 'http://localhost:48600' + callbackPath,
          },
        })
        if (error) throw error
        if (data.url) {
          const api = getElectronAPI()
          await api?.app.openExternal(data.url)
        }
      }
    } else {
      // Browser: standard redirect flow (stays in same window)
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + import.meta.env.BASE_URL + 'auth/callback',
        },
      })
      if (error) throw error
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setAppUser(undefined)
    setSession(null)
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        appUser,
        loading,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
