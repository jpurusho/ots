import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Activity as ActivityIcon, Trash2 } from 'lucide-react'
import { SortableTable, type Column } from '@/components/SortableTable'

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
  rescan: 'bg-purple-500/10 text-purple-500',
  approve: 'bg-success/10 text-success',
  discard: 'bg-destructive/10 text-destructive',
  edit: 'bg-warning/10 text-warning',
  login: 'bg-primary/10 text-primary',
  manual_entry: 'bg-blue-500/10 text-blue-500',
  settings: 'bg-muted-foreground/10 text-muted',
}

export function ActivityPage() {
  const queryClient = useQueryClient()
  const [purgeFrom, setPurgeFrom] = useState('')
  const [purgeTo, setPurgeTo] = useState('')
  const [showPurge, setShowPurge] = useState(false)

  const { data: entries, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return data as ActivityEntry[]
    },
  })

  const purgeMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      let query = supabase.from('activity_log').delete()
      if (from) query = query.gte('created_at', from)
      if (to) query = query.lte('created_at', `${to}T23:59:59`)
      if (!from && !to) {
        // Delete all
        query = query.gte('id', 0)
      }
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity'] })
      setShowPurge(false)
      setPurgeFrom('')
      setPurgeTo('')
    },
  })

  const columns: Column<ActivityEntry>[] = [
    {
      key: 'action',
      label: 'Action',
      sortValue: (r) => r.action || '',
      render: (r) => (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          ACTION_COLORS[r.action || ''] || 'bg-muted-foreground/10 text-muted'
        }`}>
          {r.action || 'unknown'}
        </span>
      ),
    },
    {
      key: 'details',
      label: 'Details',
      sortValue: (r) => r.details || '',
      render: (r) => <span className="text-sm">{r.details || '—'}</span>,
    },
    {
      key: 'user_email',
      label: 'User',
      sortValue: (r) => r.user_email || '',
      render: (r) => <span className="text-xs text-muted">{r.user_email || 'system'}</span>,
    },
    {
      key: 'resource_type',
      label: 'Resource',
      sortValue: (r) => r.resource_type || '',
      render: (r) => r.resource_type ? (
        <span className="text-xs text-muted">{r.resource_type}{r.resource_id ? ` #${r.resource_id}` : ''}</span>
      ) : <span className="text-muted">—</span>,
    },
    {
      key: 'created_at',
      label: 'Time',
      align: 'right',
      sortValue: (r) => r.created_at || '',
      render: (r) => (
        <span className="text-xs text-muted whitespace-nowrap">
          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
        </span>
      ),
    },
  ]

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
        <button onClick={() => setShowPurge(!showPurge)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs hover:bg-destructive/10 cursor-pointer">
          <Trash2 className="w-3.5 h-3.5" /> Purge
        </button>
      </div>

      {/* Purge panel */}
      {showPurge && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive mb-3">Delete Activity Logs</p>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-muted">From</label>
              <input type="date" value={purgeFrom} onChange={e => setPurgeFrom(e.target.value)}
                className="block mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted">To</label>
              <input type="date" value={purgeTo} onChange={e => setPurgeTo(e.target.value)}
                className="block mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
            <button
              onClick={() => {
                const msg = purgeFrom || purgeTo
                  ? `Delete activity logs${purgeFrom ? ` from ${purgeFrom}` : ''}${purgeTo ? ` to ${purgeTo}` : ''}?`
                  : 'Delete ALL activity logs?'
                if (confirm(msg)) {
                  purgeMutation.mutate({ from: purgeFrom, to: purgeTo })
                }
              }}
              disabled={purgeMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 cursor-pointer disabled:opacity-50">
              {purgeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {purgeFrom || purgeTo ? 'Delete Range' : 'Delete All'}
            </button>
            <button onClick={() => setShowPurge(false)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
              Cancel
            </button>
          </div>
          {purgeMutation.error && (
            <p className="text-xs text-destructive mt-2">{(purgeMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {entries && entries.length > 0 ? (
        <SortableTable
          data={entries}
          columns={columns}
          keyFn={r => r.id}
          defaultSortKey="created_at"
          defaultSortDir="desc"
          searchPlaceholder="Filter by action, details, user..."
          searchFn={(r, q) =>
            (r.action || '').toLowerCase().includes(q) ||
            (r.details || '').toLowerCase().includes(q) ||
            (r.user_email || '').toLowerCase().includes(q) ||
            (r.resource_type || '').toLowerCase().includes(q)
          }
          emptyMessage="No activity recorded yet"
        />
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <ActivityIcon className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted">No activity recorded yet</p>
        </div>
      )}
    </div>
  )
}
