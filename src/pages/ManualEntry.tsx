import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { Save, Loader2, CheckCircle, PenLine } from 'lucide-react'
import { logActivity } from '@/lib/activity'

export function ManualEntryPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    offering_date: new Date().toISOString().split('T')[0],
    general: '',
    cash: '',
    sunday_school: '',
    building_fund: '',
    misc: '',
    notes: '',
  })

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('offerings')
        .insert({
          offering_date: form.offering_date,
          general: parseFloat(form.general) || 0,
          cash: parseFloat(form.cash) || 0,
          sunday_school: parseFloat(form.sunday_school) || 0,
          building_fund: parseFloat(form.building_fund) || 0,
          misc: parseFloat(form.misc) || 0,
          notes: form.notes || null,
          source_type: 'manual',
          status: 'scanned',
          created_by_email: appUser?.email || null,
          date_conf: 'high',
        })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      logActivity(appUser?.email || null, 'manual_entry',
        `Manual entry for ${form.offering_date} — $${total.toFixed(2)}`, 'offering')
      setSaved(true)
      setForm({
        offering_date: new Date().toISOString().split('T')[0],
        general: '', cash: '', sunday_school: '', building_fund: '', misc: '', notes: '',
      })
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const total = [form.general, form.cash, form.sunday_school, form.building_fund, form.misc]
    .reduce((sum, v) => sum + (parseFloat(v) || 0), 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (total === 0) return
    mutation.mutate()
  }

  const fields = [
    { key: 'general', label: 'General (Checks)', placeholder: '0.00' },
    { key: 'cash', label: 'Cash (Denominations)', placeholder: '0.00' },
    { key: 'sunday_school', label: 'Sunday School', placeholder: '0.00' },
    { key: 'building_fund', label: 'Building Fund', placeholder: '0.00' },
    { key: 'misc', label: 'Miscellaneous', placeholder: '0.00' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Manual Entry</h1>
        <p className="text-muted text-sm">Enter offering amounts directly without an image</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card overflow-hidden max-w-lg">
        <div className="p-5 space-y-4">
          {/* Date */}
          <div>
            <label className="text-sm font-medium">Offering Date</label>
            <input type="date" required
              value={form.offering_date}
              onChange={e => setForm(f => ({ ...f, offering_date: e.target.value }))}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background" />
          </div>

          {/* Amount fields */}
          {fields.map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="text-sm font-medium">{label}</label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                <input type="number" step="0.01" min="0" placeholder={placeholder}
                  value={form[key as keyof typeof form]}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-border bg-background" />
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="pt-3 border-t border-border flex items-center justify-between">
            <span className="text-sm font-medium">Total</span>
            <span className="text-xl font-bold text-primary">${total.toFixed(2)}</span>
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Any additional notes..."
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border bg-background resize-none" />
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          {saved && (
            <span className="flex items-center gap-1 text-sm text-success">
              <CheckCircle className="w-4 h-4" /> Offering saved — go to Review to approve
            </span>
          )}
          {mutation.error && (
            <span className="text-sm text-destructive">{(mutation.error as Error).message}</span>
          )}
          <div className="ml-auto">
            <button type="submit" disabled={mutation.isPending || total === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 cursor-pointer disabled:opacity-50">
              {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Offering
            </button>
          </div>
        </div>
      </form>

      {/* How it works */}
      <div className="rounded-xl border border-border/50 bg-card/50 p-5 max-w-lg">
        <div className="flex items-center gap-2 mb-2">
          <PenLine className="w-4 h-4 text-muted" />
          <h3 className="text-sm font-medium text-muted">When to use Manual Entry</h3>
        </div>
        <ul className="space-y-1 text-xs text-muted">
          <li>When you have the amounts ready and don't need AI scanning</li>
          <li>For corrections or adjustments to previous weeks</li>
          <li>When the offering slip is too damaged for scanning</li>
        </ul>
      </div>
    </div>
  )
}
