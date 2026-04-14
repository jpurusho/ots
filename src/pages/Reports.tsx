import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  FileText, Download, Loader2, ChevronLeft, ChevronRight, Printer,
  ExternalLink, Share2, ChevronDown, ChevronUp, ArrowUpDown, Search,
  CalendarRange, CloudUpload, Mail,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

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
type ViewMode = 'monthly' | 'range'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

const COLUMNS: { key: SortKey; label: string }[] = [
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

// Shared print helper
function printHtml(title: string, subtitle: string, bodyHtml: string) {
  const html = `<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 40px; color: #111; max-width: 800px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; color: #666; font-weight: normal; margin: 0 0 20px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; border-bottom: 1px solid #ddd; }
  th { font-weight: 600; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #333; }
  .left { text-align: left; } .right { text-align: right; }
  tfoot td { border-top: 2px solid #333; font-weight: bold; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 16px; max-width: 420px; }
  .card h3 { margin: 0 0 2px; font-size: 15px; }
  .card h4 { margin: 0 0 12px; font-size: 12px; color: #666; font-weight: normal; }
  .card .row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; font-size: 13px; }
  .card .total-row { border-top: 2px solid #333; border-bottom: none; font-weight: bold; font-size: 14px; margin-top: 4px; padding-top: 8px; }
  .footer { margin-top: 30px; font-size: 10px; color: #999; }
  .cards-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
  @media print { body { margin: 20px; } .cards-grid { grid-template-columns: repeat(2, 1fr); } }
  @media print and (max-width: 600px) { .cards-grid { grid-template-columns: 1fr; } }
</style></head><body>
<h1>${title}</h1><h2>${subtitle}</h2>
${bodyHtml}
<p class="footer">Generated ${new Date().toLocaleDateString()} | OTS</p>
</body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300) }
}

function buildOfferingCard(churchName: string, o: ApprovedOffering): string {
  const t = rowTotal(o)
  return `<div class="card">
    <h3>${churchName}</h3>
    <h4>Week of ${formatDate(o.offering_date)}</h4>
    ${o.general > 0 ? `<div class="row"><span>General (Checks)</span><span>$${o.general.toFixed(2)}</span></div>` : ''}
    ${o.cash > 0 ? `<div class="row"><span>Cash (Denominations)</span><span>$${o.cash.toFixed(2)}</span></div>` : ''}
    ${o.sunday_school > 0 ? `<div class="row"><span>Sunday School</span><span>$${o.sunday_school.toFixed(2)}</span></div>` : ''}
    ${o.building_fund > 0 ? `<div class="row"><span>Building Fund</span><span>$${o.building_fund.toFixed(2)}</span></div>` : ''}
    ${o.misc > 0 ? `<div class="row"><span>Miscellaneous</span><span>$${o.misc.toFixed(2)}</span></div>` : ''}
    <div class="row total-row"><span>Total</span><span>$${t.toFixed(2)}</span></div>
  </div>`
}

function buildReportTable(offerings: ApprovedOffering[], grandTotal: Record<string, number>, grandTotalSum: number): string {
  const rows = offerings.map(o => `<tr>
    <td class="left">${formatDate(o.offering_date)}</td>
    <td class="right">${fmt(o.general)}</td><td class="right">${fmt(o.cash)}</td>
    <td class="right">${fmt(o.sunday_school)}</td><td class="right">${fmt(o.building_fund)}</td>
    <td class="right">${fmt(o.misc)}</td>
    <td class="right"><strong>$${rowTotal(o).toFixed(2)}</strong></td>
  </tr>`).join('')

  return `<table><thead><tr>
    <th class="left">Date</th><th class="right">General</th><th class="right">Cash</th>
    <th class="right">Sunday School</th><th class="right">Building Fund</th>
    <th class="right">Misc</th><th class="right">Total</th>
  </tr></thead><tbody>${rows}</tbody><tfoot><tr>
    <td class="left"><strong>Total</strong></td>
    <td class="right">$${grandTotal.general.toFixed(2)}</td><td class="right">$${grandTotal.cash.toFixed(2)}</td>
    <td class="right">$${grandTotal.sunday_school.toFixed(2)}</td><td class="right">$${grandTotal.building_fund.toFixed(2)}</td>
    <td class="right">$${grandTotal.misc.toFixed(2)}</td>
    <td class="right"><strong>$${grandTotalSum.toFixed(2)}</strong></td>
  </tr></tfoot></table>`
}

export function ReportsPage() {
  const navigate = useNavigate()
  const now = new Date()
  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
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
      if (!d) return false
      if (viewMode === 'monthly') {
        return d.getMonth() === month && d.getFullYear() === year
      } else {
        const from = dateFrom ? new Date(dateFrom) : null
        const to = dateTo ? new Date(dateTo + 'T23:59:59') : null
        if (from && d < from) return false
        if (to && d > to) return false
        return true
      }
    })

    if (filterText) {
      const q = filterText.toLowerCase()
      filtered = filtered.filter(o =>
        (o.offering_date || '').toLowerCase().includes(q) ||
        (o.filename || '').toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q) ||
        rowTotal(o).toFixed(2).includes(q)
      )
    }

    filtered.sort((a, b) => {
      let va: number, vb: number
      if (sortKey === 'offering_date') {
        va = parseOfferingDate(a.offering_date)?.getTime() || 0
        vb = parseOfferingDate(b.offering_date)?.getTime() || 0
      } else if (sortKey === 'total') {
        va = rowTotal(a); vb = rowTotal(b)
      } else {
        va = (a[sortKey] as number) || 0; vb = (b[sortKey] as number) || 0
      }
      return sortDir === 'asc' ? va - vb : vb - va
    })
    return filtered
  }, [allApproved, month, year, dateFrom, dateTo, viewMode, sortKey, sortDir, filterText])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'offering_date' ? 'asc' : 'desc') }
  }

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1) }

  // Find missing Sundays (only in monthly view, only past dates)
  const missingSundays = useMemo(() => {
    if (viewMode !== 'monthly') return []
    const sundays: string[] = []
    const today = new Date()
    today.setHours(23, 59, 59)
    const d = new Date(year, month, 1)
    while (d.getMonth() === month) {
      if (d.getDay() === 0 && d <= today) {
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        sundays.push(`${mm}/${dd}/${d.getFullYear()}`)
      }
      d.setDate(d.getDate() + 1)
    }
    // Compare by parsed date (not string) to handle format differences
    const offeringTimestamps = new Set(
      offerings.map(o => parseOfferingDate(o.offering_date)?.toDateString()).filter(Boolean)
    )
    return sundays.filter(s => {
      const parsed = parseOfferingDate(s)
      return parsed && !offeringTimestamps.has(parsed.toDateString())
    })
  }, [offerings, month, year, viewMode])

  // Merge offerings and missing Sundays for display
  type DisplayRow = { type: 'offering'; data: ApprovedOffering } | { type: 'missing'; date: string }
  const displayRows = useMemo((): DisplayRow[] => {
    const rows: DisplayRow[] = offerings.map(o => ({ type: 'offering' as const, data: o }))
    for (const date of missingSundays) {
      rows.push({ type: 'missing' as const, date })
    }
    // Sort by date
    rows.sort((a, b) => {
      const dateA = a.type === 'offering' ? a.data.offering_date : a.date
      const dateB = b.type === 'offering' ? b.data.offering_date : b.date
      const da = parseOfferingDate(dateA || '')?.getTime() || 0
      const db = parseOfferingDate(dateB || '')?.getTime() || 0
      return da - db
    })
    return rows
  }, [offerings, missingSundays])

  const grandTotal = offerings.reduce((acc, o) => ({
    general: acc.general + (o.general || 0), cash: acc.cash + (o.cash || 0),
    sunday_school: acc.sunday_school + (o.sunday_school || 0),
    building_fund: acc.building_fund + (o.building_fund || 0), misc: acc.misc + (o.misc || 0),
  }), { general: 0, cash: 0, sunday_school: 0, building_fund: 0, misc: 0 })

  const grandTotalSum = grandTotal.general + grandTotal.cash + grandTotal.sunday_school +
    grandTotal.building_fund + grandTotal.misc

  const periodLabel = viewMode === 'monthly'
    ? `${MONTHS[month]} ${year}`
    : `${dateFrom || 'Start'} to ${dateTo || 'End'}`

  const title = churchName || 'Offering Report'

  // Export functions
  const printReport = () => {
    printHtml(title, periodLabel, buildReportTable(offerings, grandTotal, grandTotalSum))
  }

  const printWeekCard = (o: ApprovedOffering) => {
    printHtml(title, `Week of ${formatDate(o.offering_date)}`, buildOfferingCard(title, o))
  }

  const printAllCards = () => {
    const cards = offerings.map(o => buildOfferingCard(title, o)).join('')
    printHtml(title, periodLabel,
      `<div class="cards-grid">${cards}</div>
       <div style="margin-top:20px;padding-top:12px;border-top:2px solid #333;font-size:14px;font-weight:bold">
         Grand Total: $${grandTotalSum.toFixed(2)} (${offerings.length} week${offerings.length !== 1 ? 's' : ''})
       </div>`)
  }

  const exportCsv = () => {
    const headers = 'Date,General,Cash,Sunday School,Building Fund,Miscellaneous,Total\n'
    const rows = offerings.map(o =>
      `${o.offering_date || ''},${o.general},${o.cash},${o.sunday_school},${o.building_fund},${o.misc},${rowTotal(o)}`
    ).join('\n')
    const totalsRow = `Total,${grandTotal.general},${grandTotal.cash},${grandTotal.sunday_school},${grandTotal.building_fund},${grandTotal.misc},${grandTotalSum}`
    const blob = new Blob([headers + rows + '\n' + totalsRow], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `offerings_${periodLabel.replace(/\s+/g, '_').toLowerCase()}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted text-sm">{title} — {viewMode === 'monthly' ? 'Monthly' : 'Date Range'} Report</p>
        </div>
      </div>

      {/* View mode toggle + date controls */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex gap-1 bg-card border border-border rounded-lg p-0.5">
          <button onClick={() => setViewMode('monthly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors ${
              viewMode === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}>Monthly</button>
          <button onClick={() => setViewMode('range')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer transition-colors flex items-center gap-1 ${
              viewMode === 'range' ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'
            }`}><CalendarRange className="w-3 h-3" /> Date Range</button>
        </div>

        {viewMode === 'monthly' ? (
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-[150px]">
              <p className="text-sm font-bold">{MONTHS[month]} {year}</p>
            </div>
            <button onClick={nextMonth} className="p-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            <span className="text-xs text-muted">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
          </div>
        )}

        <span className="text-xs text-muted">
          {offerings.length} offering{offerings.length !== 1 ? 's' : ''}
          {missingSundays.length > 0 && (
            <span className="text-warning ml-2">{missingSundays.length} missing</span>
          )}
        </span>
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

          {/* Year-to-date summary */}
          {(() => {
            const currentYear = viewMode === 'monthly' ? year : new Date().getFullYear()
            const ytdOfferings = (allApproved || []).filter(o => {
              const d = parseOfferingDate(o.offering_date)
              return d && d.getFullYear() === currentYear
            })
            const ytd = ytdOfferings.reduce((acc, o) => ({
              general: acc.general + (o.general || 0), cash: acc.cash + (o.cash || 0),
              sunday_school: acc.sunday_school + (o.sunday_school || 0),
              building_fund: acc.building_fund + (o.building_fund || 0), misc: acc.misc + (o.misc || 0),
            }), { general: 0, cash: 0, sunday_school: 0, building_fund: 0, misc: 0 })
            const ytdTotal = ytd.general + ytd.cash + ytd.sunday_school + ytd.building_fund + ytd.misc

            return ytdTotal > 0 ? (
              <div className="rounded-lg border border-border/50 bg-card/50 px-4 py-2.5 flex items-center justify-between">
                <span className="text-xs text-muted">Year-to-Date ({currentYear}): {ytdOfferings.length} offerings</span>
                <div className="flex items-center gap-4 text-xs">
                  <span>General: <strong>${ytd.general.toFixed(0)}</strong></span>
                  <span>Cash: <strong>${ytd.cash.toFixed(0)}</strong></span>
                  <span>SS: <strong>${ytd.sunday_school.toFixed(0)}</strong></span>
                  <span>BF: <strong>${ytd.building_fund.toFixed(0)}</strong></span>
                  {ytd.misc > 0 && <span>Misc: <strong>${ytd.misc.toFixed(0)}</strong></span>}
                  <span className="text-primary font-bold">Total: ${ytdTotal.toFixed(2)}</span>
                </div>
              </div>
            ) : null
          })()}

          {/* Filter + Export bar */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Filter..."
                value={filterText} onChange={e => setFilterText(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={printReport}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer">
                <Printer className="w-3.5 h-3.5" /> PDF
              </button>
              <button onClick={printAllCards}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <Share2 className="w-3.5 h-3.5" /> Cards
              </button>
              <button onClick={exportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <Download className="w-3.5 h-3.5" /> CSV
              </button>
              <button onClick={async () => {
                  const reportHtml = buildReportTable(offerings, grandTotal, grandTotalSum)
                  const fullHtml = `<h1>${title}</h1><h2>${periodLabel}</h2>${reportHtml}<p style="font-size:10px;color:#999">Generated ${new Date().toLocaleDateString()}</p>`
                  try {
                    const resp = await fetch(`${BACKEND_URL}/api/drive/upload-report`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        filename: `OTS_Report_${periodLabel.replace(/\s+/g, '_')}.html`,
                        content_base64: btoa(unescape(encodeURIComponent(fullHtml))),
                        mime_type: 'text/html',
                      }),
                    })
                    const data = await resp.json()
                    if (data.success) alert(`Report uploaded to Drive: ${data.name}`)
                    else alert(data.detail || data.error || 'Upload failed')
                  } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <CloudUpload className="w-3.5 h-3.5" /> Drive
              </button>
              <button onClick={async () => {
                  const reportHtml = `<div style="font-family:system-ui,sans-serif;max-width:700px;margin:0 auto">
                    <h2 style="color:#333">${title}</h2><h3 style="color:#666;font-weight:normal">${periodLabel}</h3>
                    ${buildReportTable(offerings, grandTotal, grandTotalSum)}
                    <p style="margin-top:20px;font-size:11px;color:#999">Generated by OTS on ${new Date().toLocaleDateString()}</p></div>`
                  const recipients = prompt('Send report to (comma-separated emails):')
                  if (!recipients) return
                  try {
                    const resp = await fetch(`${BACKEND_URL}/api/email/send`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        to: recipients.split(',').map((e: string) => e.trim()),
                        subject: `${title} — ${periodLabel}`,
                        html_body: reportHtml,
                      }),
                    })
                    const data = await resp.json()
                    if (data.success) alert(data.message)
                    else alert(data.detail || data.error || 'Send failed')
                  } catch (err) { alert(err instanceof Error ? err.message : 'Failed') }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer">
                <Mail className="w-3.5 h-3.5" /> Email
              </button>
            </div>
          </div>

          {/* Sortable data table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[130px]" /> {/* Date */}
                  <col /> {/* General */}
                  <col /> {/* Cash */}
                  <col /> {/* Sunday School */}
                  <col /> {/* Building Fund */}
                  <col /> {/* Miscellaneous */}
                  <col /> {/* Total */}
                </colgroup>
                <thead>
                  <tr className="bg-card border-b border-border">
                    {COLUMNS.map(col => (
                      <th key={col.key} onClick={() => toggleSort(col.key)}
                        className={`px-3 py-3 text-xs font-medium text-muted cursor-pointer hover:text-foreground select-none transition-colors ${
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
                  {displayRows.map((row) => {
                    if (row.type === 'missing') {
                      return (
                        <tr key={`missing-${row.date}`} className="bg-warning/5">
                          <td className="px-3 py-2 font-medium text-warning">
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full bg-warning/30 flex-shrink-0" />
                              {row.date}
                            </div>
                          </td>
                          <td colSpan={6} className="px-3 py-2 text-xs text-warning italic">
                            No offering recorded for this Sunday
                          </td>
                        </tr>
                      )
                    }
                    const o = row.data
                    return (
                      <React.Fragment key={o.id}>
                        <tr onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                          className="hover:bg-muted-foreground/5 cursor-pointer">
                          <td className="px-3 py-2.5 font-medium">
                            <div className="flex items-center gap-1.5">
                              {expandedId === o.id ? <ChevronUp className="w-3 h-3 text-muted" /> : <ChevronDown className="w-3 h-3 text-muted" />}
                              {formatDate(o.offering_date)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">{fmt(o.general)}</td>
                          <td className="px-3 py-2.5 text-right">{fmt(o.cash)}</td>
                          <td className="px-3 py-2.5 text-right">{fmt(o.sunday_school)}</td>
                          <td className="px-3 py-2.5 text-right">{fmt(o.building_fund)}</td>
                          <td className="px-3 py-2.5 text-right">{fmt(o.misc)}</td>
                          <td className="px-3 py-2.5 text-right font-bold">${rowTotal(o).toFixed(2)}</td>
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
                                  <button onClick={e => { e.stopPropagation(); printWeekCard(o) }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                                    <Share2 className="w-3 h-3" /> Share Card
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-card border-t-2 border-border font-bold">
                    <td className="px-3 py-3">Total</td>
                    <td className="px-3 py-3 text-right">${grandTotal.general.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">${grandTotal.cash.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">${grandTotal.sunday_school.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">${grandTotal.building_fund.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right">${grandTotal.misc.toFixed(2)}</td>
                    <td className="px-3 py-3 text-right text-primary">${grandTotalSum.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <FileText className="w-10 h-10 mx-auto text-muted mb-3" />
          <p className="text-muted">No approved offerings for {periodLabel}</p>
          <p className="text-xs text-muted mt-1">Upload and approve offerings to see them here</p>
        </div>
      )}
    </div>
  )
}
