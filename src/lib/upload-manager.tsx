import { createContext, useContext, useState, useRef, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activity'

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000'

export interface UploadResult {
  filename: string
  success: boolean
  offering_id?: number
  scanned?: boolean
  scan_total?: number
  error?: string
}

interface UploadState {
  uploading: boolean
  current: number
  total: number
  currentFile: string
  results: UploadResult[]
}

interface UploadManager {
  state: UploadState
  startUpload: (files: File[], userEmail: string | null) => void
  clearResults: () => void
}

const UploadContext = createContext<UploadManager | undefined>(undefined)

export function UploadProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    current: 0,
    total: 0,
    currentFile: '',
    results: [],
  })
  const abortRef = useRef(false)

  const startUpload = async (files: File[], userEmail: string | null) => {
    if (state.uploading) return
    abortRef.current = false

    setState({
      uploading: true,
      current: 0,
      total: files.length,
      currentFile: '',
      results: [],
    })

    // Refresh session before starting
    await supabase.auth.refreshSession()

    const allResults: UploadResult[] = []

    for (let i = 0; i < files.length; i++) {
      if (abortRef.current) break
      const file = files[i]

      setState(s => ({ ...s, current: i + 1, currentFile: file.name }))

      try {
        // Compute hash for duplicate detection
        const arrayBuffer = await file.arrayBuffer()
        const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const fileHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32)

        // Check for duplicates
        const { data: existingByName } = await supabase
          .from('offerings')
          .select('id, offering_date, status')
          .eq('filename', file.name)
          .limit(1)

        if (existingByName && existingByName.length > 0) {
          const existing = existingByName[0]
          allResults.push({
            filename: file.name,
            success: false,
            error: `Already uploaded (${existing.status}, date: ${existing.offering_date || 'unknown'})`,
          })
          setState(s => ({ ...s, results: [...allResults] }))
          continue
        }

        const { data: existingByHash } = await supabase
          .from('offerings')
          .select('id, filename, offering_date, status')
          .eq('file_hash', fileHash)
          .limit(1)

        if (existingByHash && existingByHash.length > 0) {
          const existing = existingByHash[0]
          allResults.push({
            filename: file.name,
            success: false,
            error: `Duplicate content — same as ${existing.filename}`,
          })
          setState(s => ({ ...s, results: [...allResults] }))
          continue
        }

        // Upload to storage
        const timestamp = Date.now()
        const storagePath = `${new Date().getFullYear()}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

        const { error: storageError } = await supabase.storage
          .from('offering-images')
          .upload(storagePath, file, { contentType: file.type, upsert: false })

        if (storageError) throw storageError

        // Create offering record
        const { data: offering, error: dbError } = await supabase
          .from('offerings')
          .insert({
            filename: file.name,
            file_hash: fileHash,
            image_path: storagePath,
            status: 'uploaded',
            source_type: 'scanned',
            created_by_email: userEmail,
          })
          .select('id')
          .single()

        if (dbError) throw dbError

        // Auto-scan
        let scanned = false
        let scanTotal = 0
        try {
          const scanResp = await fetch(`${BACKEND_URL}/api/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ offering_id: offering.id }),
          })
          const scanData = await scanResp.json()
          scanned = scanData.success === true
          scanTotal = scanData.total || 0
        } catch {
          // Scan failed — user can rescan from Review
        }

        logActivity(userEmail, 'upload',
          `Uploaded ${file.name}${scanned ? ` — scanned $${scanTotal.toFixed(2)}` : ''}`,
          'offering', offering.id)

        allResults.push({
          filename: file.name,
          success: true,
          offering_id: offering.id,
          scanned,
          scan_total: scanTotal,
        })
      } catch (err) {
        allResults.push({
          filename: file.name,
          success: false,
          error: err instanceof Error ? err.message : 'Upload failed',
        })
      }

      setState(s => ({ ...s, results: [...allResults] }))
    }

    setState(s => ({ ...s, uploading: false, currentFile: '' }))
  }

  const clearResults = () => {
    if (!state.uploading) {
      setState({ uploading: false, current: 0, total: 0, currentFile: '', results: [] })
    }
  }

  return (
    <UploadContext.Provider value={{ state, startUpload, clearResults }}>
      {children}
    </UploadContext.Provider>
  )
}

export function useUploadManager() {
  const ctx = useContext(UploadContext)
  if (!ctx) throw new Error('useUploadManager must be used within UploadProvider')
  return ctx
}
