import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { UploadProvider } from '@/lib/upload-manager'
import { Layout } from '@/components/Layout'
import { AdminGuard } from '@/components/AdminGuard'
import { LoginPage } from '@/pages/Login'
import { SetupPage } from '@/pages/Setup'
import { DashboardPage } from '@/pages/Dashboard'
import { OfferingsPage } from '@/pages/Offerings'
import { ReviewPage } from '@/pages/Review'
import { ReportsPage } from '@/pages/Reports'
import { ManualEntryPage } from '@/pages/ManualEntry'
import { SettingsPage } from '@/pages/Settings'
import { UsersPage } from '@/pages/Users'
import { ActivityPage } from '@/pages/Activity'
import { ChecksPage } from '@/pages/Checks'
import { InvitePage } from '@/pages/Invite'
import { AuthCallbackPage } from '@/pages/AuthCallback'
import { AboutPage } from '@/pages/About'
import { Loader2, ShieldX } from 'lucide-react'
import { isElectron, getElectronAPI } from '@/lib/electron-compat'
import { supabase, initSupabase } from '@/lib/supabase'
import { EnvProvider } from '@/lib/env-context'
import { ThemeProvider } from '@/lib/theme-context'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function AuthGate() {
  const { session, appUser, loading } = useAuth()

  // Still initializing or loading user profile
  if (loading || (session && appUser === undefined)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  // User signed in but not authorized (not in app_users or deactivated)
  if (appUser === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm mx-auto p-8">
          <ShieldX className="w-12 h-12 mx-auto text-destructive mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted text-sm">
            Your account ({session.user.email}) is not authorized to use this system.
            Contact your administrator to request access.
          </p>
          <button onClick={() => { supabase.auth.signOut().then(() => window.location.reload()) }}
            className="mt-4 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return (
    <UploadProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="offerings" element={<OfferingsPage />} />
          <Route path="manual-entry" element={<ManualEntryPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="checks" element={<ChecksPage />} />
          <Route path="about" element={<AboutPage />} />
          {/* Admin-only routes */}
          <Route path="settings" element={<AdminGuard><SettingsPage /></AdminGuard>} />
          <Route path="users" element={<AdminGuard><UsersPage /></AdminGuard>} />
          <Route path="activity" element={<AdminGuard><ActivityPage /></AdminGuard>} />
        </Route>
      </Routes>
    </UploadProvider>
  )
}

/**
 * App wrapper that handles Electron config initialization.
 * In Electron: loads config from IPC, initializes Supabase, then renders.
 * In browser: Supabase auto-initializes from env vars (via Proxy).
 */
export default function App() {
  const [configReady, setConfigReady] = useState(!isElectron) // Browser is ready immediately
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    if (!isElectron) return // Browser mode — Supabase Proxy handles init

    const api = getElectronAPI()
    if (!api) return

    api.config.hasConfig().then(async (has) => {
      if (!has) {
        setNeedsSetup(true)
        return
      }

      // Load config and initialize Supabase
      const config = await api.config.getActiveSupabase()
      if (config) {
        initSupabase(config.url, config.anonKey)
      }
      setConfigReady(true)
    })
  }, [])

  const handleSetupComplete = async () => {
    const api = getElectronAPI()
    if (api) {
      const config = await api.config.getActiveSupabase()
      if (config) {
        initSupabase(config.url, config.anonKey)
      }
      // Restart backend with the new credentials (it started without them)
      try { await api.backend.restart() } catch { /* may not be running yet */ }
    }
    setNeedsSetup(false)
    setConfigReady(true)
  }

  // QueryClientProvider must wrap ThemeProvider (theme reads from DB via useQuery)
  // ThemeProvider must wrap everything (CSS vars needed for all UI)
  if (needsSetup) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SetupPage onComplete={handleSetupComplete} />
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  if (!configReady) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <div className="min-h-screen flex items-center justify-center bg-background">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        </ThemeProvider>
      </QueryClientProvider>
    )
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <EnvProvider>
          <AuthProvider>
            <BrowserRouter basename={isElectron ? '/' : import.meta.env.BASE_URL}>
              <Routes>
                <Route path="invite" element={<InvitePage />} />
                <Route path="auth/callback" element={<AuthCallbackPage />} />
                <Route path="*" element={<AuthGate />} />
              </Routes>
            </BrowserRouter>
          </AuthProvider>
        </EnvProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
