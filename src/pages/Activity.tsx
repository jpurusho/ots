import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Activity as ActivityIcon, Filter } from 'lucide-react'

interface ActivityEntry {
  id: number
  user_email: string | null
  action: string | null
  resource_type: string | null
  resource_id: string | null
  details: string | null
  created_at: string | null
}

const ACTION_COLORS: Record<string, string> = {
  upload: 'bg-blue-500/10 text-blue-500',
  scan: 'bg-purple-500/10 text-purple-500',
  approve: 'bg-success/10 text-success',
  discard: 'bg-destructive/10 text-destructive',
  edit: 'bg-warning/10 text-warning',
  login: 'bg-primary/10 text-primary',
  settings: 'bg-muted-foreground/10 text-muted',
}

export function ActivityPage() {
  const [actionFilter, setActionFilter] = useState<string>('')
  const [limit, setLimit] = useState(50)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['activity', actionFilter, limit],
    queryFn: async () => {
      let query = supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (actionFilter) {
        query = query.eq('action', actionFilter)
      }

      const { data, error } = await query
      if (error) throw error
      return data as ActivityEntry[]
    },
  })

  // Get unique actions for filter dropdown
  const { data: actions } = useQuery({
    queryKey: ['activity-actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('action')
      if (error) throw error
      const unique = [...new Set((data || []).map(d => d.action).filter(Boolean))]
      return unique.sort() as string[]
    },
  })

  const formatTime = (d: string | null) => {
    if (!d) return '—'
    return new Date(d).toLocaleString()
  }

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Activity</h1>
          <p className="text-muted text-sm">System audit log</p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted" />
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background">
            <option value="">All actions</option>
            {actions?.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        {entries && entries.length > 0 ? (
          <>
            <div className="divide-y divide-border">
              {entries.map(entry => (
                <div key={entry.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="mt-0.5">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      ACTION_COLORS[entry.action || ''] || 'bg-muted-foreground/10 text-muted'
                    }`}>
                      {entry.action || 'unknown'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">{entry.details || '—'}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted">{entry.user_email || 'system'}</span>
                      {entry.resource_type && (
                        <span className="text-xs text-muted">{entry.resource_type} {entry.resource_id && `#${entry.resource_id}`}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted whitespace-nowrap">{formatTime(entry.created_at)}</span>
                </div>
              ))}
            </div>
            {entries.length >= limit && (
              <div className="px-4 py-3 border-t border-border text-center">
                <button onClick={() => setLimit(l => l + 50)}
                  className="text-sm text-primary hover:underline cursor-pointer">
                  Load more
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="p-10 text-center">
            <ActivityIcon className="w-10 h-10 mx-auto text-muted mb-3" />
            <p className="text-muted">No activity recorded yet</p>
          </div>
        )}
      </div>
    </div>
  )
}
