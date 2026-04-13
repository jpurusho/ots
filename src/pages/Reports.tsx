import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  FileText, Download, Loader2, ChevronLeft, ChevronRight, Printer,
  ExternalLink, Share2, ChevronDown, ChevronUp, ArrowUpDown, Search,
} from 'lucide-react'

interface ApprovedOffering {
  id: number
  filename: string | null
  offering_date: string | null
  general: number
  cash: number
  sunday_school: number
  building_fund: number
  misc: number
  notes: string | null
  approved_by_email: string | null
  locked_at: string | null
}

type SortKey = 'offering_date' | 'general' | 'cash' | 'sunday_school' | 'building_fund' | 'misc' | 'total'
type SortDir = 'asc' | 'desc'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const COLUMNS: { key: SortKey; label: string; shortLabel?: string }[] = [
  { key: 'offering_date', label: 'Date' },
  { key: 'general', label: 'General' },
  { key: 'cash', label: 'Cash' },
  { key: 'sunday_school', label: 'Sunday School' },
  { key: 'building_fund', label: 'Building Fund' },
  { key: 'misc', label: 'Miscellaneous' },
  { key: 'total', label: 'Total' },
]

const parseOfferingDate = (d: string | null): Date | null => {
  if (!d) return null
  const slashMatch = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) return new Date(+slashMatch[3], +slashMatch[1] - 1, +slashMatch[2])
  const isoMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return new Date(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3])
  return null
}

const formatDate = (d: string | null) => {
  if (!d) return '—'
  if (d.includes('/')) return d
  const [y, m, day] = d.split('-')
  return `${m}/${day}/${y}`
}

const fmt = (n: number) => n > 0 ? `$${n.toFixed(2)}` : '—'

const rowTotal = (o: ApprovedOffering) =>
  (o.general || 0) + (o.cash || 0) + (o.sunday_school || 0) + (o.building_fund || 0) + (o.misc || 0)

export function ReportsPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('offering_date')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filterText, setFilterText] = useState('')

  const { data: churchName } = useQuery({
    queryKey: ['settings', 'church_name'],
    queryFn: async () => {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'church_name').single()
      return data?.value || 'Offering Report'
    },
  })

  const { data: allApproved, isLoading } = useQuery({
    queryKey: ['offerings', 'approved'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, filename, offering_date, general, cash, sunday_school, building_fund, misc, notes, approved_by_email, locked_at')
        .eq('status', 'approved')
      if (error) throw error
      return data as ApprovedOffering[]
    },
  })

  const offerings = useMemo(() => {
    let filtered = (allApproved || []).filter(o => {
      const d = parseOfferingDate(o.offering_date)
      return d && d.getMonth() === month && d.getFullYear() === year
    })

    // Text filter
    if (filterText) {
      const q = filterText.toLowerCase()
      filtered = filtered.filter(o =>
        (o.offering_date || '').toLowerCase().includes(q) ||
        (o.filename || '').toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q) ||
        rowTotal(o).toFixed(2).includes(q)
      )
    }

    // Sort
    filtered.sort((a, b) => {
      let va: number, vb: number
      if (sortKey === 'offering_date') {
        va = parseOfferingDate(a.offering_date)?.getTime() || 0
        vb = parseOfferingDate(b.offering_date)?.getTime() || 0
      } else if (sortKey === 'total') {
        va = rowTotal(a)
        vb = rowTotal(b)
      } else {
        va = (a[sortKey] as number) || 0
        vb = (b[sortKey] as number) || 0
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })

    return filtered
  }, [allApproved, month, year, sortKey, sortDir, filterText])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'offering_date' ? 'asc' : 'desc')
    }
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const grandTotal = offerings.reduce((acc, o) => ({
    general: acc.general + (o.general || 0),
    cash: acc.cash + (o.cash || 0),
    sunday_school: acc.sunday_school + (o.sunday_school || 0),
    building_fund: acc.building_fund + (o.building_fund || 0),
    misc: acc.misc + (o.misc || 0),
  }), { general: 0, cash: 0, sunday_school: 0, building_fund: 0, misc: 0 })

  const grandTotalSum = grandTotal.general + grandTotal.cash + grandTotal.sunday_school +
    grandTotal.building_fund + grandTotal.misc

  const printPdf = () => {
    const title = churchName || 'Offering Report'
    const html = `<!DOCTYPE html>
<html><head><title>${title} — ${MONTHS[month]} ${year}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 40px; color: #111; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #666; font-weight: normal; margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right; }
  th { text-align: right; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #333; }
  th:first-child, td:first-child { text-align: left; }
  tfoot td { border-top: 2px solid #333; font-weight: bold; }
  @media print { body { margin: 20px; } }
</style></head><body>
<h1>${title}</h1><h2>${MONTHS[month]} ${year}</h2>
<table><thead><tr>
  <th style="text-align:left">Date</th><th>General</th><th>Cash</th><th>Sunday School</th><th>Building Fund</th><th>Misc</th><th>Total</th>
</tr></thead><tbody>${offerings.map(o => `<tr>
  <td style="text-align:left">${formatDate(o.offering_date)}</td>
  <td>${fmt(o.general)}</td><td>${fmt(o.cash)}</td><td>${fmt(o.sunday_school)}</td>
  <td>${fmt(o.building_fund)}</td><td>${fmt(o.misc)}</td>
  <td><strong>$${rowTotal(o).toFixed(2)}</strong></td>
</tr>`).join('')}</tbody><tfoot><tr>
  <td style="text-align:left"><strong>Total</strong></td>
  <td>$${grandTotal.general.toFixed(2)}</td><td>$${grandTotal.cash.toFixed(2)}</td>
  <td>$${grandTotal.sunday_school.toFixed(2)}</td><td>$${grandTotal.building_fund.toFixed(2)}</td>
  <td>$${grandTotal.misc.toFixed(2)}</td>
  <td><strong>$${grandTotalSum.toFixed(2)}</strong></td>
</tr></tfoot></table>
<p style="margin-top:30px;font-size:11px;color:#999">Generated ${new Date().toLocaleDateString()} | OTS v2</p>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300) }
  }

  const exportCsv = () => {
    const headers = 'Date,General,Cash,Sunday School,Building Fund,Miscellaneous,Total\n'
    const rows = offerings.map(o =>
      `${o.offering_date || ''},${o.general},${o.cash},${o.sunday_school},${o.building_fund},${o.misc},${rowTotal(o)}`
    ).join('\n')
    const totalsRow = `Total,${grandTotal.general},${grandTotal.cash},${grandTotal.sunday_school},${grandTotal.building_fund},${grandTotal.misc},${grandTotalSum}`
    const blob = new Blob([headers + rows + '\n' + totalsRow], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `offerings_${MONTHS[month].toLowerCase()}_${year}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const printCard = (o: ApprovedOffering) => {
    const cardHtml = `<!DOCTYPE html><html><head><title>Offering ${formatDate(o.offering_date)}</title>
<style>body{font-family:system-ui,sans-serif;margin:40px;max-width:500px;}
h2{margin:0 0 4px;font-size:16px;}h3{margin:0;color:#666;font-weight:normal;font-size:13px;}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:13px;}
.total{font-weight:bold;font-size:15px;border-top:2px solid #333;margin-top:4px;padding-top:8px;}
.footer{margin-top:20px;font-size:10px;color:#999;}
</style></head><body>
<h2>${churchName || 'Weekly Offering'}</h2><h3>Week of ${formatDate(o.offering_date)}</h3>
<div style="margin-top:16px">
${o.general > 0 ? `<div class="row"><span>General (Checks)</span><span>$${o.general.toFixed(2)}</span></div>` : ''}
${o.cash > 0 ? `<div class="row"><span>Cash (Denominations)</span><span>$${o.cash.toFixed(2)}</span></div>` : ''}
${o.sunday_school > 0 ? `<div class="row"><span>Sunday School</span><span>$${o.sunday_school.toFixed(2)}</span></div>` : ''}
${o.building_fund > 0 ? `<div class="row"><span>Building Fund</span><span>$${o.building_fund.toFixed(2)}</span></div>` : ''}
${o.misc > 0 ? `<div class="row"><span>Miscellaneous</span><span>$${o.misc.toFixed(2)}</span></div>` : ''}
<div class="row total"><span>Total</span><span>$${rowTotal(o).toFixed(2)}</span></div>
</div>
<p class="footer">Generated ${new Date().toLocaleDateString()} | OTS</p>
</body></html>`
    const w = window.open('', '_blank')
    if (w) { w.document.write(cardHtml); w.document.close(); setTimeout(() => w.print(), 300) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted text-sm">{churchName || 'Offerings'} — Monthly Report</p>
        </div>
      </div>

      {/* Month/Year picker */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={prevMonth} className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center min-w-[180px]">
          <p className="text-lg font-bold">{MONTHS[month]} {year}</p>
          <p className="text-xs text-muted">{offerings.length} offerings</p>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : offerings.length > 0 ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'General', value: grandTotal.general, color: 'text-blue-500' },
              { label: 'Cash', value: grandTotal.cash, color: 'text-green-500' },
              { label: 'Sunday School', value: grandTotal.sunday_school, color: 'text-purple-500' },
              { label: 'Building Fund', value: grandTotal.building_fund, color: 'text-orange-500' },
              { label: 'Miscellaneous', value: grandTotal.misc, color: 'text-muted' },
              { label: 'Total', value: grandTotalSum, color: 'text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
                <p className={`text-lg font-bold ${color}`}>${value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Filter + Export bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Filter by date, filename, notes..."
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={printPdf}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
                <Printer className="w-4 h-4" /> Export PDF
              </button>
              <button onClick={exportCsv}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>
          </div>

          {/* Sortable data table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b border-border">
                    {COLUMNS.map(col => (
                      <th key={col.key}
                        onClick={() => toggleSort(col.key)}
                        className={`px-4 py-3 text-xs font-medium text-muted cursor-pointer hover:text-foreground select-none transition-colors ${
                          col.key === 'offering_date' ? 'text-left' : 'text-right'
                        }`}>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 opacity-30" />
                          )}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {offerings.map(o => (
                    <tbody key={o.id}>
                      <tr onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        className="hover:bg-muted-foreground/5 cursor-pointer">
                        <td className="px-4 py-2.5 font-medium">
                          <div className="flex items-center gap-1.5">
                            {expandedId === o.id ? <ChevronUp className="w-3 h-3 text-muted" /> : <ChevronDown className="w-3 h-3 text-muted" />}
                            {formatDate(o.offering_date)}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.general)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.cash)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.sunday_school)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.building_fund)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(o.misc)}</td>
                        <td className="px-4 py-2.5 text-right font-bold">${rowTotal(o).toFixed(2)}</td>
                      </tr>
                      {expandedId === o.id && (
                        <tr>
                          <td colSpan={7} className="px-4 py-3 bg-card/50">
                            <div className="flex items-start justify-between gap-4">
                              <div className="space-y-1 text-xs">
                                <p className="font-medium text-sm mb-2">Week of {formatDate(o.offering_date)}</p>
                                {o.general > 0 && <p>General (Checks): <strong>${o.general.toFixed(2)}</strong></p>}
                                {o.cash > 0 && <p>Cash (Denominations): <strong>${o.cash.toFixed(2)}</strong></p>}
                                {o.sunday_school > 0 && <p>Sunday School: <strong>${o.sunday_school.toFixed(2)}</strong></p>}
                                {o.building_fund > 0 && <p>Building Fund: <strong>${o.building_fund.toFixed(2)}</strong></p>}
                                {o.misc > 0 && <p>Miscellaneous: <strong>${o.misc.toFixed(2)}</strong></p>}
                                <p className="pt-1 font-bold">Total: ${rowTotal(o).toFixed(2)}</p>
                                {o.notes && <p className="text-muted pt-1">{o.notes}</p>}
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                <button onClick={e => { e.stopPropagation(); navigate(`/review?id=${o.id}`) }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                                  <ExternalLink className="w-3 h-3" /> View
                                </button>
                                <button onClick={e => { e.stopPropagation(); printCard(o) }}
                                  className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                                  <Share2 className="w-3 h-3" /> Share Card
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-card border-t-2 border-border font-bold">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right">${grandTotal.general.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${grandTotal.cash.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${grandTotal.sunday_school.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${grandTotal.building_fund.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${grandTotal.misc.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-primary">${grandTotalSum.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted">No approved offerings for {MONTHS[month]} {year}</p>
          <p className="text-xs text-muted mt-1">Upload and approve offerings to see them here</p>
        </div>
      )}
    </div>
  )
}
