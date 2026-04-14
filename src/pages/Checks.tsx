import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'
import { useAuth } from '@/lib/auth-context'
import { Loader2, Receipt, Users, DollarSign, Wallet, Printer, ArrowLeft, FileText, Trash2, Search, CalendarRange } from 'lucide-react'
import { openReport } from '@/lib/print-utils'

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
  offering_date: string | null
  offering_status: string | null
}

interface Contributor {
  payer_name: string
  total: number
  count: number
  categories: Record<string, number>
  checks: Check[]
}

const fmt = (n: number) => `$${n.toFixed(2)}`

// Fetch church name for reports
function useChurchName() {
  const { data } = useQuery({
    queryKey: ['settings', 'church_name'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'church_name').single()
      return data?.value || 'Offering Report'
    },
  })
  return data || ''
}


export function ChecksPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const churchName = useChurchName()
  const [tab, setTab] = useState<'checks' | 'contributors' | 'statements'>('checks')

  const deleteCheckMutation = useMutation({
    mutationFn: async (check: Check) => {
      const { error } = await supabase.from('offering_checks').delete().eq('id', check.id)
      if (error) throw error
      logActivity(appUser?.email || null, 'delete_check',
        `Deleted check #${check.check_number || check.id} from ${check.payer_name || 'Unknown'}`, 'check', check.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offering-checks'] })
    },
  })
  const [statementsYear, setStatementsYear] = useState(new Date().getFullYear())
  const [selectedContributor, setSelectedContributor] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [filterText, setFilterText] = useState('')

  const parseDate = (d: string | null): Date | null => {
    if (!d) return null
    const slash = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (slash) return new Date(+slash[3], +slash[1] - 1, +slash[2])
    const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
    return null
  }

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
      })) as Check[]
    },
  })

  // Filter checks by date range and search
  const allChecks = useMemo(() => {
    let filtered = checks || []

    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom) : null
      const to = dateTo ? new Date(dateTo + 'T23:59:59') : null
      filtered = filtered.filter(c => {
        const d = parseDate(c.offering_date)
        if (!d) return false
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      })
    }

    if (filterText) {
      const q = filterText.toLowerCase()
      filtered = filtered.filter(c =>
        (c.payer_name || '').toLowerCase().includes(q) ||
        (c.check_number || '').toLowerCase().includes(q) ||
        (c.bank_name || '').toLowerCase().includes(q) ||
        (c.memo || '').toLowerCase().includes(q) ||
        (c.category || '').toLowerCase().includes(q) ||
        (c.offering_date || '').toLowerCase().includes(q)
      )
    }

    return filtered
  }, [checks, dateFrom, dateTo, filterText])

  const totalAmount = allChecks.reduce((s, c) => s + (c.amount || 0), 0)

  // YTD summary
  const currentYear = new Date().getFullYear()
  const ytdChecks = (checks || []).filter(c => {
    const d = parseDate(c.offering_date)
    return d && d.getFullYear() === currentYear
  })
  const ytdTotal = ytdChecks.reduce((s, c) => s + (c.amount || 0), 0)

  // Build contributors from filtered checks
  const contributorMap = new Map<string, Contributor>()
  for (const c of allChecks) {
    const name = c.payer_name || 'Unknown'
    const existing = contributorMap.get(name) || { payer_name: name, total: 0, count: 0, categories: {}, checks: [] }
    existing.total += c.amount || 0
    existing.count += 1
    const cat = c.category || 'general'
    existing.categories[cat] = (existing.categories[cat] || 0) + (c.amount || 0)
    existing.checks.push(c)
    contributorMap.set(name, existing)
  }
  const contributors = [...contributorMap.values()].sort((a, b) => b.total - a.total)

  // Year-end
  const yearChecks = (checks || []).filter(c => {
    const d = c.offering_date
    if (!d) return false
    const m = d.match(/(\d{4})/)
    return m && parseInt(m[1]) === statementsYear
  })
  const yearMap = new Map<string, { payer_name: string; total: number; count: number; firstDate: string; lastDate: string }>()
  for (const c of yearChecks) {
    const name = c.payer_name || 'Unknown'
    const existing = yearMap.get(name) || { payer_name: name, total: 0, count: 0, firstDate: c.offering_date || '', lastDate: c.offering_date || '' }
    existing.total += c.amount || 0
    existing.count += 1
    if (c.offering_date && c.offering_date < existing.firstDate) existing.firstDate = c.offering_date
    if (c.offering_date && c.offering_date > existing.lastDate) existing.lastDate = c.offering_date
    yearMap.set(name, existing)
  }
  const yearStatements = [...yearMap.values()].sort((a, b) => b.total - a.total)

  // Selected contributor detail
  const selectedContrib = selectedContributor ? contributorMap.get(selectedContributor) : null

  const printContributorStatement = (contrib: Contributor) => {
    const rows = contrib.checks.map(c =>
      `<tr><td>${c.offering_date || '—'}</td><td>${c.check_number || '—'}</td>
       <td>${c.bank_name || '—'}</td><td class="capitalize">${(c.category || 'general').replace('_', ' ')}</td>
       <td>${c.memo || '—'}</td><td class="right">${fmt(c.amount || 0)}</td></tr>`
    ).join('')
    openReport(
      churchName,
      `Contribution Statement — ${contrib.payer_name}`,
      `<table><thead><tr><th>Date</th><th>Check #</th><th>Bank</th><th>Category</th><th>Memo</th><th class="right">Amount</th></tr></thead>
       <tbody>${rows}</tbody>
       <tfoot><tr><td colspan="5"><strong>Total (${contrib.count} checks)</strong></td><td class="right">${fmt(contrib.total)}</td></tr></tfoot></table>`
    )
  }

  const printAllChecksReport = () => {
    const rows = allChecks.map(c =>
      `<tr><td>${c.payer_name || 'Unknown'}</td><td>${c.check_number || '—'}</td>
       <td>${c.offering_date || '—'}</td><td class="capitalize">${(c.category || 'general').replace('_', ' ')}</td>
       <td>${c.memo || '—'}</td><td class="right">${fmt(c.amount || 0)}</td></tr>`
    ).join('')
    openReport(
      churchName,
      `Check Contributions Report — ${allChecks.length} checks`,
      `<table><thead><tr><th>Payer</th><th>Check #</th><th>Date</th><th>Category</th><th>Memo</th><th class="right">Amount</th></tr></thead>
       <tbody>${rows}</tbody>
       <tfoot><tr><td colspan="5"><strong>Grand Total</strong></td><td class="right">${fmt(totalAmount)}</td></tr></tfoot></table>`
    )
  }

  const printYearEndReport = () => {
    const rows = yearStatements.map(s =>
      `<tr><td>${s.payer_name}</td><td style="text-align:center">${s.count}</td>
       <td>${s.firstDate} — ${s.lastDate}</td><td class="right">${fmt(s.total)}</td></tr>`
    ).join('')
    const yearTotal = yearStatements.reduce((s, r) => s + r.total, 0)
    openReport(
      churchName,
      `Year-End Contribution Summary — ${statementsYear}`,
      `<table><thead><tr><th>Contributor</th><th style="text-align:center">Checks</th><th>Period</th><th class="right">Total</th></tr></thead>
       <tbody>${rows}</tbody>
       <tfoot><tr><td colspan="3"><strong>Grand Total (${yearStatements.length} contributors)</strong></td><td class="right">${fmt(yearTotal)}</td></tr></tfoot></table>`
    )
  }

  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
  }

  // Contributor detail view
  if (selectedContrib) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedContributor(null)}
            className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold">{selectedContrib.payer_name}</h1>
            <p className="text-muted text-sm">{selectedContrib.count} check{selectedContrib.count !== 1 ? 's' : ''} — {fmt(selectedContrib.total)} total</p>
          </div>
          <div className="ml-auto">
            <button onClick={() => printContributorStatement(selectedContrib)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
              <Printer className="w-4 h-4" /> Print Statement
            </button>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(selectedContrib.categories).map(([cat, amount]) => (
            <div key={cat} className="rounded-lg border border-border bg-card p-3 text-center">
              <p className="text-[10px] text-muted uppercase tracking-wider capitalize">{cat.replace('_', ' ')}</p>
              <p className="text-lg font-bold">{fmt(amount)}</p>
            </div>
          ))}
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-[10px] text-muted uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold text-primary">{fmt(selectedContrib.total)}</p>
          </div>
        </div>

        {/* Individual checks */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-card border-b border-border">
                <th className="px-4 py-2 text-left text-xs font-medium text-muted">Date</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted">Check #</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted">Bank</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted">Category</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-muted">Memo</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-muted">Amount</th>
                <th className="px-4 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {selectedContrib.checks.map(c => (
                <tr key={c.id} className="hover:bg-muted-foreground/5">
                  <td className="px-4 py-2">{c.offering_date || '—'}</td>
                  <td className="px-4 py-2">{c.check_number || '—'}</td>
                  <td className="px-4 py-2 text-muted">{c.bank_name || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted-foreground/10 capitalize">
                      {(c.category || 'general').replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{c.memo || '—'}</td>
                  <td className="px-4 py-2 text-right font-bold">{fmt(c.amount || 0)}</td>
                  <td className="px-4 py-2">
                    <button onClick={(e) => {
                      e.stopPropagation()
                      if (confirm(`Delete check #${c.check_number || c.id} from ${c.payer_name}?`))
                        deleteCheckMutation.mutate(c)
                    }}
                      className="p-1 rounded hover:bg-destructive/10 text-muted hover:text-destructive cursor-pointer">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-card border-t-2 border-border font-bold">
                <td colSpan={6} className="px-4 py-2">Total</td>
                <td className="px-4 py-2 text-right text-primary">{fmt(selectedContrib.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Check Contributions</h1>
        <p className="text-muted text-sm">Track individual check contributions and generate statements</p>
      </div>

      {allChecks.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <Receipt className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted font-medium">No check contributions yet</p>
          <p className="text-xs text-muted mt-2 max-w-md mx-auto">
            Upload photos of individual bank checks in Offerings — the AI will extract
            payer name, check number, amount, and memo automatically.
          </p>
        </div>
      ) : (
        <>
          {/* Date range filter */}
          <div className="flex items-center gap-3 flex-wrap">
            <CalendarRange className="w-4 h-4 text-muted" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              placeholder="From"
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            <span className="text-xs text-muted">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              placeholder="To"
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }}
                className="text-xs text-muted hover:text-foreground cursor-pointer">Clear</button>
            )}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search payer, check #, memo..."
                value={filterText} onChange={e => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1"><Wallet className="w-4 h-4" /> Checks</div>
              <p className="text-xl font-bold">{allChecks.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1"><DollarSign className="w-4 h-4" /> Total Amount</div>
              <p className="text-xl font-bold text-primary">{fmt(totalAmount)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-muted text-sm mb-1"><Users className="w-4 h-4" /> Contributors</div>
              <p className="text-xl font-bold">{contributors.length}</p>
            </div>
          </div>

          {/* YTD summary */}
          {ytdTotal > 0 && (
            <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted">Year-to-Date ({currentYear}): {ytdChecks.length} checks from {
                new Set(ytdChecks.map(c => c.payer_name || 'Unknown')).size
              } contributors</span>
              <span className="text-xs text-primary font-bold">YTD Total: {fmt(ytdTotal)}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1 border-b border-border">
              {(['checks', 'contributors', 'statements'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                    tab === t ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-foreground'
                  }`}>
                  {t === 'statements' ? 'Year-End' : t === 'checks' ? 'All Checks' : 'Contributors'}
                </button>
              ))}
            </div>
            {/* Report buttons */}
            <div className="flex gap-2">
              {tab === 'checks' && (
                <button onClick={printAllChecksReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-xs cursor-pointer">
                  <FileText className="w-3.5 h-3.5" /> Export All Checks
                </button>
              )}
              {tab === 'statements' && yearStatements.length > 0 && (
                <button onClick={printYearEndReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-xs cursor-pointer">
                  <FileText className="w-3.5 h-3.5" /> Export Year-End
                </button>
              )}
            </div>
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
                    <th className="px-4 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allChecks.map(c => (
                    <tr key={c.id} className="hover:bg-muted-foreground/5 cursor-pointer"
                      onClick={() => { setSelectedContributor(c.payer_name); }}>
                      <td className="px-4 py-2 font-medium text-primary">{c.payer_name || 'Unknown'}</td>
                      <td className="px-4 py-2 text-muted">{c.check_number || '—'}</td>
                      <td className="px-4 py-2 text-xs">{c.offering_date || '—'}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted-foreground/10 capitalize">
                          {(c.category || 'general').replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">{c.memo || '—'}</td>
                      <td className="px-4 py-2 text-right font-bold">{fmt(c.amount || 0)}</td>
                      <td className="px-4 py-2">
                        <button onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`Delete check #${c.check_number || c.id} from ${c.payer_name}?`))
                            deleteCheckMutation.mutate(c)
                        }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted hover:text-destructive cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-card border-t-2 border-border font-bold">
                    <td colSpan={6} className="px-4 py-2">Grand Total</td>
                    <td className="px-4 py-2 text-right text-primary">{fmt(totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {tab === 'contributors' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {contributors.map(c => (
                <div key={c.payer_name}
                  onClick={() => setSelectedContributor(c.payer_name)}
                  className="rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors cursor-pointer">
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
                        <tr key={s.payer_name} className="hover:bg-muted-foreground/5 cursor-pointer"
                          onClick={() => setSelectedContributor(s.payer_name)}>
                          <td className="px-4 py-2 font-medium text-primary">{s.payer_name}</td>
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
