import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Receipt } from 'lucide-react'

interface Check {
  id: number
  offering_id: number
  check_number: string | null
  payer_name: string | null
  bank_name: string | null
  account_number_last4: string | null
  memo: string | null
  amount: number | null
  category: string | null
  created_at: string
}

interface OfferingWithChecks {
  id: number
  offering_date: string | null
  filename: string | null
  offering_checks: Check[]
}

export function ChecksPage() {
  const { data: offerings, isLoading } = useQuery({
    queryKey: ['offerings-with-checks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, offering_date, filename, offering_checks(*)')
        .eq('status', 'approved')
        .order('offering_date', { ascending: false })
      if (error) throw error
      // Filter to only offerings that have checks
      return (data as OfferingWithChecks[]).filter(o => o.offering_checks && o.offering_checks.length > 0)
    },
  })

  // Flatten all checks for summary
  const allChecks = (offerings || []).flatMap(o =>
    (o.offering_checks || []).map(c => ({ ...c, offering_date: o.offering_date }))
  )

  // Group by payer
  const payerMap = new Map<string, { total: number; count: number; checks: typeof allChecks }>()
  for (const c of allChecks) {
    const name = c.payer_name || 'Unknown'
    const existing = payerMap.get(name) || { total: 0, count: 0, checks: [] }
    existing.total += c.amount || 0
    existing.count += 1
    existing.checks.push(c)
    payerMap.set(name, existing)
  }
  const payers = [...payerMap.entries()].sort((a, b) => b[1].total - a[1].total)

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Checks</h1>
        <p className="text-muted text-sm">Bank check entries extracted from offering scans</p>
      </div>

      {allChecks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted">No check entries yet</p>
          <p className="text-xs text-muted mt-1">Check entries are automatically extracted when scanning offering images that contain bank checks</p>
        </div>
      ) : (
        <>
          {/* Summary by payer */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 bg-card border-b border-border">
              <h3 className="text-sm font-medium">By Contributor ({payers.length})</h3>
            </div>
            <div className="divide-y divide-border">
              {payers.map(([name, info]) => (
                <div key={name} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted">{info.count} check{info.count !== 1 ? 's' : ''}</p>
                  </div>
                  <p className="text-sm font-bold">${info.total.toFixed(2)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* All checks table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 bg-card border-b border-border">
              <h3 className="text-sm font-medium">All Checks ({allChecks.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Payer</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Check #</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Bank</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Memo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allChecks.map(c => (
                    <tr key={c.id} className="hover:bg-muted-foreground/5">
                      <td className="px-4 py-2">{c.offering_date || '—'}</td>
                      <td className="px-4 py-2 font-medium">{c.payer_name || '—'}</td>
                      <td className="px-4 py-2">{c.check_number || '—'}</td>
                      <td className="px-4 py-2">{c.bank_name || '—'}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted-foreground/10">{c.category || 'general'}</span>
                      </td>
                      <td className="px-4 py-2 text-muted">{c.memo || '—'}</td>
                      <td className="px-4 py-2 text-right font-bold">${(c.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
