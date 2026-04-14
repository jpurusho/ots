import { Navigate } from 'react-router-dom'
import { useAuth } from '@/lib/auth-context'

/**
 * Wraps admin-only routes. Redirects operators to dashboard.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { appUser } = useAuth()

  if (appUser?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
