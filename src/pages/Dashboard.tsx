import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Upload, ClipboardCheck, DollarSign, Calendar } from 'lucide-react'

export function DashboardPage() {
  const { appUser } = useAuth()

  // Pending count
  const { data: pendingCount } = useQuery({
    queryKey: ['offerings', 'pending-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('offerings')
        .select('*', { count: 'exact', head: true })
        .in('status', ['uploaded', 'scanned', 'pending'])
      if (error) throw error
      return count || 0
    },
  })

  // Approved this month
  const { data: approvedThisMonth } = useQuery({
    queryKey: ['offerings', 'approved-month'],
    queryFn: async () => {
      const now = new Date()
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { count, error } = await supabase
        .from('offerings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
        .gte('locked_at', firstOfMonth)
      if (error) throw error
      return count || 0
    },
  })

  // Total offerings (all time, approved)
  const { data: totalOfferings } = useQuery({
    queryKey: ['offerings', 'total'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('offerings')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'approved')
      if (error) throw error
      return count || 0
    },
  })

  // Total amount this month
  const { data: monthTotal } = useQuery({
    queryKey: ['offerings', 'month-total'],
    queryFn: async () => {
      const now = new Date()
      const firstOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data, error } = await supabase
        .from('offerings')
        .select('general, cash, sunday_school, building_fund, misc')
        .eq('status', 'approved')
        .gte('locked_at', firstOfMonth)
      if (error) throw error
      return (data || []).reduce((sum, o) =>
        sum + (o.general || 0) + (o.cash || 0) + (o.sunday_school || 0) + (o.building_fund || 0) + (o.misc || 0),
        0
      )
    },
  })

  // Recent activity
  const { data: recentActivity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity', 'recent'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5)
      if (error) throw error
      return data || []
    },
  })

  const stats = [
    { label: 'Pending Review', value: pendingCount ?? '—', icon: Upload, color: 'text-warning', href: '/review' },
    { label: 'Approved This Month', value: approvedThisMonth ?? '—', icon: ClipboardCheck, color: 'text-success', href: '/review' },
    { label: 'Month Total', value: monthTotal != null ? `$${monthTotal.toFixed(2)}` : '—', icon: DollarSign, color: 'text-primary', href: '/reports' },
    { label: 'Total Offerings', value: totalOfferings ?? '—', icon: Calendar, color: 'text-muted', href: '/reports' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted mt-1">Welcome back, {appUser?.name || 'User'}</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <a key={stat.label} href={stat.href}
            className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors block">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-muted">{stat.label}</p>
              <stat.icon className={`w-5 h-5 ${stat.color}`} />
            </div>
            <p className="text-3xl font-bold">{stat.value}</p>
          </a>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/offerings"
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Upload className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-medium">Upload Offerings</p>
            <p className="text-sm text-muted">Add new offering slip images</p>
          </div>
        </a>
        <a href="/review"
          className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-success" />
          </div>
          <div>
            <p className="font-medium">Review & Approve</p>
            <p className="text-sm text-muted">{pendingCount || 0} offerings waiting</p>
          </div>
        </a>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="text-sm font-medium">Recent Activity</h3>
        </div>
        <div className="divide-y divide-border">
          {activityLoading ? (
            <div className="p-4 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted" />
            </div>
          ) : recentActivity && recentActivity.length > 0 ? (
            recentActivity.map((entry) => (
              <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm">{entry.details || entry.action}</p>
                  <p className="text-xs text-muted">{entry.user_email}</p>
                </div>
                <p className="text-xs text-muted">
                  {entry.created_at ? new Date(entry.created_at).toLocaleDateString() : ''}
                </p>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-sm text-muted">
              No activity yet. Upload your first offering to get started.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
