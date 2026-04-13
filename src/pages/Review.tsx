import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import {
  CheckCircle, Loader2, ChevronLeft, ChevronRight,
  Eye, Pencil, Save, RotateCcw, Trash2,
} from 'lucide-react'

type Offering = {
  id: number
  filename: string | null
  offering_date: string | null
  date_conf: string | null
  general: number
  cash: number
  sunday_school: number
  building_fund: number
  misc: number
  notes: string | null
  scan_data: Record<string, unknown> | null
  status: string
  image_path: string | null
  created_at: string
  scan_error: string | null
}

export function ReviewPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Partial<Offering>>({})

  // Fetch pending offerings
  const { data: offerings, isLoading } = useQuery({
    queryKey: ['offerings', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offerings')
        .select('*')
        .in('status', ['uploaded', 'scanned', 'pending'])
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Offering[]
    },
  })

  const selected = offerings?.find(o => o.id === selectedId) || offerings?.[0] || null

  // Get signed URL for the selected image
  const { data: imageUrl } = useQuery({
    queryKey: ['offering-image', selected?.image_path],
    queryFn: async () => {
      if (!selected?.image_path) return null
      const { data } = await supabase.storage
        .from('offering-images')
        .createSignedUrl(selected.image_path, 3600)
      return data?.signedUrl || null
    },
    enabled: !!selected?.image_path,
  })

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('offerings')
        .update({
          status: 'approved',
          locked: 1,
          locked_at: new Date().toISOString(),
          approved_by_email: appUser?.email || null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      setSelectedId(null)
      setEditMode(false)
    },
  })

  // Discard mutation
  const discardMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('offerings')
        .update({
          status: 'discarded',
          locked: 2,
          locked_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      setSelectedId(null)
    },
  })

  // Save edit mutation
  const saveMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Partial<Offering> }) => {
      const { error } = await supabase
        .from('offerings')
        .update({
          offering_date: values.offering_date,
          general: values.general,
          cash: values.cash,
          sunday_school: values.sunday_school,
          building_fund: values.building_fund,
          misc: values.misc,
          notes: values.notes,
          modified_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      setEditMode(false)
    },
  })

  const startEdit = () => {
    if (!selected) return
    setEditValues({
      offering_date: selected.offering_date || '',
      general: selected.general,
      cash: selected.cash,
      sunday_school: selected.sunday_school,
      building_fund: selected.building_fund,
      misc: selected.misc,
      notes: selected.notes || '',
    })
    setEditMode(true)
  }

  const handleSave = () => {
    if (!selected) return
    saveMutation.mutate({ id: selected.id, values: editValues })
  }

  const total = (o: Offering | Partial<Offering>) =>
    (Number(o.general) || 0) +
    (Number(o.cash) || 0) +
    (Number(o.sunday_school) || 0) +
    (Number(o.building_fund) || 0) +
    (Number(o.misc) || 0)

  // Navigate between offerings
  const currentIndex = offerings?.findIndex(o => o.id === (selected?.id)) ?? -1
  const goPrev = () => {
    if (offerings && currentIndex > 0) {
      setSelectedId(offerings[currentIndex - 1].id)
      setEditMode(false)
    }
  }
  const goNext = () => {
    if (offerings && currentIndex < offerings.length - 1) {
      setSelectedId(offerings[currentIndex + 1].id)
      setEditMode(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!offerings || offerings.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Review</h1>
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-muted">No offerings pending review.</p>
          <a href="/offerings" className="text-primary text-sm mt-2 inline-block hover:underline">
            Upload offering images
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review</h1>
          <p className="text-muted text-sm">{offerings.length} offering{offerings.length !== 1 ? 's' : ''} pending</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} disabled={currentIndex <= 0}
            className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 disabled:opacity-30 cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-muted">{currentIndex + 1} / {offerings.length}</span>
          <button onClick={goNext} disabled={currentIndex >= offerings.length - 1}
            className="p-2 rounded-lg border border-border hover:bg-muted-foreground/10 disabled:opacity-30 cursor-pointer">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Image preview */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted" />
                <span className="text-sm font-medium">{selected.filename}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                selected.status === 'scanned' ? 'bg-success/10 text-success' :
                selected.status === 'uploaded' ? 'bg-warning/10 text-warning' :
                'bg-muted-foreground/10 text-muted'
              }`}>
                {selected.status}
              </span>
            </div>
            <div className="p-2 min-h-[300px] flex items-center justify-center bg-black/5">
              {imageUrl ? (
                <img src={imageUrl} alt={selected.filename || ''} className="max-w-full max-h-[500px] object-contain" />
              ) : (
                <p className="text-muted text-sm">No image available</p>
              )}
            </div>
          </div>

          {/* Scan data / edit form */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium">Offering Details</span>
              <div className="flex items-center gap-1">
                {!editMode ? (
                  <button onClick={startEdit}
                    className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                    <Pencil className="w-3 h-3" /> Edit
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditMode(false)}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                      <RotateCcw className="w-3 h-3" /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saveMutation.isPending}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer">
                      <Save className="w-3 h-3" /> Save
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Date */}
              <div>
                <label className="text-xs text-muted">Date</label>
                {editMode ? (
                  <input type="date"
                    value={editValues.offering_date || ''}
                    onChange={e => setEditValues(v => ({ ...v, offering_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                  />
                ) : (
                  <p className="text-sm font-medium">
                    {selected.offering_date || 'Not set'}
                    {selected.date_conf && <span className="text-xs text-muted ml-2">({selected.date_conf})</span>}
                  </p>
                )}
              </div>

              {/* Amount fields */}
              {[
                { key: 'general', label: 'General (Checks)' },
                { key: 'cash', label: 'Cash (Denominations)' },
                { key: 'sunday_school', label: 'Sunday School' },
                { key: 'building_fund', label: 'Building Fund' },
                { key: 'misc', label: 'Miscellaneous' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-muted">{label}</label>
                  {editMode ? (
                    <input type="number" step="0.01"
                      value={editValues[key as keyof typeof editValues] as number ?? 0}
                      onChange={e => setEditValues(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
                      className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background"
                    />
                  ) : (
                    <p className="text-sm font-medium">
                      ${(Number(selected[key as keyof Offering]) || 0).toFixed(2)}
                    </p>
                  )}
                </div>
              ))}

              {/* Total */}
              <div className="pt-2 border-t border-border">
                <label className="text-xs text-muted">Total</label>
                <p className="text-lg font-bold text-primary">
                  ${(editMode ? total(editValues) : total(selected)).toFixed(2)}
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted">Notes</label>
                {editMode ? (
                  <textarea
                    value={(editValues.notes as string) || ''}
                    onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))}
                    rows={2}
                    className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background resize-none"
                  />
                ) : (
                  <p className="text-sm text-muted">{selected.notes || '—'}</p>
                )}
              </div>

              {/* Scan error */}
              {selected.scan_error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {selected.scan_error}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <button
                onClick={() => approveMutation.mutate(selected.id)}
                disabled={approveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-success text-white font-medium text-sm hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve
              </button>
              <button
                onClick={() => discardMutation.mutate(selected.id)}
                disabled={discardMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
