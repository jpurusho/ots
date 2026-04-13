import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/supabase'

type AppUser = Database['public']['Tables']['app_users']['Row']

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

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        loadAppUser(session.user.email!)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        if (session?.user) {
          await loadAppUser(session.user.email!)
        } else {
          setAppUser(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadAppUser(email: string) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .single()

      if (error && error.code === 'PGRST116') {
        // User not found — check if this is the first user (auto-promote to admin)
        const { count } = await supabase
          .from('app_users')
          .select('*', { count: 'exact', head: true })

        const role = count === 0 ? 'admin' : 'operator'
        const { data: newUser } = await supabase
          .from('app_users')
          .insert({
            auth_id: session?.user?.id ?? null,
            email,
            name: session?.user?.user_metadata?.full_name ?? email.split('@')[0],
            picture: session?.user?.user_metadata?.avatar_url ?? null,
            role,
            is_active: true,
          })
          .select()
          .single()

        setAppUser(newUser)
      } else if (data) {
        // Update auth_id and last_login if needed
        if (!data.auth_id && session?.user?.id) {
          await supabase
            .from('app_users')
            .update({ auth_id: session.user.id, last_login: new Date().toISOString() })
            .eq('email', email)
        }
        setAppUser(data)
      }
    } catch {
      // App users table may not exist yet during initial setup
      setAppUser(null)
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
