import { useState, useRef, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logActivity } from '@/lib/activity'
import {
  CheckCircle, Loader2, ChevronLeft, ChevronRight,
  Eye, Pencil, Save, RotateCcw, Trash2, FileText, RefreshCw,
} from 'lucide-react'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

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
  scan_data: string | null
  status: string
  image_path: string | null
  created_at: string
  scan_error: string | null
}

interface ScanSection {
  denominations?: Record<string, number>
  items?: Array<{ amount: number; count: number }>
  expr?: string
  total?: number
}

interface ScanData {
  sections?: Record<string, ScanSection>
  categories?: Record<string, { value: number }>
  total?: number
  notes?: string
}

const SECTION_LABELS: Record<string, { label: string; catKey: string }> = {
  general_cash: { label: 'Cash (Denominations)', catKey: 'cash' },
  general_checks: { label: 'General (Checks)', catKey: 'general' },
  sunday_school_cash: { label: 'Sunday School', catKey: 'sunday_school' },
  building_fund_checks: { label: 'Building Fund', catKey: 'building_fund' },
  other_checks: { label: 'Miscellaneous', catKey: 'misc' },
}

const DENOM_ORDER = ['100', '50', '20', '10', '5', '2', '1']

function parseScanData(raw: string | null): ScanData | null {
  if (!raw) return null
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch {
    return null
  }
}

function SectionBreakdown({ sectionKey, section }: { sectionKey: string; section: ScanSection }) {
  const isDenom = !!section.denominations
  const label = SECTION_LABELS[sectionKey]?.label || sectionKey

  return (
    <div className="rounded-lg border border-border/50 bg-background/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <span className="text-sm font-bold">${(section.total || 0).toFixed(2)}</span>
      </div>

      {isDenom && section.denominations && (
        <div className="grid grid-cols-4 gap-1 text-xs">
          {DENOM_ORDER.map(d => {
            const count = section.denominations![d]
            if (!count || count === 0) return null
            return (
              <div key={d} className="flex justify-between px-1.5 py-0.5 bg-card rounded">
                <span className="text-muted">${d}</span>
                <span>&times;{count} = <strong>${parseInt(d) * count}</strong></span>
              </div>
            )
          })}
        </div>
      )}

      {!isDenom && section.items && section.items.length > 0 && (
        <div className="space-y-0.5 text-xs">
          {section.items.map((item, i) => (
            <div key={i} className="flex justify-between px-1.5 py-0.5 bg-card rounded">
              <span className="text-muted">#{i + 1}</span>
              <span>${item.amount} &times; {item.count} = <strong>${item.amount * item.count}</strong></span>
            </div>
          ))}
        </div>
      )}

      {section.expr && (
        <p className="text-[10px] text-muted mt-1 font-mono">{section.expr}</p>
      )}
    </div>
  )
}

export function ReviewPage() {
  const { appUser } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const offeringIdParam = searchParams.get('id')

  const [selectedId, setSelectedId] = useState<number | null>(offeringIdParam ? parseInt(offeringIdParam) : null)
  const [editMode, setEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Partial<Offering>>({})
  const [showNotes, setShowNotes] = useState(false)
  const [viewMode, setViewMode] = useState<'pending' | 'approved'>(offeringIdParam ? 'approved' : 'pending')

  const { data: offerings, isLoading } = useQuery({
    queryKey: ['offerings', viewMode],
    queryFn: async () => {
      let query = supabase.from('offerings').select('*')
      if (viewMode === 'pending') {
        query = query.in('status', ['uploaded', 'scanned', 'pending', 'scan_error'])
      } else {
        query = query.eq('status', 'approved')
      }
      const { data, error } = await query.order('created_at', { ascending: false })
      if (error) throw error
      return data as Offering[]
    },
  })

  const selected = offerings?.find(o => o.id === selectedId) || offerings?.[0] || null
  const scanData = parseScanData(selected?.scan_data ?? null)

  // Image zoom state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0 })
  const imageContainerRef = useRef<HTMLDivElement>(null)

  // Attach wheel listener as non-passive to allow preventDefault (avoids console warnings)
  useEffect(() => {
    const el = imageContainerRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => Math.max(0.5, Math.min(5, z - e.deltaY * 0.002)))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [selected?.id])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoom <= 1) return
    isPanning.current = true
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y }
  }, [zoom, pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return
    setPan({ x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y })
  }, [])

  const handleMouseUp = useCallback(() => { isPanning.current = false }, [])

  const resetZoom = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  const { data: imageUrl } = useQuery({
    queryKey: ['offering-image', selected?.image_path],
    queryFn: async () => {
      if (!selected?.image_path) return null
      // Refresh session to ensure valid JWT for storage access
      await supabase.auth.refreshSession()
      const { data, error } = await supabase.storage
        .from('offering-images')
        .createSignedUrl(selected.image_path, 3600)
      if (error) return null
      return data?.signedUrl || null
    },
    enabled: !!selected?.image_path,
  })

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
      const o = offerings?.find(o => o.id === id)
      logActivity(appUser?.email || null, 'approve',
        `Approved ${o?.filename || `offering #${id}`}`, 'offering', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      setSelectedId(null)
      setEditMode(false)
    },
  })

  const discardMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('offerings')
        .update({ status: 'discarded', locked: 2, locked_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
      const o = offerings?.find(o => o.id === id)
      logActivity(appUser?.email || null, 'discard',
        `Discarded ${o?.filename || `offering #${id}`}`, 'offering', id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      setSelectedId(null)
    },
  })

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

  // Rescan mutation
  const rescanMutation = useMutation({
    mutationFn: async (id: number) => {
      const resp = await fetch(`${BACKEND_URL}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offering_id: id }),
      })
      const data = await resp.json()
      if (!data.success) throw new Error(data.error || data.detail || 'Scan failed')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['offerings'] })
      const o = offerings?.find(o => o.id === selected?.id)
      logActivity(appUser?.email || null, 'rescan',
        `Rescanned ${o?.filename || `offering #${selected?.id}`}`, 'offering', selected?.id)
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
    (Number(o.general) || 0) + (Number(o.cash) || 0) + (Number(o.sunday_school) || 0) +
    (Number(o.building_fund) || 0) + (Number(o.misc) || 0)

  const currentIndex = offerings?.findIndex(o => o.id === selected?.id) ?? -1
  const goPrev = () => { if (offerings && currentIndex > 0) { setSelectedId(offerings[currentIndex - 1].id); setEditMode(false); resetZoom() } }
  const goNext = () => { if (offerings && currentIndex < offerings.length - 1) { setSelectedId(offerings[currentIndex + 1].id); setEditMode(false); resetZoom() } }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
  }

  // Empty state is handled inline below (after the toggle renders)

  const amountFields = [
    { key: 'general', label: 'General (Checks)', sectionKey: 'general_checks' },
    { key: 'cash', label: 'Cash (Denominations)', sectionKey: 'general_cash' },
    { key: 'sunday_school', label: 'Sunday School', sectionKey: 'sunday_school_cash' },
    { key: 'building_fund', label: 'Building Fund', sectionKey: 'building_fund_checks' },
    { key: 'misc', label: 'Miscellaneous', sectionKey: 'other_checks' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Review</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => { setViewMode('pending'); setSelectedId(null); setEditMode(false) }}
              className={`text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                viewMode === 'pending' ? 'bg-warning/10 text-warning font-medium' : 'text-muted hover:text-foreground'
              }`}>
              Pending
            </button>
            <button onClick={() => { setViewMode('approved'); setSelectedId(null); setEditMode(false) }}
              className={`text-xs px-2.5 py-1 rounded-full cursor-pointer transition-colors ${
                viewMode === 'approved' ? 'bg-success/10 text-success font-medium' : 'text-muted hover:text-foreground'
              }`}>
              Approved
            </button>
            <span className="text-xs text-muted ml-1">{offerings?.length || 0} offering{(offerings?.length || 0) !== 1 ? 's' : ''}</span>
          </div>
        </div>
        {offerings && offerings.length > 0 && (
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
        )}
      </div>

      {(!offerings || offerings.length === 0) && (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-muted">
            {viewMode === 'pending' ? 'No offerings pending review.' : 'No approved offerings yet.'}
          </p>
          {viewMode === 'pending' && (
            <a href="/offerings" className="text-primary text-sm mt-2 inline-block hover:underline">Upload offering images</a>
          )}
        </div>
      )}

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Image preview with zoom */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-muted" />
                <span className="text-sm font-medium truncate">{selected.filename}</span>
              </div>
              <div className="flex items-center gap-2">
                {zoom !== 1 && (
                  <button onClick={resetZoom}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border hover:bg-muted-foreground/10 cursor-pointer">
                    {Math.round(zoom * 100)}% — Reset
                  </button>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  selected.status === 'scanned' ? 'bg-success/10 text-success' :
                  selected.status === 'uploaded' ? 'bg-warning/10 text-warning' :
                  'bg-muted-foreground/10 text-muted'
                }`}>
                  {selected.status}
                </span>
              </div>
            </div>
            <div
              ref={imageContainerRef}
              className="min-h-[400px] max-h-[700px] overflow-hidden bg-black/5 flex items-center justify-center select-none"
              style={{ cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={() => { if (zoom === 1) setZoom(2) }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={selected.filename || ''}
                  draggable={false}
                  className="max-w-full max-h-[700px] object-contain transition-transform duration-100"
                  style={{
                    transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
                  }}
                />
              ) : (
                <p className="text-muted text-sm">No image available</p>
              )}
            </div>
            <div className="px-4 py-1.5 border-t border-border text-[10px] text-muted text-center">
              Scroll to zoom &middot; Click to zoom in &middot; Drag to pan
            </div>
          </div>

          {/* Details panel */}
          <div className="rounded-xl border border-border bg-card overflow-hidden flex flex-col">
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Date */}
              <div>
                <label className="text-xs text-muted">Date</label>
                {editMode ? (
                  <input type="date" value={editValues.offering_date || ''}
                    onChange={e => setEditValues(v => ({ ...v, offering_date: e.target.value }))}
                    className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
                ) : (
                  <p className="text-sm font-medium">
                    {selected.offering_date || 'Not set'}
                    {selected.date_conf && <span className="text-xs text-muted ml-2">({selected.date_conf})</span>}
                  </p>
                )}
              </div>

              {/* Amount fields with breakdown */}
              {amountFields.map(({ key, label, sectionKey }) => {
                const section = scanData?.sections?.[sectionKey]
                const value = Number(selected[key as keyof Offering]) || 0

                return (
                  <div key={key}>
                    {editMode ? (
                      <div>
                        <label className="text-xs text-muted">{label}</label>
                        <input type="number" step="0.01"
                          value={editValues[key as keyof typeof editValues] as number ?? 0}
                          onChange={e => setEditValues(v => ({ ...v, [key]: parseFloat(e.target.value) || 0 }))}
                          className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background" />
                        {/* Show breakdown as reference while editing */}
                        {section && <SectionBreakdown sectionKey={sectionKey} section={section} />}
                      </div>
                    ) : value > 0 || section ? (
                      section ? (
                        <SectionBreakdown sectionKey={sectionKey} section={section} />
                      ) : (
                        <div>
                          <label className="text-xs text-muted">{label}</label>
                          <p className="text-sm font-medium">${value.toFixed(2)}</p>
                        </div>
                      )
                    ) : null}
                  </div>
                )
              })}

              {/* Total */}
              <div className="pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-muted">Total</label>
                  <p className="text-lg font-bold text-primary">
                    ${(editMode ? total(editValues) : total(selected)).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Notes toggle */}
              {(selected.notes || scanData?.notes) && (
                <div>
                  {editMode ? (
                    <div>
                      <label className="text-xs text-muted">Notes</label>
                      <textarea value={(editValues.notes as string) || ''}
                        onChange={e => setEditValues(v => ({ ...v, notes: e.target.value }))}
                        rows={3}
                        className="w-full mt-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background resize-none" />
                    </div>
                  ) : (
                    <div>
                      <button onClick={() => setShowNotes(!showNotes)}
                        className="flex items-center gap-1 text-xs text-muted hover:text-foreground cursor-pointer">
                        <FileText className="w-3 h-3" />
                        {showNotes ? 'Hide' : 'Show'} AI Notes
                      </button>
                      {showNotes && (
                        <div className="mt-2 p-3 rounded-lg bg-background/50 border border-border/50 text-xs text-muted whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
                          {scanData?.notes || selected.notes}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Scan/rescan errors */}
              {selected.scan_error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  {selected.scan_error}
                </div>
              )}
              {rescanMutation.error && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  Rescan failed: {(rescanMutation.error as Error).message}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-border flex gap-2">
              <button onClick={() => rescanMutation.mutate(selected.id)}
                disabled={rescanMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted-foreground/10 transition-colors cursor-pointer disabled:opacity-50">
                {rescanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Rescan
              </button>
              <button onClick={() => approveMutation.mutate(selected.id)} disabled={approveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-success text-white font-medium text-sm hover:bg-success/90 transition-colors cursor-pointer disabled:opacity-50">
                {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Approve
              </button>
              <button onClick={() => discardMutation.mutate(selected.id)} disabled={discardMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive/30 text-destructive text-sm hover:bg-destructive/10 transition-colors cursor-pointer disabled:opacity-50">
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
