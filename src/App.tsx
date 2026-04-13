import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import { Layout } from '@/components/Layout'
import { LoginPage } from '@/pages/Login'
import { DashboardPage } from '@/pages/Dashboard'
import { OfferingsPage } from '@/pages/Offerings'
import { ReviewPage } from '@/pages/Review'
import { ReportsPage } from '@/pages/Reports'
import { ManualEntryPage } from '@/pages/ManualEntry'
import { SettingsPage } from '@/pages/Settings'
import { UsersPage } from '@/pages/Users'
import { ActivityPage } from '@/pages/Activity'
import { ChecksPage } from '@/pages/Checks'
import { Loader2 } from 'lucide-react'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
})

function AuthGate() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!session) {
    return <LoginPage />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="offerings" element={<OfferingsPage />} />
        <Route path="manual-entry" element={<ManualEntryPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="checks" element={<ChecksPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="activity" element={<ActivityPage />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthGate />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
