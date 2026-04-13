import { useAuth } from '@/lib/auth-context'

export function DashboardPage() {
  const { appUser } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted mt-1">
          Welcome back, {appUser?.name || 'User'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted">Pending Review</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted">Approved This Month</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted">Total Offerings</p>
          <p className="text-3xl font-bold mt-1">0</p>
        </div>
      </div>
    </div>
  )
}
