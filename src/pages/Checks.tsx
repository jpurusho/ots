import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Receipt } from 'lucide-react'

interface CheckEntry {
  offering_id: number
  offering_date: string | null
  filename: string | null
  category: string
  amount: number
  count: number
  total: number
}

interface ScanSection {
  items?: Array<{ amount: number; count: number }>
  total?: number
}

const CATEGORY_LABELS: Record<string, string> = {
  general_checks: 'General',
  building_fund_checks: 'Building Fund',
  other_checks: 'Miscellaneous',
}

export function ChecksPage() {
  const { data: checkEntries, isLoading } = useQuery({
    queryKey: ['checks-from-scan-data'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, offering_date, filename, scan_data')
        .eq('status', 'approved')
        .order('offering_date', { ascending: false })
      if (error) throw error

      const entries: CheckEntry[] = []
      for (const offering of (data || [])) {
        let sd = offering.scan_data
        if (!sd) continue
        if (typeof sd === 'string') {
          try { sd = JSON.parse(sd) } catch { continue }
        }
        const sections = (sd as Record<string, unknown>)?.sections as Record<string, ScanSection> | undefined
        if (!sections) continue

        for (const [sectionKey, section] of Object.entries(sections)) {
          if (!sectionKey.includes('checks') || !section.items) continue
          for (const item of section.items) {
            if (!item.amount || item.amount <= 0) continue
            entries.push({
              offering_id: offering.id,
              offering_date: offering.offering_date,
              filename: offering.filename,
              category: CATEGORY_LABELS[sectionKey] || sectionKey,
              amount: item.amount,
              count: item.count || 1,
              total: (item.amount || 0) * (item.count || 1),
            })
          }
        }
      }
      return entries
    },
  })

  const allChecks = checkEntries || []

  // Summary by category
  const categoryTotals = new Map<string, number>()
  for (const c of allChecks) {
    categoryTotals.set(c.category, (categoryTotals.get(c.category) || 0) + c.total)
  }

  // Summary by date
  const dateTotals = new Map<string, { count: number; total: number }>()
  for (const c of allChecks) {
    const date = c.offering_date || 'Unknown'
    const existing = dateTotals.get(date) || { count: 0, total: 0 }
    existing.count += 1
    existing.total += c.total
    dateTotals.set(date, existing)
  }

  const grandTotal = allChecks.reduce((sum, c) => sum + c.total, 0)

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Checks</h1>
        <p className="text-muted text-sm">Check entries extracted from offering scans</p>
      </div>

      {allChecks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted">No check entries yet</p>
          <p className="text-xs text-muted mt-1">Check entries are extracted when scanning offering images</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted uppercase tracking-wider">Total Checks</p>
              <p className="text-lg font-bold">{allChecks.length}</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted uppercase tracking-wider">Grand Total</p>
              <p className="text-lg font-bold text-primary">${grandTotal.toFixed(2)}</p>
            </div>
            {[...categoryTotals.entries()].map(([cat, total]) => (
              <div key={cat} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-[10px] text-muted uppercase tracking-wider">{cat}</p>
                <p className="text-lg font-bold">${total.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* By date */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 bg-card border-b border-border">
              <h3 className="text-sm font-medium">By Week ({dateTotals.size} weeks)</h3>
            </div>
            <div className="divide-y divide-border">
              {[...dateTotals.entries()].map(([date, info]) => (
                <div key={date} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{date}</p>
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
              <h3 className="text-sm font-medium">All Check Entries ({allChecks.length})</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Source</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Category</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted">Amount</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted">Count</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allChecks.map((c, i) => (
                    <tr key={i} className="hover:bg-muted-foreground/5">
                      <td className="px-4 py-2">{c.offering_date || '—'}</td>
                      <td className="px-4 py-2 text-muted text-xs">{c.filename || '—'}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted-foreground/10">{c.category}</span>
                      </td>
                      <td className="px-4 py-2 text-right">${c.amount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{c.count}</td>
                      <td className="px-4 py-2 text-right font-bold">${c.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-card border-t-2 border-border font-bold">
                    <td colSpan={5} className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right text-primary">${grandTotal.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
