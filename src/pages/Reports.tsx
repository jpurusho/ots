import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { FileText, Download, Loader2, ChevronLeft, ChevronRight } from 'lucide-react'

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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export function ReportsPage() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())

  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const endDate = month === 11
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 2).padStart(2, '0')}-01`

  const { data: offerings, isLoading } = useQuery({
    queryKey: ['offerings', 'approved', year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('id, filename, offering_date, general, cash, sunday_school, building_fund, misc, notes, approved_by_email, locked_at')
        .eq('status', 'approved')
        .gte('offering_date', startDate)
        .lt('offering_date', endDate)
        .order('offering_date', { ascending: true })
      if (error) throw error
      return data as ApprovedOffering[]
    },
  })

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const grandTotal = (offerings || []).reduce((acc, o) => ({
    general: acc.general + (o.general || 0),
    cash: acc.cash + (o.cash || 0),
    sunday_school: acc.sunday_school + (o.sunday_school || 0),
    building_fund: acc.building_fund + (o.building_fund || 0),
    misc: acc.misc + (o.misc || 0),
  }), { general: 0, cash: 0, sunday_school: 0, building_fund: 0, misc: 0 })

  const grandTotalSum = grandTotal.general + grandTotal.cash + grandTotal.sunday_school +
    grandTotal.building_fund + grandTotal.misc

  const formatDate = (d: string | null) => {
    if (!d) return '—'
    const [y, m, day] = d.split('-')
    return `${m}/${day}/${y}`
  }

  const fmt = (n: number) => n > 0 ? `$${n.toFixed(2)}` : '—'

  const rowTotal = (o: ApprovedOffering) =>
    (o.general || 0) + (o.cash || 0) + (o.sunday_school || 0) + (o.building_fund || 0) + (o.misc || 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-muted text-sm">Approved offerings summary</p>
        </div>
      </div>

      {/* Month/Year picker */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={prevMonth}
          className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center min-w-[180px]">
          <p className="text-lg font-bold">{MONTHS[month]} {year}</p>
          <p className="text-xs text-muted">{offerings?.length || 0} offerings</p>
        </div>
        <button onClick={nextMonth}
          className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 cursor-pointer">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : offerings && offerings.length > 0 ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'General', value: grandTotal.general, color: 'text-blue-500' },
              { label: 'Cash', value: grandTotal.cash, color: 'text-green-500' },
              { label: 'Sunday School', value: grandTotal.sunday_school, color: 'text-purple-500' },
              { label: 'Building Fund', value: grandTotal.building_fund, color: 'text-orange-500' },
              { label: 'Misc', value: grandTotal.misc, color: 'text-muted' },
              { label: 'Total', value: grandTotalSum, color: 'text-primary' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3 text-center">
                <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
                <p className={`text-lg font-bold ${color}`}>${value.toFixed(2)}</p>
              </div>
            ))}
          </div>

          {/* Data table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-card border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">General</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">Cash</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">SS</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">BF</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">Misc</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {offerings.map(o => (
                    <tr key={o.id} className="hover:bg-muted-foreground/5">
                      <td className="px-4 py-2.5 font-medium">{formatDate(o.offering_date)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.general)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.cash)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.sunday_school)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.building_fund)}</td>
                      <td className="px-4 py-2.5 text-right">{fmt(o.misc)}</td>
                      <td className="px-4 py-2.5 text-right font-bold">${rowTotal(o).toFixed(2)}</td>
                    </tr>
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

          {/* Export actions */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                // CSV export
                const headers = 'Date,General,Cash,Sunday School,Building Fund,Misc,Total\n'
                const rows = offerings.map(o =>
                  `${o.offering_date || ''},${o.general},${o.cash},${o.sunday_school},${o.building_fund},${o.misc},${rowTotal(o)}`
                ).join('\n')
                const totalsRow = `Total,${grandTotal.general},${grandTotal.cash},${grandTotal.sunday_school},${grandTotal.building_fund},${grandTotal.misc},${grandTotalSum}`
                const csv = headers + rows + '\n' + totalsRow
                const blob = new Blob([csv], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `offerings_${MONTHS[month].toLowerCase()}_${year}.csv`
                a.click()
                URL.revokeObjectURL(url)
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted-foreground/10 text-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
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
