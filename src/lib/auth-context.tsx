import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppUser } from '@/types/database'

interface AuthState {
  session: Session | null
  user: User | null
  appUser: AppUser | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    // Safety timeout — if auth takes more than 5 seconds, stop loading
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 5000)

    // Listen for auth changes FIRST (catches OAuth redirects)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        console.log('[Auth] state change:', event, s?.user?.email)
        setSession(s)
        if (s?.user?.email) {
          await loadAppUser(s.user.email, s)
        } else {
          setAppUser(null)
          setLoading(false)
        }
      }
    )

    // Then check for existing session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      console.log('[Auth] getSession:', s?.user?.email || 'no session')
      if (s?.user?.email) {
        setSession(s)
        loadAppUser(s.user.email, s)
      } else {
        // No session — show login
        setLoading(false)
      }
    })

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  async function loadAppUser(email: string, currentSession: Session) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .single()

      if (error && error.code === 'PGRST116') {
        // User not found in app_users table
        // Check if this is the very first user (auto-promote to admin)
        const { count } = await supabase
          .from('app_users')
          .select('*', { count: 'exact', head: true })

        if (count === 0) {
          // First user ever — create as admin
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
            console.error('[Auth] insert first admin failed:', insertError)
          } else {
            setAppUser(newUser)
          }
        } else {
          // Not the first user and not pre-added by admin — access denied
          console.log('[Auth] User not in app_users:', email)
          setAppUser(null) // null = not authorized (App.tsx shows Access Denied)
        }
      } else if (error) {
        console.error('[Auth] query app_user failed:', error)
        setAppUser(null)
      } else if (data) {
        // Check if account is active
        if (!data.is_active) {
          console.log('[Auth] User deactivated:', email)
          setAppUser(null) // null = not authorized
          return
        }
        setAppUser(data)
        // Update last_login in background
        supabase
          .from('app_users')
          .update({
            auth_id: data.auth_id || currentSession.user.id,
            last_login: new Date().toISOString(),
          })
          .eq('email', email)
          .then(() => {})
      }
    } catch (err) {
      console.error('[Auth] loadAppUser error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setAppUser(null)
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
