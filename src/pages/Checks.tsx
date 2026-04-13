import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Loader2, Receipt, Users, DollarSign, Wallet } from 'lucide-react'

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

interface Contributor {
  payer_name: string
  total: number
  count: number
  categories: Record<string, number>
}

export function ChecksPage() {
  const [tab, setTab] = useState<'checks' | 'contributors' | 'statements'>('checks')
  const [statementsYear, setStatementsYear] = useState(new Date().getFullYear())

  // Fetch checks joined with offering date
  const { data: checks, isLoading } = useQuery({
    queryKey: ['offering-checks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offering_checks')
        .select('*, offerings!inner(offering_date, status)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((c: any) => ({
        ...c,
        offering_date: c.offerings?.offering_date || null,
        offering_status: c.offerings?.status || null,
      })) as (Check & { offering_date: string | null; offering_status: string | null })[]
    },
  })

  const allChecks = checks || []
  const totalAmount = allChecks.reduce((s, c) => s + (c.amount || 0), 0)

  // Build contributor summary
  const contributorMap = new Map<string, Contributor>()
  for (const c of allChecks) {
    const name = c.payer_name || 'Unknown'
    const existing = contributorMap.get(name) || { payer_name: name, total: 0, count: 0, categories: {} }
    existing.total += c.amount || 0
    existing.count += 1
    const cat = c.category || 'general'
    existing.categories[cat] = (existing.categories[cat] || 0) + (c.amount || 0)
    contributorMap.set(name, existing)
  }
  const contributors = [...contributorMap.values()].sort((a, b) => b.total - a.total)

  // Year-end statements
  const yearChecks = allChecks.filter(c => {
    const d = c.offering_date
    if (!d) return false
    const yearMatch = d.match(/(\d{4})/)
    return yearMatch && parseInt(yearMatch[1]) === statementsYear
  })
  const yearContributorMap = new Map<string, { payer_name: string; total: number; count: number; firstDate: string; lastDate: string }>()
  for (const c of yearChecks) {
    const name = c.payer_name || 'Unknown'
    const existing = yearContributorMap.get(name) || { payer_name: name, total: 0, count: 0, firstDate: c.offering_date || '', lastDate: c.offering_date || '' }
    existing.total += c.amount || 0
    existing.count += 1
    if (c.offering_date && c.offering_date < existing.firstDate) existing.firstDate = c.offering_date
    if (c.offering_date && c.offering_date > existing.lastDate) existing.lastDate = c.offering_date
    yearContributorMap.set(name, existing)
  }
  const yearStatements = [...yearContributorMap.values()].sort((a, b) => b.total - a.total)

  const fmt = (n: number) => `$${n.toFixed(2)}`

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Check Contributions</h1>
        <p className="text-muted text-sm">Track individual check contributions and generate year-end statements</p>
      </div>

      {allChecks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted font-medium">No check contributions yet</p>
          <p className="text-xs text-muted mt-2 max-w-md mx-auto">
            Check contributions are recorded when you scan bank check images.
            Upload photos of individual checks in the Offerings page — the AI will extract
            payer name, check number, amount, and memo automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1">
                <Wallet className="w-4 h-4" /> Total Checks
              </div>
              <p className="text-xl font-bold">{allChecks.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1">
                <DollarSign className="w-4 h-4" /> Total Amount
              </div>
              <p className="text-xl font-bold text-primary">{fmt(totalAmount)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1">
                <Users className="w-4 h-4" /> Contributors
              </div>
              <p className="text-xl font-bold">{contributors.length}</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(['checks', 'contributors', 'statements'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer capitalize ${
                  tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'
                }`}>
                {t === 'statements' ? 'Year-End' : t === 'checks' ? 'All Checks' : 'Contributors'}
              </button>
            ))}
          </div>

          {tab === 'checks' && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Payer</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Check #</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Category</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-muted">Memo</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-muted">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allChecks.map(c => (
                    <tr key={c.id} className="hover:bg-muted-foreground/5">
                      <td className="px-4 py-2 font-medium">{c.payer_name || 'Unknown'}</td>
                      <td className="px-4 py-2 text-muted">{c.check_number || '—'}</td>
                      <td className="px-4 py-2 text-xs">{c.offering_date || '—'}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted-foreground/10 capitalize">
                          {(c.category || 'general').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">{c.memo || '—'}</td>
                      <td className="px-4 py-2 text-right font-bold">{fmt(c.amount || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'contributors' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contributors.map(c => (
                <div key={c.payer_name} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{c.payer_name}</p>
                      <p className="text-xs text-muted">{c.count} check{c.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-bold">{fmt(c.total)}</p>
                  </div>
                  <div className="flex gap-3 mt-2">
                    {Object.entries(c.categories).map(([cat, amount]) => (
                      <span key={cat} className="text-xs text-muted capitalize">
                        {cat.replace('_', ' ')}: {fmt(amount)}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'statements' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <select value={statementsYear} onChange={e => setStatementsYear(Number(e.target.value))}
                  className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background">
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-sm text-muted">{yearStatements.length} contributors</span>
              </div>
              {yearStatements.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted">No check contributions for {statementsYear}</div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-card border-b border-border">
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted">Contributor</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-muted">Checks</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-muted">Period</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-muted">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {yearStatements.map(s => (
                        <tr key={s.payer_name} className="hover:bg-muted-foreground/5">
                          <td className="px-4 py-2 font-medium">{s.payer_name}</td>
                          <td className="px-4 py-2 text-center text-muted">{s.count}</td>
                          <td className="px-4 py-2 text-xs text-muted">{s.firstDate} — {s.lastDate}</td>
                          <td className="px-4 py-2 text-right font-bold">{fmt(s.total)}</td>
                        </tr>
                      ))}
                      <tr className="bg-card border-t-2 border-border font-bold">
                        <td className="px-4 py-2">Total</td>
                        <td className="px-4 py-2 text-center">{yearStatements.reduce((s, r) => s + r.count, 0)}</td>
                        <td />
                        <td className="px-4 py-2 text-right text-primary">
                          {fmt(yearStatements.reduce((s, r) => s + r.total, 0))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
